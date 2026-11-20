-- MIG-20 (parte 4): excluir um Serviço que é o único procedimento de algum termo Ativo é recusado. Decisão do dono
-- (PLANO, R15; o PDD §10.3.1 é omisso no caso). Trava definida pelo Tech Lead na ADR 0001 §1 ("Excluir Serviço que
-- é o único procedimento…"): fica no banco, porque a exclusão lógica entra por UPDATE direto (grant de settings.edit).
-- Desativar o Serviço (active = false) fica fora da regra. A mensagem e a server action são do Backend 2, que lê os
-- termos que travam por api.atta_in_service_delete_blockers. Sempre para a frente.

-- Termos Ativos (fora o Termo de Autorização do profissional, que não é de procedimento) que ficariam sem nenhum
-- outro Serviço vivo se p_service_id saísse. Um lugar só: o gatilho e a função de leitura usam esta.
create function private.service_delete_blockers(p_tenant_id uuid, p_service_id uuid)
returns table (template_id uuid, title text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.title
  from documents.template t
  where t.tenant_id = p_tenant_id
    and t.status = 'ativo'
    and t.kind <> 'termo_de_autorizacao'
    and exists (select 1 from atta_in.service_document_template l
                where l.tenant_id = t.tenant_id and l.template_id = t.id and l.clinic_service_id = p_service_id)
    and not exists (select 1 from atta_in.service_document_template l
                    join atta_in.clinic_service c on c.tenant_id = l.tenant_id and c.id = l.clinic_service_id
                    where l.tenant_id = t.tenant_id and l.template_id = t.id
                      and c.id <> p_service_id and c.deleted_at is null)
  order by lower(t.title), t.id
$$;
revoke all on function private.service_delete_blockers(uuid, uuid) from public, anon, authenticated, service_role;

-- Gatilho: só age quando deleted_at passa de nulo a preenchido. SECURITY DEFINER porque quem tem settings.edit pode
-- não enxergar os modelos pela RLS. Contra corrida, em dois comandos:
--   (a) trava com FOR UPDATE os modelos ligados ao Serviço, a mesma linha que template_set_services e o publicar
--       travam. Trava também o Rascunho: assim, uma publicação simultânea (que confere o Serviço vivo antes) e esta
--       exclusão rodam uma depois da outra, e o modelo não vira Ativo com o único Serviço já excluído;
--   (b) num comando seguinte (foto nova em READ COMMITTED), confere quem ficaria sem outro Serviço vivo. Duas
--       exclusões simultâneas de Serviços do mesmo termo: a segunda espera a trava e enxerga a primeira.
create function private.clinic_service_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is not null or new.deleted_at is null then
    return new;
  end if;

  perform 1
  from documents.template t
  where t.tenant_id = new.tenant_id
    and t.status in ('rascunho', 'ativo')
    and t.kind <> 'termo_de_autorizacao'
    and exists (select 1 from atta_in.service_document_template l
                where l.tenant_id = t.tenant_id and l.template_id = t.id and l.clinic_service_id = new.id)
  order by t.id
  for update of t;

  if exists (select 1 from private.service_delete_blockers(new.tenant_id, new.id)) then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0004', detail = 'clinic_service_id';
  end if;
  return new;
end;
$$;
revoke all on function private.clinic_service_guard_delete() from public, anon, authenticated, service_role;

create trigger clinic_service_guard_delete before update of deleted_at on atta_in.clinic_service
  for each row execute function private.clinic_service_guard_delete();

-- Para a tela listar os termos que precisam de outro procedimento antes da exclusão (Backend 2). Exige settings.edit
-- (quem exclui Serviço); Serviço de outra clínica, já excluído ou inexistente: "não encontrado".
create function api.atta_in_service_delete_blockers(p_service_id uuid)
returns table (template_id uuid, title text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if not exists (select 1 from atta_in.clinic_service c
                 where c.id = p_service_id and c.tenant_id = v_tenant and c.deleted_at is null) then
    raise exception using errcode = 'P0002', message = 'ATTA-CORE-0005', detail = 'clinic_service_id';
  end if;
  return query select b.template_id, b.title from private.service_delete_blockers(v_tenant, p_service_id) b;
end;
$$;
revoke all on function api.atta_in_service_delete_blockers(uuid) from public, anon, service_role;
grant execute on function api.atta_in_service_delete_blockers(uuid) to authenticated;
