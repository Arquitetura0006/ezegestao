import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import type { ProjetoCoord } from "@/lib/coord";
import Organograma from "./Organograma";

export const dynamic = "force-dynamic";

export default async function OrganogramaPg({ params }: { params: { id: string } }) {
  const supabase = supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  await supabase.rpc("coord_aplicar_convites");
  const { data: proj } = await supabase.rpc("coord_projeto", { proj: params.id }).maybeSingle();
  if (!proj) redirect("/c");
  return <Organograma projeto={proj as ProjetoCoord} />;
}
