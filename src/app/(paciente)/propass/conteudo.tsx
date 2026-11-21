import { FluxoPropass, Indisponivel, SemValidade } from "@/features/propass/components/FluxoPropass";
import { lerHashDoConvite } from "@/server/propass/cookies";
import { portaPropass } from "@/server/propass/porta";

// O que a /propass mostra (dentro do Suspense da página). "Convite não vale" só sem cookie ou com o link recusado
// (NAO_ENCONTRADO, o SEM_LINK do servidor, sem oráculo). Falha do servidor (INTERNO, INDISPONIVEL) é o aviso genérico,
// para um defeito não se esconder atrás do link vencido (Tech Lead Frontend no #288).
export async function Conteudo() {
  const hash = await lerHashDoConvite();
  if (!hash) return <SemValidade />;
  const r = await portaPropass.resolver(hash);
  if (r.ok) return <FluxoPropass clinica={r.data.clinica} email={r.data.emailDoConvite} conviteEm={r.data.conviteEm} fuso={r.data.fuso} />;
  return r.error.code === "NAO_ENCONTRADO" ? <SemValidade /> : <Indisponivel />;
}
