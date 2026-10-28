"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../../ctx";
import { Avatar, Vazio } from "../../ui";
import { FASES, dataCurta, dataHora, erroMsg } from "@/lib/util";

type Proj = { id: string; nome: string; fase: string | null; prazo: string | null; ativo: boolean; pasta_url: string | null };
type Rec = { id: string; texto: string; created_at: string; autor_id: string; autor: { nome: string | null; foto_url: string | null } | null };
type P = { id: string; nome: string | null; foto_url: string | null };

export default function ProjetoPg({ params }: { params: { id: string } }) {
  const { eu, esc, admin } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [p, setP] = useState<Proj | null | undefined>(undefined);
  const [membros, setMembros] = useState<P[]>([]);
  const [equipe, setEquipe] = useState<P[]>([]);
  const [recados, setRecados] = useState<Rec[]>([]);
  const [texto, setTexto] = useState("");
  const [ed, setEd] = useState<Proj | null>(null);
  const [add, setAdd] = useState("");
  const [erro, setErro] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    const [{ data: pr }, { data: m }, { data: r }] = await Promise.all([
      supabase.from("projetos").select("id,nome,fase,prazo,ativo,pasta_url").eq("id", params.id).maybeSingle(),
      supabase.from("projeto_membros").select("perfil:perfis(id,nome,foto_url)").eq("projeto_id", params.id),
      supabase.from("recados").select("id,texto,created_at,autor_id,autor:perfis(nome,foto_url)").eq("projeto_id", params.id).order("created_at"),
    ]);
    setP((pr as Proj) ?? null);
    setMembros(((m ?? []) as unknown as { perfil: P | null }[]).map((x) => x.perfil).filter(Boolean) as P[]);
    setRecados((r as unknown as Rec[]) ?? []);
  }, [supabase, params.id]);

  useEffect(() => {
    carregar();
    if (admin) {
      supabase
        .from("membros")
        .select("perfil:perfis(id,nome,foto_url)")
        .eq("escritorio_id", esc.id)
        .eq("ativo", true)
        .then(({ data }) => setEquipe(((data ?? []) as unknown as { perfil: P | null }[]).map((x) => x.perfil).filter(Boolean) as P[]));
    }
    const canal = supabase
      .channel(`recados-${params.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "recados", filter: `projeto_id=eq.${params.id}` }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, params.id, esc.id, admin, carregar]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "nearest" });
  }, [recados.length]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    const { error } = await supabase.from("recados").insert({ escritorio_id: esc.id, projeto_id: params.id, autor_id: eu.id, texto: texto.trim() });
    if (error) return setErro(erroMsg(error));
    setTexto("");
    carregar();
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!ed) return;
    const { error } = await supabase
      .from("projetos")
      .update({ nome: ed.nome.trim() || "Sem nome", fase: ed.fase, prazo: ed.prazo || null, pasta_url: ed.pasta_url?.trim() || null })
      .eq("id", params.id);
    if (error) return setErro(erroMsg(error));
    setEd(null);
    carregar();
  }

  async function arquivar(v: boolean) {
    await supabase.from("projetos").update({ ativo: v }).eq("id", params.id);
    carregar();
  }

  async function incluir() {
    if (!add) return;
    const { error } = await supabase.from("projeto_membros").insert({ projeto_id: params.id, perfil_id: add, escritorio_id: esc.id });
    if (error) return setErro(erroMsg(error));
    setAdd("");
    carregar();
  }

  async function tirar(id: string) {
    await supabase.from("projeto_membros").delete().eq("projeto_id", params.id).eq("perfil_id", id);
    carregar();
  }

  if (p === undefined) return <p className="note">Carregando…</p>;
  if (p === null) return <Vazio titulo="Projeto não encontrado"><Link className="btn small" href="/projetos">Voltar</Link></Vazio>;

  const fora = equipe.filter((x) => !membros.some((m) => m.id === x.id));

  return (
    <div style={{ maxWidth: 900 }}>
      <p style={{ margin: "0 0 12px" }}><Link href="/projetos" className="note">← Projetos</Link></p>

      {!ed ? (
        <div className="cabeca">
          <div>
            <p className="mono" style={{ marginBottom: 8 }}>
              {[p.fase, p.prazo ? `prazo ${dataCurta(p.prazo + "T12:00:00")}` : null, p.ativo ? null : "Arquivado"].filter(Boolean).join(" · ") || "Projeto"}
            </p>
            <h1 className="h-l">{p.nome}</h1>
          </div>
          <div className="cabeca-acoes">
            {p.pasta_url && <a className="btn" href={p.pasta_url} target="_blank" rel="noreferrer">Abrir pasta</a>}
            {admin && <button className="btn" type="button" onClick={() => setEd(p)}>Editar</button>}
          </div>
        </div>
      ) : (
        <form className="box stack" style={{ marginBottom: 24 }} onSubmit={salvar}>
          <div className="grid2" style={{ gap: 12 }}>
            <label className="form-l"><span>Nome</span><input type="text" value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} maxLength={100} /></label>
            <label className="form-l"><span>Fase</span>
              <select className="f" value={ed.fase ?? ""} onChange={(e) => setEd({ ...ed, fase: e.target.value })}>{FASES.map((f) => <option key={f}>{f}</option>)}</select>
            </label>
            <label className="form-l"><span>Prazo da fase</span><input type="date" value={ed.prazo ?? ""} onChange={(e) => setEd({ ...ed, prazo: e.target.value })} /></label>
            <label className="form-l"><span>Link da pasta (Drive, Dropbox…)</span><input type="url" value={ed.pasta_url ?? ""} onChange={(e) => setEd({ ...ed, pasta_url: e.target.value })} /></label>
          </div>
          <div className="row">
            <button className="btn dark small" type="submit">Salvar</button>
            <button className="btn small" type="button" onClick={() => setEd(null)}>Cancelar</button>
            <button className="btn small ghost" type="button" style={{ marginLeft: "auto" }} onClick={() => { arquivar(!p.ativo); setEd(null); }}>{p.ativo ? "Arquivar projeto" : "Reativar projeto"}</button>
          </div>
        </form>
      )}

      <section style={{ marginBottom: 28 }}>
        <h2 className="sec-t">Partners no projeto</h2>
        <div className="row">
          {membros.length === 0 && <span className="note">Ninguém ainda.</span>}
          {membros.map((m) => (
            <span key={m.id} className="pill" style={{ padding: "4px 10px 4px 4px" }}>
              <Avatar nome={m.nome} foto={m.foto_url} size={24} />
              {m.nome}
              {admin && <button className="linkbtn" type="button" onClick={() => tirar(m.id)} aria-label={`Tirar ${m.nome}`} style={{ textDecoration: "none" }}>×</button>}
            </span>
          ))}
        </div>
        {admin && fora.length > 0 && (
          <div className="row" style={{ marginTop: 12 }}>
            <select className="f" style={{ width: "auto", minWidth: 200 }} value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Adicionar pessoa">
              <option value="">Adicionar pessoa…</option>
              {fora.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
            <button className="btn small" type="button" onClick={incluir} disabled={!add}>Adicionar</button>
          </div>
        )}
      </section>

      <section>
        <h2 className="sec-t">Recados</h2>
        <div className="lista" style={{ maxHeight: 520, overflow: "auto" }}>
          {recados.length === 0 ? (
            <p className="note" style={{ padding: 18, margin: 0 }}>Nenhum recado. Use este espaço para combinar entregas e tirar dúvidas do projeto.</p>
          ) : (
            recados.map((r) => (
              <div key={r.id} style={{ padding: "12px 18px", display: "flex", gap: 10 }}>
                <Avatar nome={r.autor?.nome} foto={r.autor?.foto_url} size={30} eu={r.autor_id === eu.id} />
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <strong style={{ fontSize: 14 }}>{r.autor?.nome}</strong>
                    <small className="note">{dataHora(r.created_at)}</small>
                  </div>
                  <p className="texto-aula" style={{ fontSize: 14.5 }}>{r.texto}</p>
                </div>
              </div>
            ))
          )}
          <div ref={fim} />
        </div>
        <form className="row" style={{ marginTop: 12, alignItems: "flex-end", flexWrap: "nowrap" }} onSubmit={enviar}>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva um recado" style={{ minHeight: 48 }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviar(e); }} aria-label="Recado" />
          <button className="btn dark" type="submit">Enviar</button>
        </form>
        {erro && <p className="err" role="alert" style={{ marginTop: 8 }}>{erro}</p>}
      </section>
    </div>
  );
}
