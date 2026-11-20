"use client";

import { useRef, useState, useTransition } from "react";
import { Botao } from "@/components/ui/Botao";
import { TituloDoPasso } from "@/components/ui/TituloDoPasso";
import { mascararCelular, mascararCpf } from "@/lib/brasil/documentos";
import { conferirDados } from "../actions";
import { CONSELHOS, type CampoDosDados, type ConferenciaDoConselho, type DadosDoProfissional, dadosSchema, UFS } from "../schema";
import { ERROS, NOMES_DOS_CONSELHOS, ROTULOS, TEXTOS } from "../textos";

// Passo 1 do PROpass: Confirmação de dados (PDD §10.4.3; simulador, captura 24). O e-mail vem travado do convite; o
// resto é o profissional quem preenche. Erro por campo com aria-describedby e foco no primeiro inválido.
type Props = {
  clinica: string;
  email: string;
  conviteEm: string;
  inicial: DadosDoProfissional;
  aoConferir: (dados: DadosDoProfissional, r: ConferenciaDoConselho) => void;
};

const MASCARAS: Partial<Record<CampoDosDados, (v: string) => string>> = { cpf: mascararCpf, whatsapp: mascararCelular };
const classeDoCampo = "min-h-12 w-full rounded-md border border-border-functional bg-surface-raised px-4";

export function PassoDados({ clinica, email, conviteEm, inicial, aoConferir }: Props) {
  const [dados, setDados] = useState(inicial);
  const [erros, setErros] = useState<Partial<Record<CampoDosDados, string>>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [ocupado, executar] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  const mudar = (campo: CampoDosDados, valor: string) => setDados((d) => ({ ...d, [campo]: MASCARAS[campo]?.(valor) ?? valor }));

  function mostrarErros(novos: Partial<Record<CampoDosDados, string>>) {
    setErros(novos);
    const primeiro = Object.keys(novos)[0];
    if (primeiro) requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`#${primeiro}`)?.focus());
  }

  function continuar(evento: React.FormEvent) {
    evento.preventDefault();
    setErroGeral(null);
    const r = dadosSchema.safeParse(dados);
    if (!r.success) {
      const campos = [...new Set(r.error.issues.map((i) => String(i.path[0]) as CampoDosDados))];
      return mostrarErros(Object.fromEntries(campos.map((c) => [c, ERROS[c]])));
    }
    executar(async () => {
      const resposta = await conferirDados(dados);
      if (!resposta.ok) return setErroGeral(TEXTOS.indisponivel);
      if (resposta.data.situacao === "nao_confere") return mostrarErros({ numero: TEXTOS.conselhoNaoConfere });
      mostrarErros({});
      aoConferir(dados, resposta.data);
    });
  }

  const campo = (id: CampoDosDados, controle: React.ReactNode, ajuda?: string) => {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="font-medium">
          {ROTULOS[id]}
        </label>
        {controle}
        {ajuda && (
          <p id={`${id}-ajuda`} className="text-base text-text-secondary">
            {ajuda}
          </p>
        )}
        {erros[id] && (
          <p id={`${id}-erro`} className="text-status-negative">
            {erros[id]}
          </p>
        )}
      </div>
    );
  };

  const aria = (id: CampoDosDados, ajuda?: boolean) => ({
    id,
    name: id,
    "aria-invalid": erros[id] ? true : undefined,
    "aria-describedby": [erros[id] && `${id}-erro`, ajuda && `${id}-ajuda`].filter(Boolean).join(" ") || undefined,
  });

  return (
    <form ref={form} onSubmit={continuar} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-base font-medium uppercase tracking-wide text-text-secondary">{TEXTOS.passo1}</p>
        <TituloDoPasso>{TEXTOS.saudacao}</TituloDoPasso>
        <p>{TEXTOS.convite(clinica)}</p>
      </div>
      {campo("nome", <input {...aria("nome")} autoComplete="name" value={dados.nome} onChange={(e) => mudar("nome", e.target.value)} className={classeDoCampo} />)}
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="font-medium">
          {ROTULOS.email}
        </label>
        <input id="email" value={email} readOnly aria-describedby="email-ajuda" className={`${classeDoCampo} text-text-secondary`} />
        <p id="email-ajuda" className="text-base text-text-secondary">
          {TEXTOS.ajudaEmail}
        </p>
      </div>
      {campo("cpf", <input {...aria("cpf", true)} inputMode="numeric" autoComplete="off" value={dados.cpf} onChange={(e) => mudar("cpf", e.target.value)} className={classeDoCampo} />, TEXTOS.ajudaCpf)}
      {campo("whatsapp", <input {...aria("whatsapp", true)} type="tel" inputMode="numeric" autoComplete="tel-national" value={dados.whatsapp} onChange={(e) => mudar("whatsapp", e.target.value)} className={classeDoCampo} />, TEXTOS.ajudaWhatsapp)}
      {campo(
        "conselho",
        <select {...aria("conselho")} value={dados.conselho} onChange={(e) => mudar("conselho", e.target.value)} className={classeDoCampo}>
          <option value="" disabled>
            {TEXTOS.selecione}
          </option>
          {CONSELHOS.map((c) => (
            <option key={c} value={c}>
              {NOMES_DOS_CONSELHOS[c]}
            </option>
          ))}
        </select>,
      )}
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        {campo("numero", <input {...aria("numero")} inputMode="numeric" autoComplete="off" value={dados.numero} onChange={(e) => mudar("numero", e.target.value)} className={classeDoCampo} />)}
        {campo(
          "uf",
          <select {...aria("uf")} value={dados.uf} onChange={(e) => mudar("uf", e.target.value)} className={classeDoCampo}>
            <option value="" disabled>
            {TEXTOS.selecione}
          </option>
            {UFS.map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
          </select>,
        )}
      </div>
      {erroGeral && (
        <p role="alert" className="text-status-negative">
          {erroGeral}
        </p>
      )}
      <p className="text-base text-text-secondary">{TEXTOS.conviteEm(conviteEm)}</p>
      <Botao type="submit" disabled={ocupado}>
        {ocupado ? TEXTOS.conferindo : TEXTOS.continuar}
      </Botao>
    </form>
  );
}
