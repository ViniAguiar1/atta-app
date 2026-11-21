-- MIG-21: chave PÚBLICA do selo de produção no manifesto (documents.seal_key), para o PROpass real na nuvem (pedido do
-- Tech Lead, 21/11). Sem ela, o private.document_insert_signed_authorization recusa todo envio por 'seal'.
-- Pública por natureza (é o que a verificação pública usa, ADR 0006 §7 e ADR 0014): Ed25519, SPKI DER de 44 bytes.
-- O CTO a calculou da privada, que continua só com ele e na variável sensível da Vercel (nenhum agente a lê), e a
-- conferiu assinando e verificando um texto de teste: Shared/atta/migracao/seguranca/seal-public-key.json.
-- Uma linha só: Preview e Production usam a mesma chave do selo enquanto dividem o banco (ADR 0002 §1).
-- valid_from no passado (antes de qualquer selo) e sem valid_until (vigente). Append-only: on conflict do nothing.
insert into documents.seal_key (kid, alg, public_key_spki, valid_from)
values ('seal-2026-11', 'Ed25519',
        decode('MCowBQYDK2VwAyEA+E8EhRIFGfbQ0TXjKibEhKItrD6IkYSE8jcWHC/YJYk=', 'base64'),
        '2026-11-21T00:00:00Z')
on conflict (kid) do nothing;
