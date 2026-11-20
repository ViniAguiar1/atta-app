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
