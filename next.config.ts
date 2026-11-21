import type { NextConfig } from "next";
import { cabecalhosDeSeguranca } from "./src/lib/seguranca/cabecalhos";

const nextConfig: NextConfig = {
  /* config options here */
  // cabeçalhos de segurança de toda resposta (S2-1; PDD v206 §19.3; ADR 0004 §3)
  async headers() {
    return cabecalhosDeSeguranca({
      desenvolvimento: process.env.NODE_ENV === "development",
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
  },
  // O time abre o `next dev` em 127.0.0.1 (Playwright, retorno do login do Supabase local), e o Next 16 trata como outra
  // origem que localhost: sem isto, ele bloqueia o websocket do HMR e os recursos de dev, e o React não hidrata no local.
  // Só vale no `next dev`; o build de produção ignora.
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
