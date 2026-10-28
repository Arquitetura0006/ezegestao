"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../../ctx";
import { Cabeca, Vazio } from "../../ui";
import { erroMsg } from "@/lib/util";

type Trilha = { id: string; titulo: string; descricao: string | null; publicada: boolean };
type Aula = { id: string; titulo: string; ordem: number; publicada: boolean };

export default function TrilhaPg({ params }: { params: { id: string } }) {
  const { eu, admin } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const router = useRouter();
  const [t, setT] = useState<Trilha | null | undefined>(undefined);
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [feitas, setFeitas] = useState<Set<string>>(new Set());
  const [cred, setCred] = useState(false);
  const [editar, setEditar] = useState(false);
  const [f, setF] = useState({ titulo: "", descricao: "" });
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const [{ data: tr }, { data: au }, { data: p }, { data: c }] = await Promise.all([
      supabase.from("trilhas").select("id,titulo,descricao,publicada,escritorio_id").eq("id", params.id).maybeSingle(),
      supabase.from("aulas").select("id,titulo,ordem,publicada").eq("trilha_id", params.id).order("ordem"),
      supabase.from("progresso_aula").select("aula_id").eq("perfil_id", eu.id).not("concluida_em", "is", null),
      supabase.from("credenciamentos").select("trilha_id").eq("perfil_id", eu.id).eq("trilha_id", params.id),
    ]);
    setT(tr ?? null);
    if (tr) setF({ titulo: tr.titulo, descricao: tr.descricao || "" });
    setAulas(((au as Aula[]) ?? []).filter((a) => admin || a.publicada));
    setFeitas(new Set((p ?? []).map((x: { aula_id: string }) => x.aula_id)));
    setCred((c ?? []).length > 0);
  }, [supabase, params.id, eu.id, admin]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const { error } = await supabase.from("trilhas").update({ titulo: f.titulo.trim() || "Sem título", descricao: f.descricao.trim() || null }).eq("id", params.id);
    if (error) return setErro(erroMsg(error));
    setEditar(false);
    carregar();
  }

  async function publicar(v: boolean) {
    await supabase.from("trilhas").update({ publicada: v }).eq("id", params.id);
    carregar();
  }

  async function excluir() {
    if (!confirm("Excluir esta trilha e todas as aulas dela? Não dá para desfazer.")) return;
    const { error } = await supabase.from("trilhas").delete().eq("id", params.id);
    if (error) return setErro(erroMsg(error));
    router.push("/padroes");
  }

  async function criarAula(e: React.FormEvent) {
    e.preventDefault();
    if (!nova.trim() || !t) return;
    const ordem = aulas.reduce((m, a) => Math.max(m, a.ordem), 0) + 1;
    const { data: esc } = await supabase.from("trilhas").select("escritorio_id").eq("id", params.id).single();
    const { data, error } = await supabase
      .from("aulas")
      .insert({ escritorio_id: esc?.escritorio_id, trilha_id: params.id, titulo: nova.trim(), ordem, publicada: false, blocos: [] })
      .select("id")
      .single();
    if (error) return setErro(erroMsg(error));
    router.push(`/padroes/aula/${data.id}?editar=1`);
  }

  async function mover(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= aulas.length) return;
    const a = aulas[i];
    const b = aulas[j];
    await Promise.all([
      supabase.from("aulas").update({ ordem: b.ordem }).eq("id", a.id),
      supabase.from("aulas").update({ ordem: a.ordem }).eq("id", b.id),
    ]);
    carregar();
  }

  if (t === undefined) return <p className="note">Carregando…</p>;
  if (t === null || (!admin && !t.publicada)) return <Vazio titulo="Trilha não encontrada"><Link className="btn small" href="/padroes">Voltar</Link></Vazio>;

  const pub = aulas.filter((a) => a.publicada);
  const ok = pub.filter((a) => feitas.has(a.id)).length;
  const proxima = pub.find((a) => !feitas.has(a.id)) ?? pub[0];

  return (
    <>
      <p style={{ margin: "0 0 12px" }}><Link href="/padroes" className="note">← Padrões</Link></p>
      <Cabeca kicker={cred ? "Credenciado" : `${ok} de ${pub.length} aulas`} titulo={t.titulo}>
        {proxima && <Link className="btn dark" href={`/padroes/aula/${proxima.id}`}>{ok === 0 ? "Começar" : cred ? "Rever" : "Continuar"}</Link>}
        {admin && !editar && <button className="btn" type="button" onClick={() => setEditar(true)}>Editar trilha</button>}
      </Cabeca>
      {t.descricao && !editar && <p style={{ marginTop: -12, marginBottom: 20, maxWidth: 720 }}>{t.descricao}</p>}

      {admin && editar && (
        <form className="box stack" style={{ marginBottom: 20 }} onSubmit={salvar}>
          <label className="form-l"><span>Título</span><input type="text" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} maxLength={80} /></label>
          <label className="form-l"><span>Descrição</span><textarea value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} style={{ minHeight: 70 }} /></label>
          <div className="row">
            <button className="btn dark small" type="submit">Salvar</button>
            <button className="btn small" type="button" onClick={() => setEditar(false)}>Cancelar</button>
            <button className="btn small ghost" type="button" onClick={excluir} style={{ marginLeft: "auto" }}>Excluir trilha</button>
          </div>
        </form>
      )}

      {admin && (
        <div className="box row" style={{ marginBottom: 20, justifyContent: "space-between" }}>
          <span>
            <strong>{t.publicada ? "Publicada" : "Rascunho"}</strong>
            <span className="note"> · {t.publicada ? "a equipe vê esta trilha" : "só administradores veem"}</span>
          </span>
          <button className="btn small" type="button" onClick={() => publicar(!t.publicada)}>{t.publicada ? "Voltar para rascunho" : "Publicar trilha"}</button>
        </div>
      )}

      {aulas.length === 0 ? (
        <Vazio titulo="Nenhuma aula nesta trilha" texto={admin ? "Adicione a primeira aula abaixo. Ela começa como rascunho." : "As aulas aparecem aqui quando forem publicadas."} />
      ) : (
        <div className="lista">
          {aulas.map((a, i) => (
            <div key={a.id} className="item">
              <span className={`pill ${feitas.has(a.id) ? "inv" : a.publicada ? "" : "dash"}`} style={{ minWidth: 30, justifyContent: "center" }}>
                {feitas.has(a.id) ? "✓" : i + 1}
              </span>
              <Link href={`/padroes/aula/${a.id}`} className="item-t" style={{ textDecoration: "none", color: "inherit" }}>
                <strong>{a.titulo}</strong>
                {!a.publicada && <small>Rascunho</small>}
              </Link>
              {admin && (
                <span className="row" style={{ gap: 4 }}>
                  <button className="btn small ghost" type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                  <button className="btn small ghost" type="button" onClick={() => mover(i, 1)} disabled={i === aulas.length - 1} aria-label="Descer">↓</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {admin && (
        <form className="box row" style={{ marginTop: 20, alignItems: "flex-end" }} onSubmit={criarAula}>
          <label className="form-l" style={{ flex: "1 1 260px" }}>
            <span>Nova aula</span>
            <input type="text" value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Ex.: Como montamos a prancha de fachada" maxLength={120} />
          </label>
          <button className="btn dark" type="submit">Adicionar aula</button>
        </form>
      )}
      {erro && <p className="err" role="alert" style={{ marginTop: 10 }}>{erro}</p>}
    </>
  );
}
