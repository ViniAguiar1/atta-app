import { connection } from "next/server";
import { Suspense } from "react";
import { DataState } from "@/components/ui/DataState";
import { Subabas } from "@/components/ui/Subabas";
import { FluxoDeImportacao } from "@/components/importacao/FluxoDeImportacao";
import { emProducao } from "@/features/casca/abas";
import { sessaoDoPainel } from "@/features/casca/sessao";
import { secaoDisponivel, secaoPorCaminho } from "@/features/configuracoes/secoes";
import { confirmarImportacao, declararImportacao, iniciarEnvioDaImportacao, previaDaImportacao, urlDoModelo } from "@/features/importacao/actions";
import { fusoDaClinica } from "@/features/importacao/queries";
import {
  buscarPacientes,
  cadastrarPaciente,
  cartaoDoPacienteDaClinica,
  consultarCpfNaRede,
  listarPacientes,
  reportarDivergenciaDaRede,
  vincularPacienteDaRede,
} from "@/features/pacientes/actions";
import { CardsDePacientes } from "@/features/pacientes/components/CardsDePacientes";
import { ListaDePacientes } from "@/features/pacientes/components/ListaDePacientes";
import { NovoPaciente } from "@/features/pacientes/components/NovoPaciente";
import { SUBABAS_DE_PACIENTES } from "@/features/pacientes/subabas";
import { textos } from "@/features/pacientes/textos";

// Pacientes (MIG-43), igual ao Simulador ATTA-in, capturas 09 a 11 (decisão do dono de 20/11, PLANO "Abas e fidelidade
// ao simulador"; PDD v206 §10.1): subabas Pacientes · Pasta do Paciente, os 4 cards, a busca e a tabela. As abas do
// painel aparecem sempre (decisão do dono, 20/11): sem 404 nesta rota.
export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">{textos.titulo}</h1>
      <Subabas rotulo={textos.subabas.rotulo} itens={SUBABAS_DE_PACIENTES} ativa="/painel/pacientes" />
      <Suspense fallback={<Carregando />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  await connection(); // por requisição: a lista é da clínica da sessão
  const [inicial, sessao] = await Promise.all([listarPacientes(), sessaoDoPainel()]);
  // "Importar base de pacientes" no módulo Pacientes (PDD v206 §10.1; decisão do CTO de 21/11: o mesmo fluxo de
  // Configurações › Importação). Só o gestor importa, e só onde a seção de importação existe (fora da produção, enquanto a
  // porta do MIG-34 for a simulada): na produção, sem botão que não leva a nada.
  const secao = secaoPorCaminho("importacao");
  const podeImportar = sessao?.papel === "ADMIN" && secao !== undefined && secaoDisponivel(secao, emProducao());
  // o fuso da clínica só é lido quando o botão aparece (o prazo da importação sai nele)
  const fuso = podeImportar ? await fusoDaClinica() : null;
  const importar = fuso ? (
    <FluxoDeImportacao
      variante="secundario"
      fuso={fuso}
      acoes={{ urlDoModelo, declarar: declararImportacao, iniciarEnvio: iniciarEnvioDaImportacao, previa: previaDaImportacao, confirmar: confirmarImportacao }}
    />
  ) : null;
  // "+ Novo paciente" à direita da busca (captura 09); o modal das capturas 15 a 18
  const novo = (
    <NovoPaciente
      clinica={sessao?.clinica ?? null}
      acoes={{ consultar: consultarCpfNaRede, vincular: vincularPacienteDaRede, cadastrar: cadastrarPaciente, cartao: cartaoDoPacienteDaClinica, reportar: reportarDivergenciaDaRede }}
    />
  );
  // espaçamento da captura 09: ~37 px das subabas aos cards (gap da página + mt-3), ~16 px dos cards à busca
  return (
    <div className="flex flex-col gap-4">
      <CardsDePacientes total={inicial.ok ? inicial.data.total : null} hoje={inicial.ok ? (inicial.data.contadores?.atendimento_hoje ?? null) : null} />
      <ListaDePacientes
        // depois de um cadastro, o router.refresh() traz a lista nova: a key recomeça o estado da lista com ela
        key={inicial.ok ? `${inicial.data.total}:${inicial.data.itens.map((p) => p.id).join(",")}` : "erro"}
        acoes={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {importar}
            {novo}
          </div>
        }
        inicial={inicial}
        listar={listarPacientes}
        buscar={buscarPacientes}
      />
    </div>
  );
}

function Carregando() {
  return (
    <DataState estado={{ tipo: "carregando" }} rotulo={textos.estado} esqueleto={{ linhas: 6, alturaRem: 5 }} vazio={textos.vazio}>
      {null}
    </DataState>
  );
}
