import { redirect } from "next/navigation";

// "/" faz o que a produção faz (PLANO, regra do stage): sem sessão, a tela de entrar. Com sessão, o proxy já levou ao
// painel antes de chegar aqui.
export default function Inicio() {
  redirect("/login");
}
