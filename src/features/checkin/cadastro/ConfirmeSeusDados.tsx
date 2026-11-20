"use client";

import { useRef, useState, useTransition } from "react";
import { Botao } from "@/components/ui/Botao";
import { TituloDoPasso } from "@/components/ui/TituloDoPasso";
import { buscarCep, salvarDados } from "./actions";
import { camposPendentes, mascararCelular, prepararEnvio, mascararCep, type CampoEditavel, type DadosDoPaciente, type DadosEditaveis } from "./schema";
import { ERRO_PADRAO, ERROS, ROTULOS, TEXTOS } from "./textos";

// "Confirme Seus Dados" (PDD v206 §11.5, decisão da PO): modo leitura no padrão do ATTA me; "Está tudo certo" segue;
// "Editar informações" abre os campos; o que ainda não existe no cadastro já aparece aberto. Nome social: botão
// desmarcado dentro da edição. Endereço pelo CEP. Validação do §16.6, campo a campo, bloqueando o avanço.
type Campo = { nome: CampoEditavel; tipo?: string; modo?: "numeric" | "tel" | "email" | "text"; auto: string; mascara?: (v: string) => string };

const CAMPOS: Campo[] = [
  { nome: "nome", auto: "name" },
  { nome: "celular", tipo: "tel", modo: "tel", auto: "tel-national", mascara: mascararCelular },
  { nome: "email", tipo: "email", modo: "email", auto: "email" },
  { nome: "cep", modo: "numeric", auto: "postal-code", mascara: mascararCep },
  { nome: "logradouro", auto: "address-line1" },
  { nome: "numero", auto: "address-line2" },
  { nome: "complemento", auto: "off" },
  { nome: "bairro", auto: "address-level3" },
  { nome: "cidade", auto: "address-level2" },
  { nome: "uf", auto: "address-level1" },
];

const exibir = (c: Campo, v: string) => (c.mascara ? c.mascara(v) : v);

type Props = { dados: DadosDoPaciente; novo?: boolean; aoConcluir: () => void };

export function ConfirmeSeusDados({ dados, novo = false, aoConcluir }: Props) {
  const { cpfMascarado, convenio, ...inicial } = dados;
  const [valores, setValores] = useState<DadosEditaveis>(inicial);
  const [editando, setEditando] = useState(false);
  const [abertos] = useState(() => new Set(camposPendentes(inicial))); // faltando no cadastro: já abertos
  const [nomeSocial, setNomeSocial] = useState(Boolean(inicial.nomeSocial));
  const [erros, setErros] = useState<CampoEditavel[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, executar] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  const mudar = (campo: CampoEditavel, valor: string) => {
    setValores((v) => ({ ...v, [campo]: campo === "uf" ? valor.toUpperCase().slice(0, 2) : valor }));
    if (campo === "cep" && valor.replace(/\D/g, "").length === 8) {
      setAviso(TEXTOS.buscandoCep);
      executar(async () => {
        const r = await buscarCep(valor.replace(/\D/g, ""));
        // CEP sem endereço limpa o endereço do CEP anterior: o paciente preenche à mão
        const endereco = r.ok ? r.data : { logradouro: "", bairro: "", cidade: "", uf: "" };
        setValores((v) => ({ ...v, ...endereco }));
        setAviso(r.ok ? null : r.error.code === "NAO_AUTENTICADO" ? TEXTOS.sessaoExpirada : TEXTOS.cepSemEndereco);
      });
    }
  };

  function confirmar(evento: React.FormEvent) {
    evento.preventDefault();
    const { enviar, emailIgnorado } = prepararEnvio({ ...valores, nomeSocial: nomeSocial ? valores.nomeSocial : "" });
    const pendentes = camposPendentes(enviar);
    setErros(pendentes);
    if (pendentes.length) {
      if (!editando) setEditando(true);
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`[name="${pendentes[0]}"]`)?.focus());
      return;
    }
    executar(async () => {
      const r = await salvarDados(enviar);
      if (!r.ok) return setAviso(r.error.code === "NAO_AUTENTICADO" ? TEXTOS.sessaoExpirada : TEXTOS.indisponivel);
      setAviso(emailIgnorado ? `${TEXTOS.salvo} ${TEXTOS.emailIgnorado}` : TEXTOS.salvo);
      aoConcluir();
    });
  }

  const aberto = (c: CampoEditavel) => editando || abertos.has(c) || erros.includes(c);

  return (
    <form ref={form} onSubmit={confirmar} noValidate className="flex flex-col gap-6">
      <TituloDoPasso>{TEXTOS.titulo}</TituloDoPasso>
      {novo && <p>{TEXTOS.cadastroNovo}</p>}
      <dl className="flex flex-col gap-4">
        <Linha rotulo={ROTULOS.cpf} valor={cpfMascarado} paraLeitor={`terminado em ${cpfMascarado.replace(/^[·.]+/, "")}`} />
        {CAMPOS.map((c) =>
          aberto(c.nome) ? (
            <CampoAberto key={c.nome} campo={c} valor={exibir(c, valores[c.nome] ?? "")} erro={erros.includes(c.nome)} aoMudar={mudar} />
          ) : (
            <Linha key={c.nome} rotulo={ROTULOS[c.nome]} valor={exibir(c, valores[c.nome] ?? "") || TEXTOS.vazio} />
          ),
        )}
        {convenio && (
          <>
            <Linha rotulo={ROTULOS.convenio} valor={convenio.operadora} />
            <Linha rotulo={ROTULOS.carteirinha} valor={convenio.carteirinha} />
          </>
        )}
      </dl>
      {editando && (
        <div className="flex flex-col gap-4">
          <label className="flex min-h-12 items-center gap-3 font-medium">
            <input type="checkbox" checked={nomeSocial} onChange={(e) => setNomeSocial(e.target.checked)} className="size-6 accent-brand" />
            {TEXTOS.informarNomeSocial}
          </label>
          {nomeSocial && (
            <dl>
              <CampoAberto campo={{ nome: "nomeSocial", auto: "nickname" }} valor={valores.nomeSocial ?? ""} erro={false} aoMudar={mudar} />
            </dl>
          )}
        </div>
      )}
      <p aria-live="polite" className="text-text-secondary">
        {aviso}
      </p>
      <Botao type="submit" disabled={ocupado}>
        {ocupado ? TEXTOS.salvando : TEXTOS.tudoCerto}
      </Botao>
      {!editando && (
        <Botao variante="secundario" onClick={() => setEditando(true)}>
          {TEXTOS.editar}
        </Botao>
      )}
    </form>
  );
}

// paraLeitor: o CPF mascarado (···.···.247-25) seria lido como "ponto médio" seis vezes; o leitor ouve
// "terminado em 247-25" e o texto visual fica fora da árvore de acessibilidade (Backend 1 e 3, ADR 0002 §6).
function Linha({ rotulo, valor, paraLeitor }: { rotulo: string; valor: string; paraLeitor?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-base text-text-secondary">{rotulo}</dt>
      <dd>
        {paraLeitor ? (
          <>
            <span aria-hidden="true">{valor}</span>
            <span className="sr-only">{paraLeitor}</span>
          </>
        ) : (
          valor
        )}
      </dd>
    </div>
  );
}

type CampoAbertoProps = { campo: Campo; valor: string; erro: boolean; aoMudar: (c: CampoEditavel, v: string) => void };

function CampoAberto({ campo, valor, erro, aoMudar }: CampoAbertoProps) {
  const id = `campo-${campo.nome}`;
  return (
    <div className="flex flex-col gap-2">
      <dt>
        <label htmlFor={id} className="font-medium">
          {ROTULOS[campo.nome]}
        </label>
      </dt>
      <dd className="flex flex-col gap-2">
        <input
          id={id}
          name={campo.nome}
          type={campo.tipo ?? "text"}
          inputMode={campo.modo}
          autoComplete={campo.auto}
          value={valor}
          onChange={(e) => aoMudar(campo.nome, e.target.value)}
          aria-invalid={erro || undefined}
          aria-describedby={erro ? `${id}-erro` : undefined}
          className="min-h-12 rounded-md border border-border-functional bg-surface-raised px-4 text-lg"
        />
        {erro && (
          <p id={`${id}-erro`} className="text-status-negative">
            {ERROS[campo.nome] ?? ERRO_PADRAO}
          </p>
        )}
      </dd>
    </div>
  );
}
