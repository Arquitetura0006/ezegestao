import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAPEL: Record<string, string> = { dono: "Dono", admin: "Administrador", partner: "Partner", recepcao: "Recepção" };

export default async function Inicio() {
  const supabase = supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: perfil } = await supabase.from("perfis").select("nome,email,foto_url").eq("id", user.id).maybeSingle();
  const { data: vinculos } = await supabase.from("membros").select("papel, escritorios(nome, slug)").eq("perfil_id", user.id).eq("ativo", true);
  const { data: trilhas } = await supabase.from("trilhas").select("id,titulo,ordem").order("ordem");

  const nome = (perfil?.nome || user.email || "").split(" ")[0];
  const v = (vinculos ?? [])[0] as unknown as { papel: string; escritorios: { nome: string } } | undefined;

  return (
    <main className="wrap">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 36 }}>
        <span className="mono">EZE Gestão</span>
        <form action="/auth/sair" method="post">
          <button className="btn" type="submit">Sair</button>
        </form>
      </div>
      <p className="mono" style={{ marginBottom: 12 }}>{v ? `${PAPEL[v.papel] ?? v.papel} · ${v.escritorios?.nome ?? ""}` : "Acesso pendente"}</p>
      <h1 className="h-l">Bem-vindo, {nome}.</h1>
      {v ? (
        <section className="box" style={{ marginTop: 28 }}>
          <p className="mono" style={{ marginBottom: 10 }}>Padrões EZE</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {(trilhas ?? []).map((t) => (
              <li key={t.id}>{t.titulo}</li>
            ))}
          </ul>
          <p className="note" style={{ marginBottom: 0 }}>As telas do escritório estão sendo ligadas a este banco, uma a uma.</p>
        </section>
      ) : (
        <section className="box" style={{ marginTop: 28 }}>
          <p style={{ margin: 0 }}>
            Seu e-mail ({user.email}) ainda não foi liberado em nenhum escritório. Peça ao administrador para cadastrar este e-mail.
          </p>
        </section>
      )}
    </main>
  );
}
