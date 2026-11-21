import { SubabasDoAtta } from "@/features/atta/components/SubabasDoAtta";
import { TelaSolucoes } from "@/features/atta/components/TelaSolucoes";
import { HREF } from "@/features/atta/subabas";

// ATTA › Soluções ATTA, PDD v206 §10.6.5, captura 23 (por ora no conteúdo do simulador; decisão do CTO, 20/11).
export default function Page() {
  return (
    <>
      <SubabasDoAtta ativa={HREF.solucoes} />
      <TelaSolucoes />
    </>
  );
}
