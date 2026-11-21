import { SubabasDoAtta } from "@/features/atta/components/SubabasDoAtta";
import { TelaAjuda } from "@/features/atta/components/TelaAjuda";
import { HREF } from "@/features/atta/subabas";

// ATTA › Central de Ajuda, PDD v206 §10.6.1, captura 19. É a subaba que /painel/atta abre, como no simulador.
export default function Page() {
  return (
    <>
      <SubabasDoAtta ativa={HREF.ajuda} />
      <TelaAjuda />
    </>
  );
}
