import Link from "next/link";
import { notFound } from "next/navigation";
import { Subabas } from "@/components/ui/Subabas";
import { moduloDisponivel } from "@/features/casca/abas";
import { SUBABAS_DE_PACIENTES } from "@/features/pacientes/subabas";
import { textos } from "@/features/pacientes/textos";

// Pasta do Paciente sem paciente escolhido (subaba do Simulador ATTA-in, captura 09). A Pasta de um paciente (capturas
// 12 a 14) entra no próximo item do MIG-43; até lá, a subaba abre o estado vazio, sem dado de mentira.
export default function Page() {
  if (!moduloDisponivel("/painel/pacientes")) notFound();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">{textos.subabas.pasta}</h1>
      <Subabas rotulo={textos.subabas.rotulo} itens={SUBABAS_DE_PACIENTES} ativa="/painel/pacientes/pasta" />
      <section className="flex flex-col items-start gap-2 rounded-md border border-border bg-surface-raised p-6">
        <p className="font-sub text-lg text-text-primary">{textos.pasta.vazioTitulo}</p>
        <p className="text-text-secondary">{textos.pasta.vazioTexto}</p>
        <Link
          href="/painel/pacientes"
          className="mt-2 inline-flex min-h-11 items-center rounded-md border border-border-functional px-5 font-medium text-text-primary hover:bg-surface-card"
        >
          {textos.pasta.irParaLista}
        </Link>
      </section>
    </div>
  );
}
