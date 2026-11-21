import { SubabaVazia } from "@/features/atta/components/SubabaVazia";
import { SubabasDoAtta } from "@/features/atta/components/SubabasDoAtta";
import { HREF } from "@/features/atta/subabas";
import { textos } from "@/features/atta/textos";

// ATTA › Suporte & Chamados, PDD v206 §10.6.2, captura 20. Até a tela entrar (próximos PRs do MIG-48), o estado vazio do design.
export default function Page() {
  return (
    <>
      <SubabasDoAtta ativa={HREF.suporte} />
      <SubabaVazia rotulo={textos.subabas.suporte} vazio={textos.vazios.suporte} />
    </>
  );
}
