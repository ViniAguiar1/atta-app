import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FluxoCheckin } from "@/features/checkin/components/FluxoCheckin";
import { portalSchema } from "@/features/checkin/schema";
import { portaCheckin } from "@/server/checkin/porta";

// Destino do QR da placa (PDD §14.2): o portal é o identificador da clínica, estático e não pessoal.
export const metadata: Metadata = { title: "Check-in · ATTA-in" };

export default function Pagina({ params }: PageProps<"/checkin/[portal]">) {
  return (
    <Suspense fallback={<p className="p-6 text-lg">Carregando…</p>}>
      <Checkin params={params} />
    </Suspense>
  );
}

async function Checkin({ params }: { params: Promise<{ portal: string }> }) {
  const { portal } = await params;
  if (!portalSchema.safeParse(portal).success) notFound();
  const clinica = await portaCheckin.clinica(portal);
  if (!clinica) notFound();
  return <FluxoCheckin portal={portal} clinica={clinica.nomeFantasia} />;
}
