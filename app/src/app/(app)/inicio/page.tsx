"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { Avatar, Cabeca, Vazio } from "../ui";
import { MODELO_URL, PAPEL, dataHora, erroMsg, primeiroNome } from "@/lib/util";

type Aviso = { id: string; titulo: string; texto: string; created_at: string; autor: { nome: string | null; foto_url: string | null } | null };

export default function Inicio() {
  const { eu, esc, papel, admin } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [avisos, setAvisos] = useState<Aviso[] | null>(null);
  const [conta, setConta] = useState({ membros: 0, convites: 0, aulas: 0, links: 0, trilhas: 0, cred: 0 });
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [abrir, setAbrir] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from("avisos")
      .select("id,titulo,texto,created_at,autor:perfis(nome,foto_url)")
      .eq("escritorio_id", esc.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setAvisos((data as unknown as Aviso[]) ?? []);
  }, [supabase, esc.id]);

  useEffect(() => {
    carregar();
    (async () => {
      const q = (t: string) => supabase.from(t).select("*", { count: "exact", head: true }).eq("escritorio_id", esc.id);
      const [m, c, a, l, t, cr] = await Promise.all([
        q("membros").eq("ativo", true),
        admin ? q("convites").is("aceito_em", null) : Promise.resolve({ count: 0 }),
        q("aulas").eq("publicada", true),
        q("ambientes").not("link_chamada", "is", null),
        q("trilhas").eq("publicada", true),
        q("credenciamentos").eq("perfil_id", eu.id),
      ]);
      setConta({ membros: m.count ?? 0, convites: c.count ?? 0, aulas: a.count ?? 0, links: l.count ?? 0, trilhas: t.count ?? 0, cred: cr.count ?? 0 });
    })();
    const canal = supabase
      .channel(`avisos-${esc.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "avisos", filter: `escritorio_id=eq.${esc.id}` }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, esc.id, eu.id, admin, carregar]);

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!titulo.trim()) return setErro("Dê um título ao aviso.");
    const { error } = await supabase.from("avisos").insert({ escritorio_id: esc.id, titulo: titulo.trim(), texto: texto.trim(), autor_id: eu.id });
    if (error) return setErro(erroMsg(error));
    setTitulo("");
    setTexto("");
    setAbrir(false);
    carregar();
  }

  async function apagar(id: string) {
    if (!confirm("Apagar este aviso?")) return;
    await supabase.from("avisos").delete().eq("id", id);
    carregar();
  }

  const passos = [
    { ok: conta.membros + conta.convites > 1, t: "Convide a equipe", d: "Cadastre o e-mail de cada pessoa e o papel dela.", href: "/equipe" },
    { ok: conta.aulas > 0, t: "Cadastre a primeira aula", d: "Escolha uma trilha dos Padrões e adicione vídeo e texto.", href: "/padroes" },
    { ok: conta.links > 0, t: "Configure os links de chamada", d: "Um link fixo do Google Meet para cada ambiente da sala.", href: "/config" },
  ];
  const pendentes = passos.filter((p) => !p.ok).length;

  return (
    <>
      <Cabeca kicker={`${PAPEL[papel]} · ${esc.nome}`} titulo={`Bom dia, ${primeiroNome(eu.nome)}.`.replace("Bom dia", saudacao())}>
        <Link className="btn" href="/sala">Entrar na sala</Link>
      </Cabeca>

      {admin && pendentes > 0 && (
        <section className="box" style={{ marginBottom: 24 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 className="sec-t" style={{ margin: 0 }}>Primeiros passos</h2>
            <a className="btn small" href={MODELO_URL} target="_blank" rel="noreferrer">Ver modelo</a>
          </div>
          <div className="stack">
            {passos.map((p) => (
              <Link key={p.t} href={p.href} className="row" style={{ textDecoration: "none", color: "inherit", flexWrap: "nowrap" }}>
                <span className={`pill ${p.ok ? "inv" : "dash"}`}>{p.ok ? "Feito" : "A fazer"}</span>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: "block" }}>{p.t}</strong>
                  <small className="note">{p.d}</small>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid2" style={{ marginBottom: 28 }}>
        <Link href="/padroes" className="box trilha-card">
          <p className="mono">Padrões EZE</p>
          <strong style={{ fontSize: 22 }}>{conta.cred} de {conta.trilhas}</strong>
          <span className="note">trilhas concluídas por você</span>
        </Link>
        <Link href="/equipe" className="box trilha-card">
          <p className="mono">Equipe</p>
          <strong style={{ fontSize: 22 }}>{conta.membros}</strong>
          <span className="note">{conta.convites ? `pessoas no escritório · ${conta.convites} convite(s) aguardando` : "pessoas no escritório"}</span>
        </Link>
      </div>

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 className="sec-t" style={{ margin: 0 }}>Mural</h2>
        {admin && !abrir && (
          <button className="btn small" type="button" onClick={() => setAbrir(true)}>Novo aviso</button>
        )}
      </div>

      {admin && abrir && (
        <form className="box stack" style={{ marginBottom: 16 }} onSubmit={publicar}>
          <label className="form-l">
            <span>Título</span>
            <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} autoFocus />
          </label>
          <label className="form-l">
            <span>Texto</span>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} />
          </label>
          {erro && <p className="err" role="alert">{erro}</p>}
          <div className="row">
            <button className="btn dark small" type="submit">Publicar</button>
            <button className="btn small" type="button" onClick={() => setAbrir(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {avisos === null ? (
        <p className="note">Carregando…</p>
      ) : avisos.length === 0 ? (
        <Vazio titulo="Nenhum aviso ainda" texto={admin ? "Avisos publicados aqui aparecem para toda a equipe." : "Quando houver avisos do escritório, eles aparecem aqui."} />
      ) : (
        <div className="lista">
          {avisos.map((a) => (
            <article key={a.id} style={{ padding: "16px 18px", display: "flex", gap: 12 }}>
              <Avatar nome={a.autor?.nome} foto={a.autor?.foto_url} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{a.titulo}</strong>
                  <small className="note">{dataHora(a.created_at)}</small>
                </div>
                {a.texto && <p className="texto-aula" style={{ marginTop: 4 }}>{a.texto}</p>}
                {admin && (
                  <button className="linkbtn note" type="button" style={{ marginTop: 6 }} onClick={() => apagar(a.id)}>Apagar</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
