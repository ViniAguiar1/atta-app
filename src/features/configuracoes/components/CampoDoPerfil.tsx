"use client";

import { useId, useState, useTransition } from "react";
import { cnpjValido, mascararCep, mascararCnpj, mascararTelefone, soDigitos } from "@/lib/brasil/documentos";
import type { Erro } from "@/lib/errors";
import type { CampoDaEmpresa } from "@/server/perfil/porta";
import { salvarCampoDoPerfil } from "../actions";
import { textos } from "../textos";

// Um campo do Perfil da Clínica, salvo sozinho (PDD §10.4.1: salvamento automático, campo a campo, sem botão): ao sair do
// campo ou no Enter; a UF logo depois de escolher. CNPJ, CEP e telefones aparecem com máscara e vão só com os dígitos.
// Quem decide formato e obrigatório é o banco; a tela só confere o dígito do CNPJ antes, para responder na hora.
const t = textos.perfil;
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;

const MASCARA: Partial<Record<CampoDaEmpresa, (v: string) => string>> = {
  cnpj: mascararCnpj,
  address_cep: mascararCep,
  phone: mascararTelefone,
  clinic_whatsapp: mascararTelefone,
};
const SO_DIGITOS = new Set<CampoDaEmpresa>(["cnpj", "address_cep", "phone", "clinic_whatsapp"]);

type Props = {
  campo: CampoDaEmpresa;
  valor: string | null;
  obrigatorio?: boolean;
  fuso: string;
  aoSalvar: (salvoEm: string) => void;
};

const hora = (iso: string, fuso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function mensagem(erro: Erro, campo: CampoDaEmpresa): string {
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

  function salvar(texto: string) {
    const normal = SO_DIGITOS.has(campo) ? soDigitos(texto) : texto.trim();
    if (normal === salvoAte) return setErro(null);
    if (campo === "cnpj" && normal && !cnpjValido(normal)) return setErro(t.erros.cnpj);
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
      ) : (
        <input
          {...comum}
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
      <p id={`${id}-situacao`} aria-live="polite" className={`text-xs ${erro ? "text-status-negative" : "text-text-secondary"}`}>
        {erro ?? (salvando ? textos.salvando : salvoEm ? t.salvoAs(hora(salvoEm, fuso)) : (ajuda ?? ""))}
      </p>
    </div>
  );
}
