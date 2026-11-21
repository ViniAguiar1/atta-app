"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CartaoDeSecao } from "@/components/ui/CartaoDeSecao";
import { DataState } from "@/components/ui/DataState";
import { FaixaInformativa } from "@/components/ui/FaixaInformativa";
import type { Resultado } from "@/lib/errors";
import type { CampoDaEmpresa, PerfilDaClinica } from "@/server/perfil/porta";
import { textos } from "../textos";
import { CampoDoPerfil } from "./CampoDoPerfil";

// Configurações › Perfil da Clínica (PDD v206 §10.4.1; Simulador ATTA-in, captura 42): a faixa do salvamento automático,
// o aviso do que falta para consolidar documentos (missing_required do banco), os Dados da empresa e o Endereço &
// Contato. O gestor e o Responsável Técnico (dado pessoal, cifrado no servidor) entram no PR seguinte.
const t = textos.perfil;

// obrigatórios para consolidar documentos (PDD §10.4.1 e decisão do CTO, R35); a regra de verdade é a do banco
const OBRIGATORIOS = new Set<CampoDaEmpresa>([
  "trade_name",
  "legal_name",
  "cnpj",
  "address_street",
  "address_number",
  "address_city",
  "address_uf",
  "clinic_whatsapp",
  "commercial_email",
]);
const EMPRESA: CampoDaEmpresa[] = ["trade_name", "legal_name", "cnpj", "tax_registration", "main_specialty"];
const CONTATO: CampoDaEmpresa[] = ["address_cep", "address_street", "address_number", "address_complement", "address_city", "address_uf", "phone", "clinic_whatsapp", "commercial_email"];

const formatar = (iso: string, fuso: string, opcoes: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, ...opcoes }).format(new Date(iso));

export function TelaPerfil({ resultado }: { resultado: Resultado<PerfilDaClinica | null> | null }) {
  const router = useRouter();
  if (!resultado || !resultado.ok || !resultado.data) {
    const estado = !resultado ? { tipo: "carregando" as const } : !resultado.ok ? { tipo: "erro" as const, codigo: resultado.error.code, tentarDeNovo: () => router.refresh() } : { tipo: "vazio" as const };
    return (
      <DataState estado={estado} rotulo={t.rotulo} esqueleto={{ linhas: 6, alturaRem: 3 }} vazio={t.vazio}>
        {null}
      </DataState>
    );
  }
  return <Perfil perfil={resultado.data} />;
}

function Perfil({ perfil }: { perfil: PerfilDaClinica }) {
  const router = useRouter();
  const [salvoEm, setSalvoEm] = useState(perfil.salvoEm);
  // depois de salvar, relê o perfil no servidor: o aviso do que falta (missing_required) vem do banco. A key da tela não
  // muda e cada campo guarda o próprio estado, então nada do que está sendo digitado se perde.
  const aoSalvar = (quando: string) => {
    setSalvoEm(quando);
    router.refresh();
  };
  const campo = (c: CampoDaEmpresa) => (
    <CampoDoPerfil key={c} campo={c} valor={perfil.campos[c]} obrigatorio={OBRIGATORIOS.has(c)} fuso={perfil.fuso} aoSalvar={aoSalvar} />
  );
  return (
    <div className="flex flex-col gap-4 text-corpo">
      <h2 className="sr-only">{t.titulo}</h2>
      <FaixaInformativa destaque={t.faixa.destaque}>{t.faixa.texto}</FaixaInformativa>
      {salvoEm && <p className="-mt-2 text-xs text-text-secondary">{t.salvoEm(formatar(salvoEm, perfil.fuso, { hour: "2-digit", minute: "2-digit" }))}</p>}
      {perfil.faltando.length > 0 && (
        <div role="status" className="rounded-md border border-border border-l-4 border-l-status-pending bg-surface-raised p-3">
          <p>{t.faltam}</p>
          <ul className="mt-1 list-disc pl-5">
            {perfil.faltando.map((f) => (
              <li key={f}>{t.faltando[f] ?? f}</li>
            ))}
          </ul>
        </div>
      )}
      <CartaoDeSecao titulo={t.empresa.titulo} subtitulo={t.empresa.subtitulo} icone="🏢" compacto>
        {perfil.desde && <p className="text-xs text-text-secondary">{t.empresa.desde(formatar(perfil.desde, perfil.fuso, { day: "2-digit", month: "2-digit", year: "numeric" }))}</p>}
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 medium:grid-cols-2">{EMPRESA.map(campo)}</div>
      </CartaoDeSecao>
      <CartaoDeSecao titulo={t.contato.titulo} subtitulo={t.contato.subtitulo} icone="📍" compacto>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 medium:grid-cols-2">{CONTATO.map(campo)}</div>
      </CartaoDeSecao>
    </div>
  );
}
