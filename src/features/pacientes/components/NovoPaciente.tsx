"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import { Monograma } from "@/components/ui/Monograma";
import type { Resultado } from "@/lib/errors";
import { iniciais } from "@/lib/texto/iniciais";
import type { CartaoDaRede, ConsultaDeCpf, MotivoDeDivergencia } from "@/server/pacientes/porta";
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
  /** cartão do paciente que já é desta clínica (captura 16), com o contato mascarado no servidor */
  cartao: (e: { id: string }) => Promise<Resultado<CartaoDaRede>>;
  /** "Reportar à ATTA" (RN-PAC-08): motivo da lista fechada, pelo CPF buscado, sem vincular */
  reportar: (e: { cpf: string; motivo: MotivoDeDivergencia }) => Promise<Resultado<{ recebido: true }>>;
};

type Situacao = { tipo: "aguardando" } | ConsultaDeCpf;
const m = textos.modal;
// a lista fechada vem das chaves dos textos (o mesmo conjunto de MOTIVOS_DE_DIVERGENCIA da porta): este componente roda
// no navegador e não pode importar valores de src/server
const MOTIVOS = Object.keys(m.reportar.motivos) as MotivoDeDivergencia[];
const VAZIO = { nomeCivil: "", nomeSocial: "", nascimento: "", celular: "", email: "" };

/** "52998224725" → "529.982.247-25", enquanto digita. */
export const formatarCpf = (v: string) =>
  v.replace(/\D/g, "").slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");

export function NovoPaciente({ clinica, acoes }: { clinica: string | null; acoes: Acoes }) {
  const [aberto, setAberto] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  const jaAbriu = useRef(false);
  // o foco volta ao botão só depois que o <dialog> saiu da tela: enquanto ele é modal, a página atrás está inerte e o
  // focus() no botão não pega (e2e do #167)
  useEffect(() => {
    if (aberto) jaAbriu.current = true;
    else if (jaAbriu.current) gatilho.current?.focus();
  }, [aberto]);
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
          aoFechar={() => setAberto(false)}
        />
      )}
    </>
  );
}

function Modal({ clinica, acoes, aoFechar }: { clinica: string | null; acoes: Acoes; aoFechar: () => void }) {
  const router = useRouter();
  const idTitulo = useId();
  const primeiro = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDialogElement>(null);
  const formulario = useRef<HTMLDivElement>(null);
  const [estrangeiro, setEstrangeiro] = useState(false);
  const [documento, setDocumento] = useState("");
  const [situacao, setSituacao] = useState<Situacao>({ tipo: "aguardando" } as Situacao);
  const [dados, setDados] = useState(VAZIO);
  const [invalidos, setInvalidos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [daClinica, setDaClinica] = useState<CartaoDaRede | null>(null);
  const [reportando, setReportando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoDeDivergencia | null>(null);
  const [reportado, setReportado] = useState(false);
  const linkDoReporte = useRef<HTMLButtonElement>(null);
  const primeiroMotivo = useRef<HTMLInputElement>(null);
  const mensagemDoReporte = useRef<HTMLParagraphElement>(null);
  const reporteAntes = useRef({ reportando: false, reportado: false });
  // o foco acompanha o painel do reporte (os botões somem): abrir → 1º motivo; cancelar → o link; enviar → a mensagem
  useEffect(() => {
    const antes = reporteAntes.current;
    if (reportando && !antes.reportando) primeiroMotivo.current?.focus();
    else if (!reportando && antes.reportando && !reportado) linkDoReporte.current?.focus();
    if (reportado && !antes.reportado) mensagemDoReporte.current?.focus();
    reporteAntes.current = { reportando, reportado };
  }, [reportando, reportado]);
  const [ocupado, iniciar] = useTransition();

  // <dialog> nativo em modo modal (showModal): prende o foco dentro dele, deixa o resto da página inerte e trata o Esc
  // pelo evento cancel (WCAG 2.1.2 e 2.4.3; Tech Lead Frontend e Frontend, #167)
  useEffect(() => {
    const d = caixa.current;
    if (d && !d.open) d.showModal();
    primeiro.current?.focus();
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  // depois da validação, o foco vai ao primeiro campo com problema
  useEffect(() => {
    if (invalidos.length) formulario.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [invalidos]);

  const tipo = "situacao" in situacao ? situacao.situacao : "aguardando";
  const mostraFormulario = estrangeiro || tipo === "nao_encontrado";
  const podeEnviar = mostraFormulario || tipo === "na_rede";

  const mensagemDe = (code: string) => (code in m.erro ? m.erro[code as keyof typeof m.erro] : m.erro.outro);

  function buscar() {
    setErro(null);
    setAviso(null);
    setDaClinica(null);
    setReportando(false);
    setMotivo(null);
    setReportado(false);
    iniciar(async () => {
      const r = await acoes.consultar({ cpf: documento });
      if (!r.ok) return setErro(r.error.code === "VALIDACAO" ? m.cpfInvalido : mensagemDe(r.error.code));
      // já paciente: o cartão dele aparece acima do aviso, como na captura 16; busca antes, para os dois chegarem juntos
      if (r.data.situacao === "ja_paciente") {
        const c = await acoes.cartao({ id: r.data.id });
        if (c.ok) setDaClinica(c.data);
      }
      setSituacao(r.data);
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
      if (!r.ok) return setErro(mensagemDe(r.error.code));
      if (!r.data.reaproveitado) return concluir();
      // o CPF entrou na rede entre a busca e o envio: a pessoa foi reaproveitada (RN-PAC-09). Não fecha como se fosse
      // um cadastro novo: avisa e mostra o estado atual, para a recepção conferir (Frontend, #167)
      setAviso(m.reaproveitado);
      router.refresh();
      const nova = await acoes.consultar({ cpf: documento });
      if (nova.ok) {
        if (nova.data.situacao === "ja_paciente") {
          const c = await acoes.cartao({ id: nova.data.id });
          if (c.ok) setDaClinica(c.data);
        }
        setSituacao(nova.data);
      }
    });
  }

  function reportar() {
    if (!motivo) return;
    setErro(null);
    iniciar(async () => {
      const r = await acoes.reportar({ cpf: documento, motivo });
      if (!r.ok) return setErro(mensagemDe(r.error.code));
      setReportado(true);
      setReportando(false);
    });
  }

  function concluir() {
    router.refresh(); // a lista do servidor volta com o paciente novo
    aoFechar();
  }

  const cartao = tipo === "na_rede" ? (situacao as { cartao: CartaoDaRede }).cartao : tipo === "ja_paciente" ? daClinica : null;
  const situacaoNoResumo =
    tipo === "aguardando" ? m.resumo.aguardando : tipo === "nao_encontrado" ? m.resumo.primeiraVez : m.resumo.jaExiste;

  return (
    <dialog
      ref={caixa}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault(); // o Esc fecha pelo mesmo caminho do ✕, que devolve o foco ao botão
        aoFechar();
      }}
      className="m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-[45rem] overflow-hidden rounded-lg bg-surface-raised p-0 text-text-primary shadow-xl backdrop:bg-text-primary/40"
    >
      <div className="flex max-h-[calc(100vh-2rem)] flex-col">
        <header className="flex items-center gap-3 bg-brand px-4 py-3 text-on-brand">
          <Monograma className="size-6" />
          <div className="flex-1">
            <h2 id={idTitulo} className="font-title text-xl leading-tight">{m.titulo}</h2>
            {clinica && <p className="text-[0.6875rem] text-on-brand/80">{clinica}</p>}
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
          {/* escala do modal da captura (~11 px no corpo, ~10,5 px na ajuda), menor que a das páginas (Tech Lead Frontend, #167) */}
          <div className="flex flex-col gap-3 p-3.5 text-[0.6875rem]">
            <CartaoDeSecao titulo={m.identificacao.titulo} subtitulo={m.identificacao.subtitulo} icone="🪪" nivel={3} compacto>
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
                      className="h-9 flex-1 rounded-md border border-border-functional px-3 font-mono text-xs medium:h-8"
                    />
                    {!estrangeiro && (
                      <button
                        type="button"
                        onClick={buscar}
                        disabled={ocupado || documento.replace(/\D/g, "").length !== 11}
                        className="h-9 rounded-md border border-border-functional px-3 text-xs font-medium disabled:opacity-60 medium:h-8"
                      >
                        {ocupado && tipo === "aguardando" ? m.buscando : m.buscar}
                      </button>
                    )}
                  </div>
                )}
              </Campo>
              {tipo === "nao_encontrado" && <p className="text-text-secondary">{m.consultaInterna}</p>}
              {tipo === "ja_paciente" && daClinica && <CartaoDaPessoa cartao={daClinica} explicar={false} />}
              {tipo === "ja_paciente" && (
                <div role="status" className="rounded-md border border-border border-l-4 border-l-status-negative p-3">
                  <strong>{m.jaExiste.negrito}</strong> {m.jaExiste.texto}
                </div>
              )}
              {tipo === "na_rede" && cartao && <CartaoDaPessoa cartao={cartao} explicar />}
              {/* "Algum dado não confere? Reportar à ATTA" (captura 17; RN-PAC-08): a clínica só reporta, não decide nem
                  bloqueia. Motivo em lista fechada, sem texto livre nem anexo (decisão do dono de 20/11) */}
              {!estrangeiro && tipo !== "aguardando" && (
                <div className="flex flex-col gap-2">
                  {cartao && <p className="text-text-secondary">{m.reportar.explicacao}</p>}
                  {reportado ? (
                    <p ref={mensagemDoReporte} tabIndex={-1} role="status">
                      {m.reportar.enviado}
                    </p>
                  ) : !reportando ? (
                    <button
                      ref={linkDoReporte}
                      type="button"
                      onClick={() => setReportando(true)}
                      className="w-fit font-medium underline underline-offset-2"
                    >
                      {m.reportar.link}
                    </button>
                  ) : (
                    <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
                      <legend className="px-1 text-[0.6875rem] font-semibold">{m.reportar.pergunta}</legend>
                      {MOTIVOS.map((valor, i) => (
                        <label key={valor} className="flex min-h-11 items-center gap-2 medium:min-h-8">
                          <input
                            ref={i === 0 ? primeiroMotivo : undefined}
                            type="radio"
                            name="motivo"
                            value={valor}
                            checked={motivo === valor}
                            onChange={() => setMotivo(valor)}
                            className="size-4"
                          />
                          {m.reportar.motivos[valor]}
                        </label>
                      ))}
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setReportando(false)} className="h-8 rounded-md border border-border-functional px-3 text-xs font-medium">
                          {m.cancelar}
                        </button>
                        <button
                          type="button"
                          onClick={reportar}
                          disabled={!motivo || ocupado}
                          className="h-8 rounded-md bg-brand px-3 text-xs font-semibold text-on-brand disabled:opacity-60"
                        >
                          {m.reportar.enviar}
                        </button>
                      </div>
                    </fieldset>
                  )}
                </div>
              )}
            </CartaoDeSecao>

            <CartaoDeSecao titulo={m.dados.titulo} subtitulo={m.dados.subtitulo} icone="👤" nivel={3} compacto>
              {!mostraFormulario ? (
                <p className="text-text-secondary">{m.dadosAntes}</p>
              ) : (
                <>
                  <p>{m.dadosNovo}</p>
                  <div ref={formulario} className="grid gap-x-4 gap-y-3 medium:grid-cols-2">
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
                            className="h-9 rounded-md border border-border-functional px-3 text-xs aria-invalid:border-status-negative medium:h-8"
                          />
                        )}
                      </Campo>
                    ))}
                  </div>
                </>
              )}
            </CartaoDeSecao>
          </div>

          <aside className="flex flex-col gap-2.5 border-t border-border bg-surface-app p-3.5 text-[0.6875rem] large:border-t-0 large:border-l">
            <h3 className="text-[0.625rem] font-semibold tracking-wide uppercase">{m.resumo.titulo}</h3>
            <Item rotulo={estrangeiro ? m.resumo.rne : m.resumo.cpf} valor={documento || null} />
            <div className="flex flex-col gap-1 border-b border-border pb-2">
              <span className="text-[0.625rem] font-semibold tracking-wide text-text-secondary uppercase">{m.resumo.situacao}</span>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-card px-2 py-0.5 text-[0.625rem]">
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
              <p>{m.resumo.daRede.texto}</p>
            </div>
          </aside>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-3.5 py-3">
          <button type="button" onClick={aoFechar} className="h-9 rounded-md border border-border-functional px-4 text-xs font-medium">
            {m.cancelar}
          </button>
          <div className="flex-1 text-right text-[0.6875rem]">
            <p role="status">{aviso}</p>
            <p role="alert" className="text-status-negative">{erro}</p>
          </div>
          {podeEnviar && (
            <button
              type="button"
              onClick={enviar}
              disabled={ocupado}
              className="h-9 rounded-md bg-brand px-4 text-xs font-semibold text-on-brand disabled:opacity-60"
            >
              {ocupado ? m.enviando : m.cadastrar}
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}

function CartaoDaPessoa({ cartao, explicar }: { cartao: CartaoDaRede; explicar: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {explicar && <p>{m.naRede.texto}</p>}
      <div className="flex gap-3 rounded-md bg-surface-app p-3">
        <span aria-hidden="true" className="flex size-[2.125rem] shrink-0 items-center justify-center rounded-full bg-surface-card text-xs font-semibold">
          {iniciais(cartao.nome)}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">{cartao.nome}</span>
          <span className="text-text-secondary">{m.naRede.linha(cartao.nomeCivil, cartao.nascimento)}</span>
          {cartao.contato && (
            <span className="text-text-secondary">{[cartao.contato.celular, cartao.contato.email].filter(Boolean).join(" · ")}</span>
          )}
          {cartao.selo && <span className="w-fit rounded-full bg-surface-card px-2 py-0.5 text-[0.625rem]">{m.naRede.selo}</span>}
          {cartao.respostasDeSaude !== null && (
            <span className="text-text-secondary">{m.naRede.saude(cartao.respostasDeSaude)}</span>
          )}
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
      <label htmlFor={id} className="text-[0.6875rem] font-semibold">{rotulo}</label>
      {children(id, ajudaId)}
      <p id={ajudaId} className={`text-[0.65625rem] ${invalido ? "text-status-negative" : "text-text-secondary"}`}>
        {invalido ? `${m.erroCampo} ${ajuda}` : ajuda}
      </p>
    </div>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border pb-2">
      <span className="text-[0.625rem] font-semibold tracking-wide text-text-secondary uppercase">{rotulo}</span>
      <span>{valor ?? "—"}</span>
    </div>
  );
}
