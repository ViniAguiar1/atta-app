-- MIG-48 (Configurações › Termos & Políticas, ADR 0001 §"Configurações › Termos & Políticas"; dono: Backend 2):
-- Políticas de Consentimento da clínica com a ATTA (PDD v206 §10.6.3, "Políticas de Consentimento (2 toggles)"):
--   - divulgacao_cliente: "Divulgação como cliente" (nome e logotipo da clínica no site, em materiais comerciais e nas
--     redes da ATTA; Termo de Adesão 12.6). Padrão desativado, só em Configurações, não no onboarding;
--   - comunicacoes_novidades: "Comunicações e Novidades" (changelog e avisos por canais fora da plataforma; não é
--     marketing a paciente). Padrão desativado; o gestor ativa no onboarding ou em Configurações.
-- "a ativação e a desativação registram data, hora e usuário" (§10.6.3): cada mudança vai para a trilha
-- tenant.consent_update (chave e valor; o usuário e o horário são do próprio evento). Não existem toggles de IA nem de
-- uso anônimo de dados (§10.6.3, decisão da PO).
-- Só o gestor (Configurações é dele, §10.4.3): settings view para ler e edit para gravar. Sem linha = desativado.

create table platform.tenant_consent (
  tenant_id uuid not null references platform.tenant (id) on delete cascade,
  key text not null,
  granted boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (tenant_id, key),
  constraint tenant_consent_key_check check (key in ('divulgacao_cliente', 'comunicacoes_novidades'))
);
-- RLS forçada e sem acesso direto: só pelas funções abaixo
alter table platform.tenant_consent enable row level security;
alter table platform.tenant_consent force row level security;
revoke all on platform.tenant_consent from public, anon, authenticated, service_role;

insert into audit.action (action, kind) values ('tenant.consent_update', 'change') on conflict (action) do nothing;

create function api.tenant_consents_get() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  return (select jsonb_object_agg(k.key, jsonb_build_object('granted', coalesce(c.granted, false),
                                                            'updated_at', c.updated_at))
          from (values ('divulgacao_cliente'), ('comunicacoes_novidades')) k (key)
          left join platform.tenant_consent c on c.tenant_id = v_tenant and c.key = k.key);
end;
$$;
revoke all on function api.tenant_consents_get() from public, anon;
grant execute on function api.tenant_consents_get() to authenticated;

create function api.tenant_consent_set(p_key text, p_granted boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_before boolean;
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_key is null or p_key not in ('divulgacao_cliente', 'comunicacoes_novidades') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'key';
  end if;
  if p_granted is null then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'granted';
  end if;
  select c.granted into v_before from platform.tenant_consent c
  where c.tenant_id = v_tenant and c.key = p_key for update;
  v_before := coalesce(v_before, false);
  -- só a mudança vai para a trilha (ligar o que já está ligado não registra nada de novo)
  if v_before is distinct from p_granted then
    insert into platform.tenant_consent as c (tenant_id, key, granted)
    values (v_tenant, p_key, p_granted)
    on conflict (tenant_id, key) do update set granted = excluded.granted, updated_at = now(), updated_by = auth.uid();
    perform audit.record_event('tenant.consent_update', 'platform.tenant_consent', null,
      jsonb_build_object('key', p_key), jsonb_build_object('granted', v_before), jsonb_build_object('granted', p_granted));
  end if;
  return jsonb_build_object('key', p_key, 'granted', p_granted);
end;
$$;
revoke all on function api.tenant_consent_set(text, boolean) from public, anon;
grant execute on function api.tenant_consent_set(text, boolean) to authenticated;
