import { connection } from "next/server";
import { Suspense } from "react";
import { DataState } from "@/components/ui/DataState";
import { Subabas } from "@/components/ui/Subabas";
import { sessaoDoPainel } from "@/features/casca/sessao";
import { arquivarPaciente, maisAgendamentosDaPasta } from "@/features/pacientes/actions";
import { EstadoDaPasta } from "@/features/pacientes/components/EstadoDaPasta";
import { PastaDoPaciente } from "@/features/pacientes/components/PastaDoPaciente";
import { abrirAgendamentos, abrirPasta } from "@/features/pacientes/pasta";
import { SUBABAS_DE_PACIENTES } from "@/features/pacientes/subabas";
import { textos } from "@/features/pacientes/textos";

// Pasta de um paciente (Simulador ATTA-in, capturas 12 a 14; PDD v206 §10: o nome na lista abre a Pasta), em
// /painel/pacientes/pasta/<id>: só o id na URL, nunca nome ou CPF. Paciente de outra clínica, id qualquer ou id inválido
// dão o mesmo "não encontrado", sem dizer se a pessoa existe na rede. Sem 404: as abas do painel aparecem sempre (decisão
// do dono, 20/11). A casca já aceita rota dinâmica (#230).
type Props = { params: Promise<{ id: string }> };

export default function Page({ params }: Props) {
  return (
    // captura 12: 16 px das subabas ao painel da Pasta
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{textos.subabas.pasta}</h1>
      <Subabas rotulo={textos.subabas.rotulo} itens={SUBABAS_DE_PACIENTES} ativa="/painel/pacientes/pasta" />
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params }: Props) {
  await connection(); // por requisição: a ficha é da clínica da sessão, e cada abertura fica na Auditoria
  const { id: paciente } = await params;
  // a ficha, a sessão e os agendamentos em paralelo; a seção de agendamentos não segura a ficha (cada uma com o seu estado)
  const [ficha, sessao, agendamentos] = await Promise.all([abrirPasta(paciente), sessaoDoPainel(), abrirAgendamentos(paciente)]);
  // só o gestor arquiva (PLANO, decisão do dono de 20/11); o banco confere o papel de novo
  if (ficha.ok) {
    return (
      <PastaDoPaciente
        ficha={ficha.data}
        arquivar={sessao?.papel === "ADMIN" ? arquivarPaciente : null}
        agendamentos={agendamentos}
        mais={maisAgendamentosDaPasta}
      />
    );
  }
  if (ficha.error.code === "NAO_ENCONTRADO" || ficha.error.code === "VALIDACAO") return <EstadoDaPasta tipo="vazio" titulo={textos.pasta.naoEncontrado} />;
  return <EstadoDaPasta tipo="erro" codigo={ficha.error.code} />;
}

function Carregando() {
  return (
    <DataState estado={{ tipo: "carregando" }} rotulo={textos.pasta.estado} esqueleto={{ linhas: 8, alturaRem: 2.5 }} vazio={textos.vazio}>
      {null}
    </DataState>
  );
}
