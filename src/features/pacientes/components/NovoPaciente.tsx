"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import { Monograma } from "@/components/ui/Monograma";
import type { Resultado } from "@/lib/errors";
import { iniciais } from "@/lib/texto/iniciais";
import type { CartaoDaRede, ConsultaDeCpf } from "@/server/pacientes/porta";
import { cadastroSchema, type EntradaDoCadastro } from "../schema";
import { textos } from "../textos";

// Novo paciente (MIG-43): o modal do Simulador ATTA-in, capturas 15 a 18 e print 31 (decisão do dono de 20/11). Regra do
// PDD §10.1 e do dono: o CPF é buscado na rede; novo na rede → cadastro mínimo (patient_register); já na rede, de outra
// clínica → o cadastro existente aparece (contato mascarado, saúde só a contagem) e a recepção vincula sem redigitar;
// já paciente daqui → não cria outro (RN-PAC-01). CPF e dados só no corpo das server actions.

type Acoes = {
  consultar: (e: { cpf: string }) => Promise<Resultado<ConsultaDeCpf>>;
  vincular: (e: { cpf: string }) => Promise<Resultado<{ id: string; situacao: "vinculado" | "ja_paciente" }>>;
  cadastrar: (e: EntradaDoCadastro) => Promise<Resultado<{ id: string; reaproveitado: boolean }>>;
};

type Situacao = { tipo: "aguardando" } | ConsultaDeCpf;
const m = textos.modal;
const VAZIO = { nomeCivil: "", nomeSocial: "", nascimento: "", celular: "", email: "" };

/** "52998224725" → "529.982.247-25", enquanto digita. */
export const formatarCpf = (v: string) =>
  v.replace(/\D/g, "").slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");

export function NovoPaciente({ clinica, acoes }: { clinica: string | null; acoes: Acoes }) {
  const [aberto, setAberto] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={gatilho}
        type="button"
        onClick={() => setAberto(true)}
        className="h-[2.1875rem] rounded-full bg-brand px-4 text-[0.8125rem] font-semibold text-on-brand hover:bg-(--button-primary-hover-bg)"
      >
        {textos.novoPaciente}
      </button>
      {aberto && (
        <Modal
          clinica={clinica}
          acoes={acoes}
          aoFechar={() => {
            setAberto(false);
            gatilho.current?.focus();
          }}
        />
      )}
    </>
  );
}

function Modal({ clinica, acoes, aoFechar }: { clinica: string | null; acoes: Acoes; aoFechar: () => void }) {
  const router = useRouter();
  const idTitulo = useId();
  const primeiro = useRef<HTMLInputElement>(null);
  const [estrangeiro, setEstrangeiro] = useState(false);
  const [documento, setDocumento] = useState("");
  const [situacao, setSituacao] = useState<Situacao>({ tipo: "aguardando" } as Situacao);
  const [dados, setDados] = useState(VAZIO);
  const [invalidos, setInvalidos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  useEffect(() => {
    primeiro.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aoFechar]);

  const tipo = "situacao" in situacao ? situacao.situacao : "aguardando";
  const mostraFormulario = estrangeiro || tipo === "nao_encontrado";
  const podeEnviar = mostraFormulario || tipo === "na_rede";

  const mensagemDe = (code: string) => (code in m.erro ? m.erro[code as keyof typeof m.erro] : m.erro.outro);

  function buscar() {
    setErro(null);
    iniciar(async () => {
      const r = await acoes.consultar({ cpf: documento });
      if (r.ok) setSituacao(r.data);
      else setErro(r.error.code === "VALIDACAO" ? m.cpfInvalido : mensagemDe(r.error.code));
    });
  }

  function enviar() {
    setErro(null);
    if (tipo === "na_rede") {
      iniciar(async () => {
        const r = await acoes.vincular({ cpf: documento });
        if (r.ok) concluir();
        else setErro(mensagemDe(r.error.code));
      });
      return;
    }
    const entrada: EntradaDoCadastro = {
      documento: estrangeiro ? { tipo: "estrangeiro", especie: "rne", numero: documento } : { tipo: "cpf", numero: documento },
      ...dados,
    };
    const lido = cadastroSchema.safeParse(entrada);
    if (!lido.success) {
      setInvalidos([...new Set(lido.error.issues.map((i) => String(i.path[0])))]);
      return;
    }
    setInvalidos([]);
    iniciar(async () => {
      const r = await acoes.cadastrar(entrada);
      if (r.ok) concluir();
      else setErro(mensagemDe(r.error.code));
    });
  }

  function concluir() {
    router.refresh(); // a lista do servidor volta com o paciente novo
    aoFechar();
  }

  const cartao = tipo === "na_rede" ? (situacao as { cartao: CartaoDaRede }).cartao : null;
  const situacaoNoResumo =
    tipo === "aguardando" ? m.resumo.aguardando : tipo === "nao_encontrado" ? m.resumo.primeiraVez : m.resumo.jaExiste;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className="flex max-h-full w-full max-w-[45rem] flex-col overflow-hidden rounded-lg bg-surface-raised shadow-xl"
      >
        <header className="flex items-center gap-3 bg-brand px-4 py-3 text-on-brand">
          <Monograma className="size-6" />
          <div className="flex-1">
            <h2 id={idTitulo} className="font-title text-xl leading-tight">{m.titulo}</h2>
            {clinica && <p className="text-xs text-on-brand/80">{clinica}</p>}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label={m.fechar}
            className="flex size-8 items-center justify-center rounded-md border border-on-brand/40 focus-visible:outline-focus-ring!"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto large:grid-cols-[1fr_15rem]">
          <div className="flex flex-col gap-4 p-4 text-[0.8125rem]">
            <CartaoDeSecao titulo={m.identificacao.titulo} subtitulo={m.identificacao.subtitulo} icone="🪪" nivel={3}>
              <label className="flex min-h-11 items-center gap-3 rounded-md border border-border-functional px-3">
                <input
                  type="checkbox"
                  checked={estrangeiro}
                  onChange={(e) => {
                    setEstrangeiro(e.target.checked);
                    setDocumento("");
                    setSituacao({ tipo: "aguardando" } as Situacao);
                    setErro(null);
                  }}
                  className="size-4"
                />
                {m.estrangeiro}
              </label>
              <Campo rotulo={estrangeiro ? m.rne : m.cpf} ajuda={estrangeiro ? m.rneAjuda : m.cpfAjuda}>
                {(id, ajudaId) => (
                  <div className="flex gap-2">
                    <input
                      ref={primeiro}
                      id={id}
                      aria-describedby={ajudaId}
                      inputMode={estrangeiro ? "text" : "numeric"}
                      autoComplete="off"
                      value={documento}
                      placeholder={estrangeiro ? undefined : m.cpfPlaceholder}
                      onChange={(e) => {
                        setDocumento(estrangeiro ? e.target.value.toUpperCase().slice(0, 20) : formatarCpf(e.target.value));
                        setSituacao({ tipo: "aguardando" } as Situacao);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && !estrangeiro && buscar()}
                      className="h-9 flex-1 rounded-md border border-border-functional px-3 font-mono"
                    />
                    {!estrangeiro && (
                      <button
                        type="button"
                        onClick={buscar}
                        disabled={ocupado || documento.replace(/\D/g, "").length !== 11}
                        className="h-9 rounded-md border border-border-functional px-3 font-medium disabled:opacity-60"
                      >
                        {ocupado && tipo === "aguardando" ? m.buscando : m.buscar}
                      </button>
                    )}
                  </div>
                )}
              </Campo>
              {tipo === "nao_encontrado" && <p className="text-text-secondary">{m.consultaInterna}</p>}
              {tipo === "ja_paciente" && (
                <div role="status" className="rounded-md border border-border border-l-4 border-l-status-negative p-3">
                  <strong>{m.jaExiste.negrito}</strong> {m.jaExiste.texto}
                </div>
              )}
              {cartao && <CartaoDaPessoa cartao={cartao} />}
            </CartaoDeSecao>

            <CartaoDeSecao titulo={m.dados.titulo} subtitulo={m.dados.subtitulo} icone="👤" nivel={3}>
              {!mostraFormulario ? (
                <p className="text-text-secondary">{m.dadosAntes}</p>
              ) : (
                <>
                  <p>{m.dadosNovo}</p>
                  <div className="grid gap-4 medium:grid-cols-2">
                    {(["nomeCivil", "nomeSocial", "nascimento", "celular", "email"] as const).map((c) => (
                      <Campo key={c} rotulo={m.campos[c].rotulo} ajuda={m.campos[c].ajuda} invalido={invalidos.includes(c)}>
                        {(id, ajudaId) => (
                          <input
                            id={id}
                            aria-describedby={ajudaId}
                            aria-invalid={invalidos.includes(c) || undefined}
                            value={dados[c]}
                            placeholder={"placeholder" in m.campos[c] ? (m.campos[c] as { placeholder: string }).placeholder : undefined}
                            inputMode={c === "celular" || c === "nascimento" ? "numeric" : c === "email" ? "email" : "text"}
                            autoComplete="off"
                            onChange={(e) => setDados((d) => ({ ...d, [c]: e.target.value }))}
                            className="h-9 rounded-md border border-border-functional px-3 aria-invalid:border-status-negative"
                          />
                        )}
                      </Campo>
                    ))}
                  </div>
                </>
              )}
            </CartaoDeSecao>
          </div>

          <aside className="flex flex-col gap-3 border-t border-border bg-surface-app p-4 text-[0.8125rem] large:border-t-0 large:border-l">
            <h3 className="text-[0.6875rem] font-semibold tracking-wide uppercase">{m.resumo.titulo}</h3>
            <Item rotulo={estrangeiro ? m.resumo.rne : m.resumo.cpf} valor={documento || null} />
            <div className="flex flex-col gap-1 border-b border-border pb-2">
              <span className="text-[0.6875rem] font-semibold tracking-wide text-text-secondary uppercase">{m.resumo.situacao}</span>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-card px-2 py-0.5 text-xs">
                <span aria-hidden="true" className={`size-1.5 rounded-full ${tipo === "aguardando" ? "bg-text-tertiary" : tipo === "nao_encontrado" ? "bg-text-primary" : "bg-status-pending"}`} />
                {situacaoNoResumo}
              </span>
            </div>
            <Item rotulo={m.resumo.nome} valor={cartao?.nome ?? (dados.nomeSocial || dados.nomeCivil || null)} />
            <Item rotulo={m.resumo.nascimento} valor={cartao?.nascimento?.split("-").reverse().join("/") ?? (dados.nascimento || null)} />
            <Item rotulo={m.resumo.celular} valor={cartao?.contato?.celular ?? (dados.celular || null)} />
            <Item rotulo={m.resumo.email} valor={cartao?.contato?.email ?? (dados.email || null)} />
            <div className="rounded-md border border-border bg-surface-raised p-3">
              <p className="font-semibold">{m.resumo.daRede.titulo}</p>
              <p className="text-xs">{m.resumo.daRede.texto}</p>
            </div>
          </aside>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border p-4">
          <button type="button" onClick={aoFechar} className="h-9 rounded-md border border-border-functional px-4 text-[0.8125rem] font-medium">
            {m.cancelar}
          </button>
          <p role="alert" className="flex-1 text-right text-[0.8125rem] text-status-negative">{erro}</p>
          {podeEnviar && (
            <button
              type="button"
              onClick={enviar}
              disabled={ocupado}
              className="h-9 rounded-md bg-brand px-4 text-[0.8125rem] font-semibold text-on-brand disabled:opacity-60"
            >
              {ocupado ? m.enviando : m.cadastrar}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function CartaoDaPessoa({ cartao }: { cartao: CartaoDaRede }) {
  return (
    <div className="flex flex-col gap-2">
      <p>{m.naRede.texto}</p>
      <div className="flex gap-3 rounded-md bg-surface-app p-3">
        <span aria-hidden="true" className="flex size-[2.125rem] shrink-0 items-center justify-center rounded-full bg-surface-card text-xs font-semibold">
          {iniciais(cartao.nome)}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">{cartao.nome}</span>
          <span className="text-xs text-text-secondary">{m.naRede.linha(cartao.nomeCivil, cartao.nascimento)}</span>
          {cartao.contato && (
            <span className="text-xs text-text-secondary">{[cartao.contato.celular, cartao.contato.email].filter(Boolean).join(" · ")}</span>
          )}
          {cartao.selo && <span className="w-fit rounded-full bg-surface-card px-2 py-0.5 text-xs">{m.naRede.selo}</span>}
          <span className="text-xs text-text-secondary">{m.naRede.saude(cartao.respostasDeSaude)}</span>
        </div>
      </div>
    </div>
  );
}

function Campo({ rotulo, ajuda, invalido, children }: { rotulo: string; ajuda: string; invalido?: boolean; children: (id: string, ajudaId: string) => ReactNode }) {
  const id = useId();
  const ajudaId = `${id}-ajuda`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">{rotulo}</label>
      {children(id, ajudaId)}
      <p id={ajudaId} className={`text-xs ${invalido ? "text-status-negative" : "text-text-secondary"}`}>
        {invalido ? `${m.erroCampo} ${ajuda}` : ajuda}
      </p>
    </div>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border pb-2">
      <span className="text-[0.6875rem] font-semibold tracking-wide text-text-secondary uppercase">{rotulo}</span>
      <span>{valor ?? "—"}</span>
    </div>
  );
}
