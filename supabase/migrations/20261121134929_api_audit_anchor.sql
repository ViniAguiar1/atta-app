-- MIG-05 · prova da trilha de auditoria fora do banco (PLANO, MIG-05; ADR 0003; PDD v206 §19.5: "o registro não pode
-- ser editado nem apagado"). Sempre para a frente.
--
-- O verify_chain (MIG-04) pega linha adulterada e elo quebrado, mas não pega quem tem a dona da trilha e REESCREVE a
-- cadeia inteira de forma consistente (recalcula os hashes e acerta a cabeça), nem quem apaga o fim e acerta a cabeça.
-- A âncora resolve: uma cron da Vercel grava todo dia o fim da cadeia (seq e hash) num repositório Git separado e
-- privado, fora do alcance de quem administra o Supabase; a conferência compara as âncoras com a trilha.
-- Estas duas funções são a parte do banco: ler o fim da cadeia e conferir âncoras. Só service_role (o servidor do Next,
-- na rota da cron); ninguém do painel chama. Nada de dado pessoal: só seq, hash e momento.

-- A cabeça da cadeia só a dona lê (MIG-04): a leitura fica numa função da dona, com EXECUTE só para o postgres.
set role audit_owner;

create function audit.anchor_head()
returns table (last_seq bigint, last_hash text)
language sql
stable
security definer
set search_path = ''
as $$
  select h.last_seq, h.last_hash from audit.chain_head h where h.id
$$;

revoke all on function audit.anchor_head() from public, anon, authenticated, service_role;
grant execute on function audit.anchor_head() to postgres;

reset role;

-- ---------------------------------------------------------------------------------------------------------------
-- api.audit_anchor_head: o fim da cadeia para a cron gravar a âncora do dia. broken_at é o verify_chain: com a cadeia
-- quebrada, a cron NÃO grava (ancorar uma cadeia adulterada daria cobertura a ela) e alerta.
-- ---------------------------------------------------------------------------------------------------------------
create function api.audit_anchor_head()
returns table (seq bigint, hash text, event_at timestamptz, broken_at bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select h.last_seq, h.last_hash, (select e.created_at from audit.event e where e.seq = h.last_seq), audit.verify_chain()
    from audit.anchor_head() h
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- api.audit_anchor_check: confere âncoras ([{"seq": n, "hash": "<64 hex>"}, ...], até 400) contra a trilha, com um
-- verify_chain só. Status por âncora:
--   ok           o evento daquele seq ainda tem o hash ancorado;
--   mismatch     o evento existe com outro hash: a cadeia foi reescrita depois da âncora;
--   missing      o evento ancorado sumiu: o fim da cadeia foi apagado (e a cabeça acertada);
--   chain_broken a cadeia já não fecha (linha adulterada ou elo quebrado): vale para todas.
-- ---------------------------------------------------------------------------------------------------------------
create function api.audit_anchor_check(p_anchors jsonb)
returns table (seq bigint, status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_broken boolean;
begin
  if p_anchors is null or jsonb_typeof(p_anchors) <> 'array' or jsonb_array_length(p_anchors) > 400 or exists (
       select 1 from jsonb_array_elements(p_anchors) a
        where jsonb_typeof(a -> 'seq') <> 'number' or (a ->> 'seq') !~ '^[1-9][0-9]{0,18}$'
           or coalesce(a ->> 'hash', '') !~ '^[0-9a-f]{64}$') then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'anchors';
  end if;
  v_broken := audit.verify_chain() is not null;
  return query
    select (a ->> 'seq')::bigint,
           case
             when v_broken then 'chain_broken'
             when e.hash is null then 'missing'
             when e.hash = a ->> 'hash' then 'ok'
             else 'mismatch'
           end
      from jsonb_array_elements(p_anchors) a
      left join audit.event e on e.seq = (a ->> 'seq')::bigint
     order by 1;
end
$$;

-- Só o servidor (service_role, ADR 0004 §1): nem anon nem authenticated.
revoke all on function api.audit_anchor_head(), api.audit_anchor_check(jsonb) from public, anon, authenticated;
grant execute on function api.audit_anchor_head(), api.audit_anchor_check(jsonb) to service_role;
