import { connection } from "next/server";
import { Suspense } from "react";
import { DataState } from "@/components/ui/DataState";
import { Subabas } from "@/components/ui/Subabas";
import { sessaoDoPainel } from "@/features/casca/sessao";
import { arquivarPaciente } from "@/features/pacientes/actions";
import { EstadoDaPasta } from "@/features/pacientes/components/EstadoDaPasta";
import { PastaDoPaciente } from "@/features/pacientes/components/PastaDoPaciente";
import { abrirPasta } from "@/features/pacientes/pasta";
import { SUBABAS_DE_PACIENTES } from "@/features/pacientes/subabas";
import { textos } from "@/features/pacientes/textos";

// Pasta do Paciente (Simulador ATTA-in, capturas 09 e 12; PDD v206 §10: o nome na lista abre a Pasta). O paciente vem
// em ?paciente=<id> (só o id, nunca nome ou CPF): a rota fica fixa, como as outras do painel. Sem paciente, o estado
// vazio. Paciente de outra clínica, id qualquer ou id inválido dão o mesmo "não encontrado", sem dizer se a pessoa existe
// na rede. Sem 404: as abas do painel aparecem sempre (decisão do dono, 20/11).
type Props = { searchParams: Promise<{ paciente?: string | string[] }> };

export default function Page({ searchParams }: Props) {
  return (
    // captura 12: 16 px das subabas ao painel da Pasta
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{textos.subabas.pasta}</h1>
      <Subabas rotulo={textos.subabas.rotulo} itens={SUBABAS_DE_PACIENTES} ativa="/painel/pacientes/pasta" />
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ searchParams }: Props) {
  await connection(); // por requisição: a ficha é da clínica da sessão, e cada abertura fica na Auditoria
  const { paciente } = await searchParams;
  if (paciente === undefined) return <EstadoDaPasta tipo="vazio" titulo={textos.pasta.vazioTitulo} texto={textos.pasta.vazioTexto} />;
  const [ficha, sessao] = await Promise.all([abrirPasta(paciente), sessaoDoPainel()]);
  // só o gestor arquiva (PLANO, decisão do dono de 20/11); o banco confere o papel de novo
  if (ficha.ok) return <PastaDoPaciente ficha={ficha.data} arquivar={sessao?.papel === "ADMIN" ? arquivarPaciente : null} />;
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
