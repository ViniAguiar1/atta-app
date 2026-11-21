import { Subabas } from "@/components/ui/Subabas";
import { SUBABAS_ATTA } from "../subabas";
import { textos as t } from "../textos";

// As subabas coladas na barra do painel, como no simulador (capturas 19 a 23). Quem cola na barra e leva a linha até a
// borda é a casca do painel (CascaDoPainel, pelo data-subabas do Subabas), igual em todos os módulos; sem recuo aqui.
export function SubabasDoAtta({ ativa }: { ativa: string }) {
  return (
    <div className="mb-4 text-[0.8125rem]">
      <h1 className="sr-only">{t.titulo}</h1>
      <Subabas rotulo={t.subabas.rotulo} itens={SUBABAS_ATTA} ativa={ativa} />
    </div>
  );
}
