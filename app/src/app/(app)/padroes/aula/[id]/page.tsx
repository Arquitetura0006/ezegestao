"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../../../ctx";
import { Vazio } from "../../../ui";
import { erroMsg, videoEmbed } from "@/lib/util";

type Bloco = { tipo: "video"; url: string } | { tipo: "texto"; texto: string } | { tipo: "arquivo"; url: string; nome: string };
type Aula = { id: string; titulo: string; blocos: Bloco[]; publicada: boolean; trilha_id: string; ordem: number };

function Video({ url }: { url: string }) {
  const src = videoEmbed(url);
  if (!src) return <p><a href={url} target="_blank" rel="noreferrer">Abrir vídeo</a></p>;
  return (
    <div className="video">
      <iframe src={src} title="Vídeo da aula" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
    </div>
  );
}

export default function AulaPg({ params }: { params: { id: string } }) {
  const { eu, admin } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const router = useRouter();
  const [a, setA] = useState<Aula | null | undefined>(undefined);
  const [trilha, setTrilha] = useState<{ titulo: string; aulas: { id: string; ordem: number; publicada: boolean }[] } | null>(null);
  const [feita, setFeita] = useState(false);
  const [editar, setEditar] = useState(false);
  const [rasc, setRasc] = useState<{ titulo: string; blocos: Bloco[] }>({ titulo: "", blocos: [] });
  const [msg, setMsg] = useState<{ t: "ok" | "err"; s: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("aulas").select("id,titulo,blocos,publicada,trilha_id,ordem").eq("id", params.id).maybeSingle();
    setA((data as Aula) ?? null);
    if (data) {
      setRasc({ titulo: data.titulo, blocos: (data.blocos as Bloco[]) ?? [] });
      const [{ data: t }, { data: p }] = await Promise.all([
        supabase.from("trilhas").select("titulo,aulas(id,ordem,publicada)").eq("id", data.trilha_id).maybeSingle(),
        supabase.from("progresso_aula").select("concluida_em").eq("perfil_id", eu.id).eq("aula_id", params.id).maybeSingle(),
      ]);
      setTrilha(t as typeof trilha);
      setFeita(!!p?.concluida_em);
    }
  }, [supabase, params.id, eu.id]);

  useEffect(() => {
    carregar();
    if (admin && new URLSearchParams(window.location.search).get("editar")) setEditar(true);
  }, [carregar, admin]);

  async function concluir() {
    setMsg(null);
    const { data, error } = await supabase.rpc("concluir_aula", { p_aula: params.id });
    if (error) return setMsg({ t: "err", s: erroMsg(error) });
    setFeita(true);
    setMsg({ t: "ok", s: data ? "Trilha concluída. Você está credenciado nesta habilidade." : "Aula concluída." });
  }

  async function salvar(publicada?: boolean) {
    if (!a) return;
    setSalvando(true);
    setMsg(null);
    const blocos = rasc.blocos.filter((b) => (b.tipo === "texto" ? b.texto.trim() : b.url.trim()));
    const { error } = await supabase
      .from("aulas")
      .update({ titulo: rasc.titulo.trim() || "Sem título", blocos, atualizada_em: new Date().toISOString(), ...(publicada === undefined ? {} : { publicada }) })
      .eq("id", a.id);
    setSalvando(false);
    if (error) return setMsg({ t: "err", s: erroMsg(error) });
    setMsg({ t: "ok", s: publicada === undefined ? "Aula salva." : publicada ? "Aula publicada." : "Aula voltou para rascunho." });
    await carregar();
    if (publicada !== undefined) setEditar(false);
  }

  async function excluir() {
    if (!a || !confirm("Excluir esta aula? Não dá para desfazer.")) return;
    await supabase.from("aulas").delete().eq("id", a.id);
    router.push(`/padroes/${a.trilha_id}`);
  }

  function setBloco(i: number, b: Bloco) {
    setRasc((r) => ({ ...r, blocos: r.blocos.map((x, k) => (k === i ? b : x)) }));
  }
  function mover(i: number, d: number) {
    setRasc((r) => {
      const j = i + d;
      if (j < 0 || j >= r.blocos.length) return r;
      const b = [...r.blocos];
      [b[i], b[j]] = [b[j], b[i]];
      return { ...r, blocos: b };
    });
  }
  function remover(i: number) {
    setRasc((r) => ({ ...r, blocos: r.blocos.filter((_, k) => k !== i) }));
  }
  function add(b: Bloco) {
    setRasc((r) => ({ ...r, blocos: [...r.blocos, b] }));
  }

  if (a === undefined) return <p className="note">Carregando…</p>;
  if (a === null || (!admin && !a.publicada)) return <Vazio titulo="Aula não encontrada"><Link className="btn small" href="/padroes">Voltar</Link></Vazio>;

  const seq = (trilha?.aulas ?? []).filter((x) => admin || x.publicada).sort((x, y) => x.ordem - y.ordem);
  const idx = seq.findIndex((x) => x.id === a.id);
  const ant = idx > 0 ? seq[idx - 1] : null;
  const prox = idx >= 0 && idx < seq.length - 1 ? seq[idx + 1] : null;

  return (
    <div style={{ maxWidth: 860 }}>
      <p style={{ margin: "0 0 12px" }}>
        <Link href={`/padroes/${a.trilha_id}`} className="note">← {trilha?.titulo || "Trilha"}</Link>
      </p>

      {!editar ? (
        <>
          <div className="cabeca">
            <div>
              <p className="mono" style={{ marginBottom: 8 }}>
                Aula {idx + 1} de {seq.length}
                {!a.publicada ? " · Rascunho" : ""}
                {feita ? " · Concluída" : ""}
              </p>
              <h1 className="h-l">{a.titulo}</h1>
            </div>
            {admin && <div className="cabeca-acoes"><button className="btn" type="button" onClick={() => setEditar(true)}>Editar aula</button></div>}
          </div>

          {a.blocos.length === 0 ? (
            <Vazio titulo="Aula sem conteúdo" texto={admin ? "Clique em Editar aula para adicionar vídeo, texto ou arquivo." : "O conteúdo desta aula ainda está sendo preparado."} />
          ) : (
            <div className="stack" style={{ gap: 20 }}>
              {a.blocos.map((b, i) =>
                b.tipo === "video" ? (
                  <Video key={i} url={b.url} />
                ) : b.tipo === "texto" ? (
                  <div key={i} className="box"><p className="texto-aula">{b.texto}</p></div>
                ) : (
                  <a key={i} className="box item" href={b.url} target="_blank" rel="noreferrer" style={{ padding: 16 }}>
                    <span className="pill">Arquivo</span>
                    <span className="item-t"><strong>{b.nome || "Abrir arquivo"}</strong></span>
                  </a>
                )
              )}
            </div>
          )}

          <div className="row" style={{ marginTop: 28, justifyContent: "space-between" }}>
            {ant ? <Link className="btn" href={`/padroes/aula/${ant.id}`}>← Anterior</Link> : <span />}
            <div className="row">
              {a.publicada && !feita && <button className="btn dark" type="button" onClick={concluir}>Concluir aula</button>}
              {prox && <Link className={`btn${feita ? " dark" : ""}`} href={`/padroes/aula/${prox.id}`}>Próxima →</Link>}
            </div>
          </div>
          {msg && <p className={msg.t} role="status" style={{ marginTop: 12 }}>{msg.s}</p>}
        </>
      ) : (
        <>
          <h1 className="h-l" style={{ marginBottom: 20 }}>Editar aula</h1>
          <div className="stack">
            <label className="form-l">
              <span>Título da aula</span>
              <input type="text" value={rasc.titulo} onChange={(e) => setRasc({ ...rasc, titulo: e.target.value })} maxLength={120} />
            </label>

            {rasc.blocos.map((b, i) => (
              <div key={i} className="bloco-ed">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong style={{ fontSize: 14 }}>{b.tipo === "video" ? "Vídeo" : b.tipo === "texto" ? "Texto" : "Arquivo"}</strong>
                  <span className="row" style={{ gap: 4 }}>
                    <button className="btn small ghost" type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                    <button className="btn small ghost" type="button" onClick={() => mover(i, 1)} disabled={i === rasc.blocos.length - 1} aria-label="Descer">↓</button>
                    <button className="btn small ghost" type="button" onClick={() => remover(i)}>Remover</button>
                  </span>
                </div>
                {b.tipo === "video" && (
                  <>
                    <input type="url" value={b.url} onChange={(e) => setBloco(i, { tipo: "video", url: e.target.value })} placeholder="Link do YouTube, Vimeo, Google Drive ou Loom" />
                    {b.url && (videoEmbed(b.url) ? <Video url={b.url} /> : <p className="note" style={{ margin: 0 }}>Link não reconhecido como vídeo. A equipe verá um botão para abrir.</p>)}
                  </>
                )}
                {b.tipo === "texto" && <textarea value={b.texto} onChange={(e) => setBloco(i, { tipo: "texto", texto: e.target.value })} placeholder="Explique o padrão, o passo a passo, os cuidados…" style={{ minHeight: 140 }} />}
                {b.tipo === "arquivo" && (
                  <div className="grid2" style={{ gap: 10 }}>
                    <input type="text" value={b.nome} onChange={(e) => setBloco(i, { ...b, nome: e.target.value })} placeholder="Nome (ex.: Modelo de prancha A1)" />
                    <input type="url" value={b.url} onChange={(e) => setBloco(i, { ...b, url: e.target.value })} placeholder="Link do arquivo (Drive, Dropbox…)" />
                  </div>
                )}
              </div>
            ))}

            <div className="row">
              <span className="note">Adicionar:</span>
              <button className="btn small" type="button" onClick={() => add({ tipo: "video", url: "" })}>Vídeo</button>
              <button className="btn small" type="button" onClick={() => add({ tipo: "texto", texto: "" })}>Texto</button>
              <button className="btn small" type="button" onClick={() => add({ tipo: "arquivo", url: "", nome: "" })}>Arquivo</button>
            </div>
            <p className="note" style={{ margin: 0 }}>
              Dica: suba o vídeo no YouTube como <strong>não listado</strong> ou no Google Drive com acesso por link, e cole o endereço aqui.
            </p>

            <div className="box row" style={{ justifyContent: "space-between", position: "sticky", bottom: 80, zIndex: 5 }}>
              <span className="note">{a.publicada ? "Publicada: a equipe vê esta aula." : "Rascunho: só administradores veem."}</span>
              <span className="row">
                <button className="btn small ghost" type="button" onClick={excluir}>Excluir</button>
                <button className="btn small" type="button" onClick={() => { setEditar(false); setRasc({ titulo: a.titulo, blocos: a.blocos }); setMsg(null); }}>Fechar</button>
                <button className="btn small" type="button" disabled={salvando} onClick={() => salvar()}>Salvar</button>
                <button className="btn small dark" type="button" disabled={salvando} onClick={() => salvar(!a.publicada)}>{a.publicada ? "Salvar e despublicar" : "Salvar e publicar"}</button>
              </span>
            </div>
            {msg && <p className={msg.t} role={msg.t === "err" ? "alert" : "status"}>{msg.s}</p>}
          </div>
        </>
      )}
    </div>
  );
}
