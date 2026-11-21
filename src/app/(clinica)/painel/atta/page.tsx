import { redirect } from "next/navigation";
import { SUBABAS_ATTA } from "@/features/atta/subabas";

// /painel/atta abre a primeira subaba, a Central de Ajuda, como no simulador (PDD v206 §10.6; capturas 19 a 23).
export default function Page() {
  redirect(SUBABAS_ATTA[0]!.href);
}
