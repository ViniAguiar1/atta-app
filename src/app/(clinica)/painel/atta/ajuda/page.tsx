import { SubabaVazia } from "@/features/atta/components/SubabaVazia";
import { SubabasDoAtta } from "@/features/atta/components/SubabasDoAtta";
import { HREF } from "@/features/atta/subabas";
import { textos } from "@/features/atta/textos";

// ATTA › Central de Ajuda, PDD v206 §10.6.1, captura 19. Até a tela entrar (próximos PRs do MIG-48), o estado vazio do design.
export default function Page() {
  return (
    <>
      <SubabasDoAtta ativa={HREF.ajuda} />
      <SubabaVazia rotulo={textos.subabas.ajuda} vazio={textos.vazios.ajuda} />
    </>
  );
}
