import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

// Recebe o retorno do link por e-mail ou do Google e cria a sessão.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = supabaseServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/inicio", url.origin));
  }
  return NextResponse.redirect(new URL("/?erro=login", url.origin));
}
