import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = supabaseServidor();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
