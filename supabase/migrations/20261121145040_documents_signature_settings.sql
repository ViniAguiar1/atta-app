-- Configurações › Assinaturas & Validade (PDD v206 §10.4.2; §16 "Modelo de Assinatura Institucional configurável").
-- Contrato do Tech Lead (ADR 0001, "Modelo de Assinatura da Clínica", 21/11); dono: Backend 6; a tela é do Frontend 5.
--
-- - documents.signature_settings: uma linha por clínica, com o modelo (rt_apenas | profissional_apenas |
--   rt_profissional). Padrão rt_profissional: o PDD diz "RT + Profissional (padrão)" (§16) e marca a opção como
--   "Padrão Recomendado" (§10.4.2). Toda clínica tem a linha: as que já existem, aqui, e as novas, por gatilho. RLS
--   forçada e sem grant: lê e grava só pelas funções.
-- - api.signature_settings_get() (settings.view; ADMIN com aal2, conferido no banco): o modelo e a chancela do preview
--   ("nome fantasia, razão social, CNPJ, RT", §10.4.2), lidos de platform.tenant e platform.tenant_responsible (#296),
--   sem cópia. Com "mesma pessoa que o gestor", o nome do RT é o do gestor. rt_complete vem da regra única do Perfil
--   (private.clinic_profile_missing). Vai para a trilha como leitura, porque leva nome de pessoa (como o Perfil).
-- - api.signature_settings_set(p_model) (settings.edit): grava o modelo e signature.settings_update (antes e depois).
--   Aceita qualquer um dos 3 mesmo sem RT completo: o PDD trava a CONSOLIDAÇÃO, não a escolha ("enquanto faltar CNPJ,
--   gestor ou RT completos, o sistema recusa consolidar documentos", §10.4.1, CA-E01-02; ADR 0001).
-- - documents.document.signature_model: o documento guarda o modelo vigente quando nasce (gatilho); mudar o modelo vale
--   só para os próximos. Os documentos que já existem ficam sem modelo (nasceram antes da configuração).
-- Sempre para a frente.

create table documents.signature_settings (
  tenant_id uuid primary key references platform.tenant (id),
  signature_model text not null default 'rt_profissional'
    constraint signature_settings_model_check check (signature_model in ('rt_apenas', 'profissional_apenas', 'rt_profissional')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table documents.signature_settings enable row level security;
alter table documents.signature_settings force row level security;
revoke all on documents.signature_settings from public, anon, authenticated, service_role;

insert into documents.signature_settings (tenant_id) select t.id from platform.tenant t on conflict do nothing;

create function private.tenant_signature_settings_default() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into documents.signature_settings (tenant_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.tenant_signature_settings_default() from public, anon, authenticated, service_role;
create trigger tenant_signature_settings_default after insert on platform.tenant
  for each row execute function private.tenant_signature_settings_default();

-- o modelo vigente de uma clínica (o padrão se, por algum motivo, a linha faltar)
create function private.signature_model(p_tenant uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.signature_model from documents.signature_settings s where s.tenant_id = p_tenant),
                  'rt_profissional')
$$;
revoke all on function private.signature_model(uuid) from public, anon, authenticated, service_role;

alter table documents.document
  add column signature_model text
    constraint document_signature_model_check
    check (signature_model is null or signature_model in ('rt_apenas', 'profissional_apenas', 'rt_profissional'));

create function private.document_signature_model() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.signature_model := private.signature_model(new.tenant_id);
  return new;
end;
$$;
revoke all on function private.document_signature_model() from public, anon, authenticated, service_role;
create trigger document_signature_model before insert on documents.document
  for each row execute function private.document_signature_model();

insert into audit.action (action, kind) values
  ('signature.settings_read', 'access'),
  ('signature.settings_update', 'change')
on conflict (action) do nothing;

create function api.signature_settings_get() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  t platform.tenant;
  g platform.tenant_responsible;
  r platform.tenant_responsible;
  v_missing text[];
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'view')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  select * into t from platform.tenant where id = v_tenant and deleted_at is null;
  select * into g from platform.tenant_responsible where tenant_id = v_tenant and role = 'manager';
  select * into r from platform.tenant_responsible where tenant_id = v_tenant and role = 'technical_lead';
  v_missing := private.clinic_profile_missing(v_tenant);
  perform audit.record_event('signature.settings_read', 'documents.signature_settings', v_tenant, '{}');
  return jsonb_build_object(
    'signature_model', private.signature_model(v_tenant),
    'trade_name', t.name,
    'legal_name', t.legal_name,
    'cnpj', t.cnpj,
    'technical_lead', jsonb_build_object(
      'same_as_manager', coalesce(r.same_as_manager, false),
      'full_name', case when r.same_as_manager then g.full_name else r.full_name end,
      'council', r.council,
      'council_uf', r.council_uf,
      'council_number', r.council_number),
    -- RT completo pela regra do Perfil: nome, CPF e conselho (com "mesma pessoa", o nome e o CPF do gestor)
    'rt_complete', not (v_missing && array['technical_lead.full_name', 'technical_lead.cpf', 'technical_lead.council',
                                           'technical_lead.council_uf', 'technical_lead.council_number'])
                   and not (coalesce(r.same_as_manager, false) and v_missing && array['manager.full_name', 'manager.cpf']));
end;
$$;
revoke all on function api.signature_settings_get() from public, anon;
grant execute on function api.signature_settings_get() to authenticated;

create function api.signature_settings_set(p_model text) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tenant uuid := (select private.current_tenant_id());
  v_before text;
begin
  if v_tenant is null or not coalesce((select private.has_permission('settings', 'edit')), false) then
    raise exception using errcode = '42501', message = 'ATTA-AUTH-0004';
  end if;
  if p_model is null or p_model not in ('rt_apenas', 'profissional_apenas', 'rt_profissional') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'signature_model';
  end if;
  v_before := private.signature_model(v_tenant);
  insert into documents.signature_settings (tenant_id, signature_model, updated_at, updated_by)
  values (v_tenant, p_model, now(), auth.uid())
  on conflict (tenant_id) do update
    set signature_model = excluded.signature_model, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  perform audit.record_event('signature.settings_update', 'documents.signature_settings', v_tenant, '{}',
    jsonb_build_object('signature_model', v_before), jsonb_build_object('signature_model', p_model));
  return p_model;
end;
$$;
revoke all on function api.signature_settings_set(text) from public, anon;
grant execute on function api.signature_settings_set(text) to authenticated;
