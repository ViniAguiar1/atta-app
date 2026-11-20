-- MIG-01 · ADR 0001 §1: os schemas da plataforma e do produto, e os grants de base. Sem tabela de negócio: tenant,
-- membro e papel entram no MIG-02. Sempre para a frente: não se edita esta migration depois que entrar na main.

-- public: vazio, e ninguém cria nada nele (as tabelas moram nos schemas abaixo; o portão pgTAP confere).
revoke create on schema public from public, anon, authenticated, service_role;

-- Expostos na Data API ([api] schemas no config.toml).
create schema if not exists platform;
create schema if not exists documents;
create schema if not exists atta_in;
create schema if not exists api;

-- Fechados: fora da Data API e sem USAGE para anon e authenticated. Só se chega neles por função em `api`
-- (SECURITY DEFINER, search_path vazio, checagem de papel e de tenant). service_role também não ganha USAGE aqui:
-- cada item que precisar (auditoria, saúde, integrações) concede o mínimo na própria migration.
create schema if not exists network;
create schema if not exists health;
create schema if not exists audit;
create schema if not exists integrations;
create schema if not exists billing;
create schema if not exists private;

revoke all on schema platform, documents, atta_in, api from public;
grant usage on schema platform, documents, atta_in, api to anon, authenticated, service_role;

revoke all on schema network, health, audit, integrations, billing, private from public, anon, authenticated, service_role;

-- Nada nasce acessível por padrão: cada tabela dá o próprio grant, explícito e mínimo (ADR 0001 §2), e função nova
-- não nasce executável por qualquer um. O revoke global vem sem IN SCHEMA: o default por schema só soma ao global e
-- não revoga nada (lição da ATIN-81).
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema platform, documents, atta_in, api, network, health, audit,
  integrations, billing, private revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema platform, documents, atta_in, api, network, health, audit,
  integrations, billing, private revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema platform, documents, atta_in, api, network, health, audit,
  integrations, billing, private revoke all on functions from anon, authenticated, service_role;
