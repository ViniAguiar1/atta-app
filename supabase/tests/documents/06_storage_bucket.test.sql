-- MIG-21: o bucket dos documentos é privado e fechado para anon e authenticated (só o servidor, com service_role).
begin;
select plan(9);

select is((select public from storage.buckets where id = 'documentos'), false, 'bucket documentos existe e não é público');
select is((select allowed_mime_types from storage.buckets where id = 'documentos'), array['application/octet-stream'],
  'só cifra (application/octet-stream)');
select is((select file_size_limit from storage.buckets where id = 'documentos'), 10485760::bigint, 'até 10 MB');
select ok((select c.relrowsecurity from pg_class c where c.oid = 'storage.objects'::regclass), 'RLS ligado em storage.objects');
select is((select count(*)::int from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and (qual ilike '%documentos%' or with_check ilike '%documentos%' or roles && array['anon', 'authenticated', 'public']::name[])),
  0, 'nenhuma policy de storage.objects abre o bucket (nem para anon/authenticated/public)');

-- um arquivo fictício gravado pelo servidor
insert into storage.objects (bucket_id, name, owner_id)
values ('documentos', '00000000-0000-4000-8000-0000000000d1/00000000-0000-4000-8000-0000000000f1/assinatura.bin', null);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
select is((select count(*)::int from storage.objects where bucket_id = 'documentos'), 0, 'authenticated não vê nenhum arquivo');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('documentos', 'x/y/z.bin')$$, '42501', null,
  'authenticated não grava no bucket');

set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'documentos'), 0, 'anon não vê nenhum arquivo');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('documentos', 'x/y/w.bin')$$, '42501', null,
  'anon não grava no bucket');

select * from finish();
rollback;
