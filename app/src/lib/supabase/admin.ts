import { createClient } from "@supabase/supabase-js";

// Cliente com a chave de serviço: só no servidor, para gravar o resultado das
// análises da IA (que ninguém pode escrever pelo navegador).
export function supabaseAdmin() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) throw new Error("Falta a variável SUPABASE_SERVICE_ROLE_KEY na Vercel.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
