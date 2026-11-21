-- MIG-21: a chave pública do selo de produção está no manifesto, vigente desde antes de qualquer selo.
begin;
select plan(5);

select is((select count(*)::int from documents.seal_key where kid = 'seal-2026-11'), 1, 'kid seal-2026-11 no manifesto');
select is((select alg from documents.seal_key where kid = 'seal-2026-11'), 'Ed25519', 'Ed25519');
select is((select substr(public_key_spki, 1, 12) from documents.seal_key where kid = 'seal-2026-11'),
  '\x302a300506032b6570032100'::bytea, 'SPKI DER com o prefixo Ed25519 (44 bytes pelo check da tabela)');
select ok((select valid_from < now() and valid_until is null from documents.seal_key where kid = 'seal-2026-11'),
  'vigente: valid_from no passado e sem valid_until');
select throws_ok($$ update documents.seal_key set public_key_spki = decode(repeat('00', 44), 'hex') where kid = 'seal-2026-11' $$,
  'P0001', 'ATTA-IN-0002', 'a chave publicada não muda');

select * from finish();
rollback;
