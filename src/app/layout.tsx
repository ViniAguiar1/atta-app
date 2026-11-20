import type { Metadata } from "next";
import { Allerta_Stencil, Poppins, Prata, Raleway } from "next/font/google";
import "@/styles/globals.css";

// Fontes do Guia de Design, auto-hospedadas pelo next/font (nenhum pedido ao Google no navegador): Raleway no corpo
// (400, 500 nos rótulos e botões, 600 nos títulos de seção), Prata nos títulos h1–h3, Poppins nos subtítulos e
// Allerta Stencil na palavra ATTA (fonte de marca; a Quiche Stencil espera licença, LF-05).
const raleway = Raleway({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], display: "swap", variable: "--ff-raleway" });
const prata = Prata({ subsets: ["latin"], weight: "400", display: "swap", variable: "--ff-prata" });
const poppins = Poppins({ subsets: ["latin", "latin-ext"], weight: "400", display: "swap", variable: "--ff-poppins" });
const allerta = Allerta_Stencil({ subsets: ["latin"], weight: "400", display: "swap", variable: "--ff-allerta-stencil" });

export const metadata: Metadata = {
  title: "ATTA-in",
  // painel e fluxos com dado de saúde: nada aqui é indexável
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${raleway.variable} ${prata.variable} ${poppins.variable} ${allerta.variable}`}>
      <body className="bg-surface-app text-base text-text-primary">{children}</body>
    </html>
  );
}
