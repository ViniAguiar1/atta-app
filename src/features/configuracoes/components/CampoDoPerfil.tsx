"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { cnpjValido, emailValido, mascararCep, mascararCnpj, mascararTelefone, soDigitos } from "@/lib/brasil/documentos";
import type { Erro } from "@/lib/errors";
import type { CampoDaEmpresa } from "@/server/perfil/porta";
import { salvarCampoDoPerfil } from "../actions";
import { textos } from "../textos";

// Um campo do Perfil da Clínica, salvo sozinho (PDD §10.4.1: salvamento automático, campo a campo, sem botão): ao sair do
// campo ou no Enter; a UF logo depois de escolher. CNPJ, CEP e telefones aparecem com máscara e vão só com os dígitos.
// Quem decide formato e obrigatório é o banco; a tela só confere antes o dígito do CNPJ e a estrutura do e-mail (§16.6),
// para responder na hora.
const t = textos.perfil;
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

const MASCARA: Partial<Record<CampoDaEmpresa, (v: string) => string>> = {
  cnpj: mascararCnpj,
  address_cep: mascararCep,
  phone: mascararTelefone,
  clinic_whatsapp: mascararTelefone,
};
const SO_DIGITOS = new Set<CampoDaEmpresa>(["cnpj", "address_cep", "phone", "clinic_whatsapp"]);
// só o 1º preenchimento; depois, só leitura (PDD §10.4.3: a alteração do CNPJ é ação protegida; contrato do TL, ADR 0001)
const PROTEGIDOS = new Set<CampoDaEmpresa>(["cnpj", "legal_name"]);

type Props = {
  campo: CampoDaEmpresa;
  valor: string | null;
  obrigatorio?: boolean;
  fuso: string;
  aoSalvar: (salvoEm: string) => void;
};

const hora = (iso: string, fuso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function mensagem(erro: Erro, campo: CampoDaEmpresa): string {
  if (erro.code === "CONFLITO" && erro.reason?.endsWith("protected_field")) return t.erros.protegido;
  if (erro.code === "VALIDACAO") return campo === "cnpj" ? t.erros.cnpj : t.erros.VALIDACAO;
  if (erro.code === "SEM_PERMISSAO") return t.erros.SEM_PERMISSAO;
  return t.erros.INDISPONIVEL;
}

export function CampoDoPerfil({ campo, valor, obrigatorio = false, fuso, aoSalvar }: Props) {
  const id = useId();
  const mascara = MASCARA[campo];
  const [rascunho, setRascunho] = useState(valor ? (mascara ? mascara(valor) : valor) : "");
  const [salvoAte, setSalvoAte] = useState(valor ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [salvando, executar] = useTransition();
  const { rotulo, ajuda } = t.campos[campo] as { rotulo: string; ajuda?: string };
  const somenteLeitura = PROTEGIDOS.has(campo) && Boolean(salvoAte);
  // 1º preenchimento de um campo que trava depois de gravado: o valor a confirmar antes de salvar (R43)
  const [aConfirmar, setAConfirmar] = useState<string | null>(null);
  const caixa = useRef<HTMLDialogElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const idDoTitulo = useId();

  useEffect(() => {
    const d = caixa.current;
    if (aConfirmar !== null && d && !d.open) d.showModal();
  }, [aConfirmar]);

  function fecharConfirmacao() {
    caixa.current?.close(); // fecha antes do foco voltar: com o dialog modal aberto, a página está inerte (#167)
    setAConfirmar(null);
    entrada.current?.focus();
  }

  function salvar(texto: string, confirmado = false) {
    const normal = SO_DIGITOS.has(campo) ? soDigitos(texto) : texto.trim();
    if (normal === salvoAte) return setErro(null);
    if (campo === "cnpj" && normal && !cnpjValido(normal)) return setErro(t.erros.cnpj);
    if (campo === "commercial_email" && normal && !emailValido(normal)) return setErro(t.erros.email);
    if (PROTEGIDOS.has(campo) && !salvoAte && normal && !confirmado) return setAConfirmar(normal);
    setSalvoEm(null);
    executar(async () => {
      const r = await salvarCampoDoPerfil({ campo, valor: normal || null });
      if (!r.ok) return setErro(mensagem(r.error, campo));
      setErro(null);
      setSalvoAte(normal);
      setSalvoEm(r.data.salvoEm);
      aoSalvar(r.data.salvoEm);
    });
  }

  const comum = {
    id,
    "aria-required": obrigatorio || undefined,
    "aria-invalid": erro ? true : undefined,
    "aria-describedby": `${id}-situacao`,
    className: "min-h-11 w-full rounded-md border border-border-functional bg-surface-raised px-3 text-corpo medium:min-h-9",
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-corpo text-text-secondary">
        {rotulo}
      </label>
      {campo === "address_uf" ? (
        <select
          {...comum}
          value={rascunho}
          onChange={(e) => {
            setRascunho(e.target.value);
            salvar(e.target.value);
          }}
        >
          <option value="">—</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
      ) : somenteLeitura ? (
        <input {...comum} type="text" readOnly value={rascunho} className={`${comum.className} bg-surface-app text-text-secondary`} />
      ) : (
        <input
          {...comum}
          ref={entrada}
          type={campo === "commercial_email" ? "email" : "text"}
          inputMode={SO_DIGITOS.has(campo) ? "numeric" : campo === "commercial_email" ? "email" : undefined}
          autoComplete="off"
          value={rascunho}
          onChange={(e) => setRascunho(mascara ? mascara(e.target.value) : e.target.value)}
          onBlur={() => salvar(rascunho)}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar(rascunho);
          }}
        />
      )}
      {aConfirmar !== null && (
        <dialog
          ref={caixa}
          aria-labelledby={idDoTitulo}
          onCancel={(e) => {
            e.preventDefault();
            fecharConfirmacao();
          }}
          className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-md border border-border bg-surface-raised p-5 text-corpo text-text-primary backdrop:bg-text-primary/40"
        >
          <h2 id={idDoTitulo} className="text-titulo font-semibold">
            {t.confirmar.titulo(rotulo)}
          </h2>
          <p className="mt-3 font-codigo text-sm">{mascara ? mascara(aConfirmar) : aConfirmar}</p>
          <p className="mt-2 text-text-secondary">{t.confirmar.texto}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={fecharConfirmacao} className="min-h-11 rounded-md border border-border-functional px-4 font-medium medium:min-h-9">
              {t.confirmar.voltar}
            </button>
            <button
              type="button"
              onClick={() => {
                const valorConfirmado = aConfirmar;
                caixa.current?.close();
                setAConfirmar(null);
                salvar(valorConfirmado, true);
              }}
              className="min-h-11 rounded-md bg-brand px-4 font-medium text-on-brand medium:min-h-9"
            >
              {t.confirmar.salvar}
            </button>
          </div>
        </dialog>
      )}
      <p id={`${id}-situacao`} aria-live="polite" className={`text-xs ${erro ? "text-status-negative" : "text-text-secondary"}`}>
        {erro ?? (salvando ? textos.salvando : salvoEm ? t.salvoAs(hora(salvoEm, fuso)) : somenteLeitura ? t.protegido : (ajuda ?? ""))}
      </p>
    </div>
  );
}
