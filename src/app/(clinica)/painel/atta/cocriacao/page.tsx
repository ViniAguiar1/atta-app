import { SubabaVazia } from "@/features/atta/components/SubabaVazia";
import { SubabasDoAtta } from "@/features/atta/components/SubabasDoAtta";
import { HREF } from "@/features/atta/subabas";
import { textos } from "@/features/atta/textos";

// ATTA › Co-criação, PDD v206 §10.6.4, captura 22. Até a tela entrar (próximos PRs do MIG-48), o estado vazio do design.
export default function Page() {
  return (
    <>
      <SubabasDoAtta ativa={HREF.cocriacao} />
      <SubabaVazia rotulo={textos.subabas.cocriacao} vazio={textos.vazios.cocriacao} />
    </>
  );
}
