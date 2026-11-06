"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../../ctx";
import { Cabeca } from "../../ui";
import { nomeProjeto } from "@/lib/gestor";
import { erroMsg } from "@/lib/util";
import { ACEITOS, CAMADA_NOME, LIMITE_ARQ, aceito, aplica, nomeArquivo, ordenar, tamanho, type Analista, type Arquivo } from "@/lib/analistas";
import { AbasAnalise } from "../comum";

type Proj = { id: string; nome: string; codigo: number | null; tipologia: string | null; cidade: string | null; status: string };
type Et = { sigla: string; nome: string };
type Conteudo = Record<string, { itens: number; docs: number }>;

export default function Pagina() {
  return (
    <Suspense fallback={<p className="note">Carregando…</p>}>
      <Nova />
    </Suspense>
  );
}

function Nova() {
  const { esc } = useApp();
  const router = useRouter();
  const qs = useSearchParams();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [projetos, setProjetos] = useState<Proj[]>([]);
  const [etapas, setEtapas] = useState<Et[]>([]);
  const [analistas, setAnalistas] = useState<Analista[]>([]);
  const [conteudo, setConteudo] = useState<Conteudo>({});
  const [projetoId, setProjetoId] = useState(qs.get("projeto") || "");
  const [etapa, setEtapa] = useState(qs.get("etapa") || "");
  const [cidade, setCidade] = useState("");
  const [titulo, setTitulo] = useState("");
  const [tituloMexido, setTituloMexido] = useState(false);
  const [obs, setObs] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [marcados, setMarcados] = useState<Set<string> | null>(null);
  const [enviando, setEnviando] = useState("");
  const [erro, setErro] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [brief, setBrief] = useState<{ objetivos: number; versao: number | null } | null>(null);
  const arq = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("projetos").select("id,nome,codigo,tipologia,cidade,status").eq("escritorio_id", esc.id).neq("status", "finalizado").order("codigo", { ascending: false, nullsFirst: false }),
      supabase.from("etapas_modelo").select("sigla,nome").eq("escritorio_id", esc.id).eq("ativo", true).order("ordem"),
      supabase.from("analistas").select("*").eq("escritorio_id", esc.id).eq("ativo", true),
      supabase.from("analista_itens").select("analista_id").eq("escritorio_id", esc.id).eq("ativo", true),
      supabase.from("analista_docs").select("analista_id").eq("escritorio_id", esc.id),
    ]).then(([p, e, a, i, d]) => {
      if (a.error) setErro(a.error.message.includes("analistas") ? "Rode a migração 0012 no Supabase para ativar a pré-análise." : a.error.message);
      setProjetos((p.data as Proj[]) ?? []);
      setEtapas((e.data as Et[]) ?? []);
      setAnalistas(ordenar((a.data as Analista[]) ?? []));
      const c: Conteudo = {};
      for (const x of (i.data as { analista_id: string }[]) ?? []) (c[x.analista_id] ??= { itens: 0, docs: 0 }).itens++;
      for (const x of (d.data as { analista_id: string }[]) ?? []) (c[x.analista_id] ??= { itens: 0, docs: 0 }).docs++;
      setConteudo(c);
    });
  }, [supabase, esc.id]);

  const projeto = projetos.find((p) => p.id === projetoId) || null;

  // Cidade e título seguem o projeto e a etapa (até a pessoa mudar à mão)
  useEffect(() => {
    if (projeto) setCidade(projeto.cidade || "");
  }, [projeto]);
  useEffect(() => {
    if (tituloMexido) return;
    const et = etapas.find((x) => x.sigla === etapa);
    setTitulo([et?.nome, projeto?.nome].filter(Boolean).join(" – "));
  }, [etapa, projeto, etapas, tituloMexido]);

  // Briefing do projeto: camada Cliente, automática
  useEffect(() => {
    setBrief(null);
    if (!projetoId) return;
    Promise.all([
      supabase.from("briefing_objetivos").select("id", { count: "exact", head: true }).eq("projeto_id", projetoId).eq("ativo", true),
      supabase.from("projeto_briefings").select("versao").eq("projeto_id", projetoId).maybeSingle(),
    ]).then(([o, b]) => setBrief({ objetivos: o.count ?? 0, versao: (b.data as { versao: number } | null)?.versao ?? null }));
  }, [supabase, projetoId]);

  const automaticos = useMemo(() => analistas.filter((a) => aplica(a, etapa || null, cidade || null)), [analistas, etapa, cidade]);
  useEffect(() => {
    setMarcados(new Set(automaticos.map((a) => a.id)));
  }, [automaticos]);
  const temConteudo = (a: Analista) => !!a.orientacoes.trim() || !!conteudo[a.id];

  function adicionar(lista: FileList | File[] | null) {
    if (!lista) return;
    setErro("");
    const novos: File[] = [];
    for (const f of Array.from(lista)) {
      if (!aceito(f.type)) {
        setErro(`${f.name}: a IA lê PDF e imagens (PNG, JPG, WEBP). Exporte DWG/RVT/SKP em PDF.`);
        continue;
      }
      novos.push(f);
    }
    setArquivos((a) => [...a, ...novos]);
    if (arq.current) arq.current.value = "";
  }
  const total = arquivos.reduce((s, f) => s + f.size, 0);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!etapa) return setErro("Escolha a etapa.");
    if (!titulo.trim()) return setErro("Dê um título para a entrega.");
    if (!arquivos.length) return setErro("Envie pelo menos um PDF ou imagem.");
    if (total > LIMITE_ARQ) return setErro("Os arquivos somam mais de 32 MB. Exporte o PDF mais leve ou envie em partes.");
    const ids = [...(marcados ?? [])];
    if (!ids.length) return setErro("Marque pelo menos um analista.");
    const id = crypto.randomUUID();
    const enviados: Arquivo[] = [];
    try {
      for (const [n, f] of arquivos.entries()) {
        setEnviando(`Enviando ${n + 1} de ${arquivos.length}…`);
        const caminho = `${esc.id}/analises/${id}/${Date.now()}-${nomeArquivo(f.name)}`;
        const up = await supabase.storage.from("analises").upload(caminho, f, { contentType: f.type });
        if (up.error) throw up.error;
        enviados.push({ nome: f.name, caminho, mime: f.type, tamanho: f.size });
      }
      setEnviando("Criando a análise…");
      const { error } = await supabase.from("analises").insert({
        id,
        escritorio_id: esc.id,
        projeto_id: projetoId || null,
        etapa_sigla: etapa,
        cidade: cidade.trim() || null,
        titulo: titulo.trim(),
        obs: obs.trim() || null,
        arquivos: enviados,
        analistas_ids: ids,
      });
      if (error) throw error;
      await fetch(`/api/analises/${id}/rodar`, { method: "POST" }).catch(() => null);
      router.push(`/analises/${id}`);
    } catch (err) {
      if (enviados.length) await supabase.storage.from("analises").remove(enviados.map((x) => x.caminho));
      setErro(erroMsg(err));
      setEnviando("");
    }
  }

  return (
    <>
      <Cabeca kicker="Pré-análise IA" titulo="Enviar para análise" />
      <AbasAnalise />
      <form className="grid2 ia-nova" onSubmit={enviar}>
        <section className="box stack">
          <label className="form-l">
            <span>Projeto</span>
            <select className="f" value={projetoId} onChange={(e) => setProjetoId(e.target.value)}>
              <option value="">Sem projeto (teste ou calibragem)</option>
              {projetos.map((p) => <option key={p.id} value={p.id}>{nomeProjeto(p)}</option>)}
            </select>
          </label>
          <div className="grid2" style={{ gap: 12 }}>
            <label className="form-l">
              <span>Etapa</span>
              <select className="f" value={etapa} onChange={(e) => setEtapa(e.target.value)} required>
                <option value="">Escolha…</option>
                {etapas.map((x) => <option key={x.sigla} value={x.sigla}>{x.sigla} · {x.nome}</option>)}
              </select>
            </label>
            <label className="form-l">
              <span>Cidade</span>
              <input type="text" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex.: Bombinhas" />
            </label>
          </div>
          <label className="form-l">
            <span>Título da entrega</span>
            <input type="text" value={titulo} onChange={(e) => { setTitulo(e.target.value); setTituloMexido(true); }} placeholder="Ex.: Aprovativo – Oceana" />
          </label>
          <label className="form-l">
            <span>Pedir atenção a (opcional)</span>
            <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: confira o recuo frontal e a taxa de ocupação; mudei a fachada norte." />
          </label>

          <div
            className={`ia-drop${arrastando ? " on" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files); }}
          >
            <input ref={arq} type="file" multiple hidden accept={ACEITOS} onChange={(e) => adicionar(e.target.files)} />
            <p style={{ margin: 0, fontWeight: 600 }}>Pranchas em PDF e renders</p>
            <p className="note" style={{ margin: "4px 0 12px" }}>Arraste aqui ou escolha. Até 32 MB no total e 100 páginas de PDF por análise.</p>
            <button className="btn small" type="button" onClick={() => arq.current?.click()}>Escolher arquivos</button>
          </div>
          {arquivos.length > 0 && (
            <div className="lista">
              {arquivos.map((f, i) => (
                <div key={i} className="item">
                  <span className="doc-ic">{f.type === "application/pdf" ? "PDF" : "IMG"}</span>
                  <span className="item-t"><strong style={{ fontWeight: 500 }}>{f.name}</strong><small>{tamanho(f.size)}</small></span>
                  <button className="btn small ghost" type="button" onClick={() => setArquivos((a) => a.filter((_, j) => j !== i))}>Tirar</button>
                </div>
              ))}
              <div className="item note" style={{ justifyContent: "flex-end" }}>Total {tamanho(total)}</div>
            </div>
          )}
        </section>

        <section className="box stack">
          <div>
            <p className="sec-t" style={{ marginBottom: 4 }}>Analistas desta análise</p>
            <p className="note" style={{ margin: 0 }}>Escolhidos pela etapa e pela cidade. Pode marcar ou desmarcar.</p>
          </div>
          {projetoId && (
            <div className={`ia-esc${brief?.objetivos ? " on" : ""}`} style={{ cursor: "default" }}>
              <input type="checkbox" checked={!!brief && (brief.objetivos > 0 || brief.versao !== null)} disabled readOnly aria-label="Cliente" />
              <span className="item-t">
                <strong>Cliente · briefing do projeto</strong>
                <small>
                  {brief === null ? "Carregando…" : brief.objetivos > 0 ? `${brief.objetivos} objetivos · versão ${brief.versao ?? 1} · entra primeiro` : brief.versao !== null ? "Briefing sem objetivos listados" : "Projeto sem briefing: o parecer vai avisar"}
                </small>
              </span>
              <Link className="pill" href={`/projetos/${projetoId}/briefing`} target="_blank">Abrir</Link>
            </div>
          )}
          {!etapa ? (
            <p className="note">Escolha a etapa para ver os analistas.</p>
          ) : analistas.length === 0 ? (
            <p className="note">Nenhum analista cadastrado. <Link href="/analistas">Cadastrar</Link></p>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {analistas
                .filter((a) => automaticos.includes(a) || marcados?.has(a.id) || a.camada !== "municipio")
                .map((a) => {
                  const on = !!marcados?.has(a.id);
                  const cheio = temConteudo(a);
                  return (
                    <label key={a.id} className={`ia-esc${on ? " on" : ""}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          const s = new Set(marcados ?? []);
                          if (e.target.checked) s.add(a.id);
                          else s.delete(a.id);
                          setMarcados(s);
                        }}
                      />
                      <span className="item-t">
                        <strong>{a.nome}</strong>
                        <small>
                          {CAMADA_NOME[a.camada]}
                          {a.cidades.length ? ` · ${a.cidades.join(", ")}` : ""}
                          {cheio ? ` · ${conteudo[a.id]?.itens ?? 0} itens · ${conteudo[a.id]?.docs ?? 0} documentos` : " · ainda sem conteúdo, não entra"}
                        </small>
                      </span>
                      {automaticos.includes(a) && <span className="pill">Automático</span>}
                    </label>
                  );
                })}
            </div>
          )}
          {erro && <p className="err" role="alert">{erro}</p>}
          <div className="row">
            <button className="btn dark" type="submit" disabled={!!enviando}>{enviando || "Enviar e analisar"}</button>
            <Link className="btn" href="/analises">Cancelar</Link>
          </div>
          <p className="note" style={{ margin: 0 }}>A análise leva de 1 a 4 minutos. Você pode sair da tela; o parecer fica salvo aqui. A decisão final é sempre do responsável.</p>
        </section>
      </form>
    </>
  );
}
