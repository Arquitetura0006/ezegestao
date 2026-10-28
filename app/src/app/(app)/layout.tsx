import { redirect } from "next/navigation";
import { supabaseServidor, ESCRITORIO } from "@/lib/supabase/server";
import { MODELO_URL, type Papel } from "@/lib/util";
import Shell from "./Shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Quem foi convidado depois de já ter conta entra aqui.
  await supabase.rpc("aplicar_convites");

  const [{ data: perfil }, { data: vinculos }] = await Promise.all([
    supabase.from("perfis").select("id,nome,email,foto_url,cidade").eq("id", user.id).maybeSingle(),
    supabase.from("membros").select("papel, escritorios(id,nome,slug)").eq("perfil_id", user.id).eq("ativo", true),
  ]);

  // Foto da conta Google: completa o perfil se ainda estiver vazio.
  const fotoGoogle = (user.user_metadata?.avatar_url || user.user_metadata?.picture) as string | undefined;
  if (perfil && !perfil.foto_url && fotoGoogle) {
    await supabase.from("perfis").update({ foto_url: fotoGoogle }).eq("id", user.id);
    perfil.foto_url = fotoGoogle;
  }

  type V = { papel: Papel; escritorios: { id: string; nome: string; slug: string } | null };
  const lista = (vinculos ?? []) as unknown as V[];
  const v = lista.find((x) => x.escritorios?.slug === ESCRITORIO) ?? lista[0];

  if (!v?.escritorios) {
    return (
      <main className="wrap" style={{ maxWidth: 620 }}>
        <p className="mono" style={{ marginBottom: 12 }}>EZE Gestão · Acesso pendente</p>
        <h1 className="h-l">Seu acesso ainda não foi liberado.</h1>
        <div className="box" style={{ marginTop: 24 }}>
          <p style={{ margin: 0 }}>
            Você entrou com <strong>{user.email}</strong>, mas esse e-mail ainda não foi convidado para o escritório. Peça ao
            administrador para enviar o convite para este endereço e entre de novo.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          <form action="/auth/sair" method="post">
            <button className="btn" type="submit">Sair e entrar com outro e-mail</button>
          </form>
          <a className="btn" href={MODELO_URL} target="_blank" rel="noreferrer">Ver modelo</a>
        </div>
      </main>
    );
  }

  const papel = v.papel;
  return (
    <Shell
      ctx={{
        eu: {
          id: user.id,
          nome: perfil?.nome || user.email?.split("@")[0] || "",
          email: perfil?.email || user.email || "",
          foto: perfil?.foto_url ?? null,
          cidade: perfil?.cidade ?? null,
        },
        esc: v.escritorios,
        papel,
        admin: papel === "dono" || papel === "admin",
      }}
    >
      {children}
    </Shell>
  );
}
