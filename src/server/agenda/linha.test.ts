import { describe, expect, it } from "vitest";
import { linhaSchema } from "@/lib/agenda/linha";
import { lerLinhas, linhaDoBanco, linhaDaTela } from "./linha";

// Parser comum da linha da agenda (agenda_day, agenda_range e patient_folder_appointments).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bruta = (over: Record<string, unknown> = {}) => ({
  id: id(1),
  starts_at: "2026-11-21T09:30:00-03:00",
  duration_min: 60,
  appointment_type: "procedimento",
  modality: "presencial",
  patient: { person_id: id(301), provisional_patient_id: null, display_name: "Mariana Costa Albuquerque", cpf_masked: "···.···.484-35" },
  services: [{ id: id(101), name: "Toxina botulínica" }],
  professional: { link_id: id(901), display_name: "Dra. Helena Prado" },
  documents: [],
  status: "agendado",
  late: false,
  confirmation: "confirmado",
  boarding_check_sent_at: null,
  allowed_actions: [{ action: "detalhes", disabled_reason: null }],
  ...over,
});

describe("linha da agenda (servidor)", () => {
  it("a linha do banco vira a linha da tela, válida pelo linhaSchema comum", () => {
    const tela = linhaDaTela(linhaDoBanco.parse(bruta()));
    expect(linhaSchema.parse(tela)).toEqual(tela);
    expect(tela.paciente).toMatchObject({ tipo: "pessoa", iniciais: "MA" });
  });

  it("lerLinhas descarta só a linha fora do formato", () => {
    const linhas = lerLinhas([bruta(), bruta({ id: id(2), status: "liberado" }), { qualquer: "coisa" }]);
    expect(linhas.map((l) => l.id)).toEqual([id(1)]);
  });
});
