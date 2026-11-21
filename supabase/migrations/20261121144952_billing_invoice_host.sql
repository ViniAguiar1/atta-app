-- MIG-32 (parte 3): o link de fatura só pode ser do Asaas (Segurança, #272). Outro host na tela "Minha Assinatura"
-- (PDD §10.4.8) seria phishing. https, sem usuário, senha ou porta, e host asaas.com ou subdomínio.
alter table billing.payment drop constraint payment_invoice_check;
alter table billing.payment add constraint payment_invoice_check check (
  invoice_url is null or (length(invoice_url) <= 300 and invoice_url ~ '^https://([a-z0-9-]+\.)*asaas\.com(/|$)'));
alter table billing.event drop constraint event_invoice_check;
alter table billing.event add constraint event_invoice_check check (
  invoice_url is null or (length(invoice_url) <= 300 and invoice_url ~ '^https://([a-z0-9-]+\.)*asaas\.com(/|$)'));
