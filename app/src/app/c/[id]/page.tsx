import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import type { ProjetoCoord } from "@/lib/coord";
import Coordenacao from "./Coordenacao";

export const dynamic = "force-dynamic";

export default async function CoordPg({ params }: { params: { id: string } }) {
  const supabase = supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  await supabase.rpc("coord_aplicar_convites");

  const [{ data: proj }, { data: perfil }] = await Promise.all([
    supabase.rpc("coord_projeto", { proj: params.id }).maybeSingle(),
    supabase.from("perfis").select("id,nome,foto_url,email").eq("id", user.id).maybeSingle(),
  ]);
  if (!proj) redirect("/c");

  const eu = {
    id: user.id,
    nome: perfil?.nome || user.email?.split("@")[0] || "",
    foto: perfil?.foto_url ?? null,
    email: perfil?.email || user.email || "",
  };
  return <Coordenacao projeto={proj as ProjetoCoord} eu={eu} />;
}
