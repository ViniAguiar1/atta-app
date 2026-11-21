import { Subabas } from "@/components/ui/Subabas";
import { SUBABAS_ATTA } from "../subabas";
import { textos as t } from "../textos";

// As subabas coladas na barra do painel, de ponta a ponta, como no simulador (capturas 19 a 23): o recuo negativo
// desfaz o padding do <main> da casca só nesta faixa.
export function SubabasDoAtta({ ativa }: { ativa: string }) {
  return (
    <div className="-mx-4 -mt-6 mb-4 px-2 text-[0.8125rem] medium:-mx-6 medium:px-4">
      <h1 className="sr-only">{t.titulo}</h1>
      <Subabas rotulo={t.subabas.rotulo} itens={SUBABAS_ATTA} ativa={ativa} />
    </div>
  );
}
