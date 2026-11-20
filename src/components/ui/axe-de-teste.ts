import axe from "axe-core";

// axe nos testes de componente (jsdom). O contraste fica de fora: o jsdom não calcula cor; ele é medido no e2e com
// Playwright e nos tokens (contraste documentado em tokens.css).
export async function violacoesDoAxe(container: Element): Promise<string[]> {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}
