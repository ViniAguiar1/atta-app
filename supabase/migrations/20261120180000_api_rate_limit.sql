-- MIG-24 (plataforma): limitador de tentativas único, decidido na ADR 0004 §2 (proposta do Backend 6, aceita pelo
-- Tech Lead em 20/11). Serve à verificação pública do Código ATTA (PDD v206 §18.6; 30 consultas por minuto por IP,
-- ADR 0006 §6 do atta-platform) e ao check-in (10 por IP e 100 por portal a cada 10 min, ADR 0004 §2).
--
-- Os contadores ficam no banco, porque a Vercel não garante a mesma instância entre pedidos. A chave nunca é o valor
-- cru (IP, portal, usuário): o servidor manda o HMAC-SHA256 com ATTA_CPF_PEPPER e o rótulo
-- `atta.ratelimit.v1|<bucket>|<valor>` (src/server/limite.ts). sha256 simples não serve: IPv4 se reverte por força bruta.
-- Janela fixa por bucket: no limite entre duas janelas passam até 2× o limite, o que é aceito para este uso.
-- Sempre para a frente.

create table private.rate_limit_counter (
  bucket       text not null,
  key_hash     bytea not null,
  window_start timestamptz not null,
  hits         integer not null,
  constraint rate_limit_counter_pk primary key (bucket, key_hash, window_start),
  constraint rate_limit_counter_bucket_check check (bucket ~ '^[a-z][a-z0-9_.]{2,63}$'),
  constraint rate_limit_counter_key_check check (octet_length(key_hash) = 32),
  constraint rate_limit_counter_hits_check check (hits >= 1)
);
create index rate_limit_counter_window_idx on private.rate_limit_counter (bucket, window_start);

alter table private.rate_limit_counter enable row level security;
alter table private.rate_limit_counter force row level security;
revoke all on private.rate_limit_counter from public, anon, authenticated, service_role;

-- Conta um pedido e diz se ele está dentro do limite (true) ou passou (false). Só o servidor chama (service_role),
-- depois de calcular o HMAC; o navegador não pula o limite (ADR 0004 §1). Atômico: o upsert serializa pedidos
-- simultâneos da mesma chave. O contador para em limite + 1, para não crescer sem fim sob ataque.
create function api.rate_limit_hit(p_bucket text, p_key_hash bytea, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_start timestamptz;
  v_hits integer;
begin
  if p_bucket is null or p_bucket !~ '^[a-z][a-z0-9_.]{2,63}$' then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'bucket';
  end if;
  if p_key_hash is null or pg_catalog.octet_length(p_key_hash) <> 32 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'key_hash';
  end if;
  if p_limit is null or p_limit not between 1 and 100000 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'limit';
  end if;
  if p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception using errcode = 'P0001', message = 'ATTA-IN-0001', detail = 'window_seconds';
  end if;

  v_start := pg_catalog.to_timestamp(
    pg_catalog.floor(pg_catalog.date_part('epoch', v_now) / p_window_seconds) * p_window_seconds);

  -- limpeza na própria chamada, sem cron: janelas já vencidas deste bucket, no máximo 500 por vez
  delete from private.rate_limit_counter c
  where (c.bucket, c.key_hash, c.window_start) in (
    select o.bucket, o.key_hash, o.window_start from private.rate_limit_counter o
    where o.bucket = p_bucket and o.window_start < v_start
    limit 500);

  insert into private.rate_limit_counter as c (bucket, key_hash, window_start, hits)
  values (p_bucket, p_key_hash, v_start, 1)
  on conflict (bucket, key_hash, window_start)
  do update set hits = least(c.hits, p_limit) + 1
  returning c.hits into v_hits;

  return v_hits <= p_limit;
end
$$;

revoke all on function api.rate_limit_hit(text, bytea, integer, integer) from public, anon, authenticated;
grant execute on function api.rate_limit_hit(text, bytea, integer, integer) to service_role;
