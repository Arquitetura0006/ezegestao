import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Linha = {
  id: string; codigo: number | null; nome: string; escritorio: string; cliente: string | null;
  como: "coordenador" | "equipe" | "convidado"; abertos: number; meus: number; modelos: number;
};

const COMO = { coordenador: "Coordenação", equipe: "Equipe", convidado: "Convidado" };

export default async function CoordLista() {
  const supabase = supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  await supabase.rpc("coord_aplicar_convites");
  const [{ data }, { data: vinc }] = await Promise.all([
    supabase.rpc("coord_meus_projetos"),
    supabase.from("membros").select("perfil_id").eq("perfil_id", user.id).eq("ativo", true).limit(1),
  ]);
  const lista = (data ?? []) as Linha[];
  const membro = (vinc ?? []).length > 0;

  return (
    <div className="cd-pg">
      <header className="cd-topo">
        <Link href={membro ? "/inicio" : "/c"} className="marca" aria-label="EZE Gestão">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="" />
          <span>Coordenação</span>
        </Link>
        <div className="row" style={{ gap: 8 }}>
          {membro && <Link className="btn small" href="/projetos">Projetos</Link>}
          <form action="/auth/sair" method="post">
            <button className="btn small ghost" type="submit">Sair</button>
          </form>
        </div>
      </header>
      <main className="wrap" style={{ maxWidth: 860 }}>
        <p className="mono" style={{ marginBottom: 8 }}>Coordenação de projetos</p>
        <h1 className="h-l" style={{ marginBottom: 24 }}>Seus projetos</h1>
        {lista.length === 0 ? (
          <div className="vazio">
            <p className="vazio-t">Nenhum projeto em coordenação para {user.email}.</p>
            <p className="note" style={{ margin: "4px 0 0" }}>
              {membro
                ? "Abra um projeto em Projetos e entre em Coordenação 3D para enviar o primeiro modelo IFC."
                : "Se você recebeu um convite, confira se entrou com o mesmo e-mail do convite."}
            </p>
          </div>
        ) : (
          <div className="lista">
            {lista.map((p) => (
              <Link key={p.id} href={`/c/${p.id}`} className="item">
                <span className="item-t">
                  <strong>{p.codigo ? `${String(p.codigo).padStart(3, "0")} · ` : ""}{p.nome}</strong>
                  <small>
                    {[p.escritorio, p.cliente, COMO[p.como], `${p.modelos} ${p.modelos === 1 ? "modelo" : "modelos"}`].filter(Boolean).join(" · ")}
                  </small>
                </span>
                {p.meus > 0 && <span className="pill inv">{p.meus} com você</span>}
                <span className="pill">{p.abertos} em aberto</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
