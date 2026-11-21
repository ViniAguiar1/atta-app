-- MIG-21: bucket privado 'documents' (nome do schema) dos arquivos dos documentos (pedido do Tech Lead, 21/11; PROpass real na nuvem). Dono: BE1.
-- O PNG da assinatura (e depois os PDFs) sobe já CIFRADO pelo servidor (getCofre('documents'), ADR 0002 §6), no
-- caminho <tenant_id>/<document_id>/…; a leitura também passa pelo servidor. Por isso:
--   - bucket não público, só application/octet-stream (o conteúdo é sempre cifra; imagem ou PDF em claro é recusado
--     pelo próprio Storage) e até 25 MiB + 1 KiB por arquivo (o
--     limite do stored_object mais a folga do envelope da cifra; revisão do TL no #217);
--   - NENHUMA policy em storage.objects para este bucket: com o RLS do Storage ligado, anon e authenticated não leem,
--     não listam, não gravam e não apagam nada aqui. Só o service_role (servidor), que passa por cima do RLS.
-- Criado por migration (e não pelo [storage.buckets] do config.toml) para valer igual no local, no CI e na nuvem,
-- com o mesmo db push. Idempotente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26215424, array['application/octet-stream'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
