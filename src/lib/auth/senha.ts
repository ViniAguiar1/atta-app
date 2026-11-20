import { z } from "zod";

// A senha nova segue a política do Auth (config.toml: minimum_password_length = 12, password_requirements =
// "letters_digits"). O Auth confere de novo; aqui é para a tela responder antes e com texto claro.
export const SENHA_MINIMA = 12;

export const senhaNova = z
  .string()
  .min(SENHA_MINIMA)
  .max(200)
  .refine((s) => /[A-Za-z]/.test(s) && /[0-9]/.test(s), { message: "letras_e_digitos" });
