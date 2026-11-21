// Para o teste de cada tela que lê dados (planning/08 §9.4): o DataState já tem os quatro estados testados, então a
// tela só confere qual estado ele está mostrando, sem repetir o texto de cada um (4 + N testes, não 4 × N).
export type NomeDoEstado = "carregando" | "vazio" | "sem-resultado" | "erro" | "sem-acesso" | "pronto";

/** O estado que o DataState está mostrando dentro do container; "pronto" quando nenhum quadro de estado aparece. */
export function estadoDeDados(container: HTMLElement): NomeDoEstado {
  const quadros = container.querySelectorAll("[data-estado]");
  if (quadros.length > 1) throw new Error(`${quadros.length} quadros de estado: cada lista tem o seu DataState`);
  return (quadros[0]?.getAttribute("data-estado") as NomeDoEstado | undefined) ?? "pronto";
}
