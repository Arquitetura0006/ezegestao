"use client";

import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, ConnectionMode, Controls, Handle, MarkerType, MiniMap, Panel, Position, ReactFlow, ReactFlowProvider,
  addEdge, getNodesBounds, getViewportForBounds, useEdgesState, useNodesState, useReactFlow,
  type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import { toPng } from "html-to-image";
import { supabaseNavegador } from "@/lib/supabase/client";
import { FUNCAO, type Funcao, type Pessoa, type ProjetoCoord } from "@/lib/coord";
import {
  ESTILO_SELO, FORMA, MODELOS, PAPEL, TIPO_NO, VINCULO, novoId, soEstrutura,
  type Contratacao, type EstiloSelo, type DadosNo, type DadosVinculo, type Forma, type NoSalvo, type Papel, type TipoNo, type TipoVinculo, type VinculoSalvo,
} from "@/lib/organograma";
import { erroMsg, iniciais } from "@/lib/util";

type No = Node<DadosNo, TipoNo>;
type Vinc = Edge<DadosVinculo>;

// ---------- Aparência dos vínculos ----------
function estilo(e: Vinc): Vinc {
  const tipo = e.data?.tipo ?? "subordinacao";
  const cor = "#16181d";
  const seta = { type: MarkerType.ArrowClosed, color: cor, width: 18, height: 18 };
  return {
    ...e,
    type: "smoothstep",
    label: e.data?.rotulo || undefined,
    labelStyle: { fontSize: 12, fontWeight: 600, fill: cor },
    labelBgStyle: { fill: "#fff" },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 6,
    style: { stroke: cor, strokeWidth: 1.6, strokeDasharray: tipo === "apoio" ? "6 5" : undefined },
    markerEnd: seta,
    markerStart: tipo === "interface" ? seta : undefined,
  };
}

// ---------- Cards ----------
const PONTOS: [Position, string][] = [[Position.Top, "t"], [Position.Bottom, "b"], [Position.Left, "l"], [Position.Right, "r"]];
function Pontos() {
  return (
    <>
      {PONTOS.map(([p, id]) => <Handle key={id} id={id} type="source" position={p} className="og-ponto" />)}
    </>
  );
}

const Contratacoes = createContext<Contratacao[]>([]);

function Selo({ c }: { c: Contratacao }) {
  return <span className={`og-selo og-s-${c.estilo}`}>{c.sigla}</span>;
}

const Card = memo(function Card({ data, type, selected }: NodeProps<No>) {
  const lista = useContext(Contratacoes);
  const contrato = data.contratacao ? lista.find((c) => c.id === data.contratacao) : undefined;
  const forma: Forma = data.forma ?? (type === "pessoa" ? "redondo" : type === "nota" ? "reto" : "arredondado");
  const vaga = type === "pessoa" && !data.perfil_id && !data.convidado_id;
  const cls = ["og-card", `og-${type}`, `og-f-${forma}`, data.destaque ? "og-dest" : "", data.escuro ? "og-esc" : "", vaga ? "og-vaga" : "", selected ? "og-sel" : ""]
    .filter(Boolean).join(" ");
  const foto = typeof data.foto === "string" ? data.foto : null;
  return (
    <div className={cls}>
      <Pontos />
      {contrato && <Selo c={contrato} />}
      {type === "pessoa" && (
        <span className="og-av">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {foto ? <img src={foto} alt="" referrerPolicy="no-referrer" /> : vaga ? "?" : iniciais(data.nome)}
        </span>
      )}
      <span className="og-txt">
        {type === "funcao" && data.papel === "coordenacao" && <small className="og-tag">Coordenação</small>}
        {type === "funcao" && data.disciplina && data.papel === "disciplina" && <small className="og-tag">{data.disciplina}</small>}
        <strong>{data.nome || TIPO_NO[type]}</strong>
        {data.sub && <small>{data.sub}</small>}
      </span>
    </div>
  );
});
const TIPOS_NO = { pessoa: Card, funcao: Card, empresa: Card, nota: Card };

// ---------- Conversão para salvar ----------
const paraSalvar = (nos: No[], vs: Vinc[]) => ({
  nos: nos.map((n) => ({ id: n.id, type: n.type as TipoNo, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: n.data })) as NoSalvo[],
  arestas: vs.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null, data: e.data ?? { tipo: "subordinacao" } })) as VinculoSalvo[],
});
const deSalvo = (nos: NoSalvo[], vs: VinculoSalvo[]) => ({
  nos: nos.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })) as No[],
  arestas: vs.map((e) => estilo({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined, data: e.data } as Vinc)),
});

function Editor({ projeto }: { projeto: ProjetoCoord }) {
  const supabase = useMemo(() => supabaseNavegador(), []);
  const pode = projeto.coordena;
  const rf = useReactFlow<No, Vinc>();
  const [nos, setNos, mudarNos] = useNodesState<No>([]);
  const [vs, setVs, mudarVs] = useEdgesState<Vinc>([]);
  const [carregado, setCarregado] = useState(false);
  const [vazio, setVazio] = useState(false);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [contratos, setContratos] = useState<Contratacao[]>([]);
  const [legendaEd, setLegendaEd] = useState(false);
  const [estado, setEstado] = useState<"" | "salvando" | "salvo" | "erro">("");
  const [aviso, setAviso] = useState("");
  const [tipoVinc, setTipoVinc] = useState<TipoVinculo>("subordinacao");
  const [copiar, setCopiar] = useState<{ projeto_id: string; codigo: number | null; nome: string; nos: number }[] | null>(null);
  const pronto = useRef(false);
  const gravado = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const quadro = useRef<HTMLDivElement>(null);

  const avisar = useCallback((t: string) => {
    setAviso(t);
    setTimeout(() => setAviso(""), 5000);
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: o }, { data: p }, { data: ct }] = await Promise.all([
        supabase.from("projeto_organogramas").select("nos,arestas").eq("projeto_id", projeto.id).maybeSingle(),
        supabase.rpc("coord_pessoas", { proj: projeto.id }),
        supabase.from("org_contratacoes").select("id,nome,sigla,estilo,descricao,ordem,ativo").eq("escritorio_id", projeto.escritorio_id).order("ordem"),
      ]);
      setPessoas((p as Pessoa[]) ?? []);
      setContratos((ct as Contratacao[]) ?? []);
      const salvo = o as { nos: NoSalvo[]; arestas: VinculoSalvo[] } | null;
      if (salvo && salvo.nos.length) {
        const d = deSalvo(salvo.nos, salvo.arestas);
        setNos(d.nos);
        setVs(d.arestas);
      } else setVazio(true);
      setCarregado(true);
      if (salvo) gravado.current = JSON.stringify(paraSalvar(deSalvo(salvo.nos, salvo.arestas).nos, deSalvo(salvo.nos, salvo.arestas).arestas));
      setTimeout(() => {
        rf.fitView({ padding: 0.2 });
        pronto.current = true;
      }, 60);
    })();
  }, [supabase, projeto.id, projeto.escritorio_id, setNos, setVs, rf]);

  // Salva sozinho, um pouco depois da última mudança
  const salvar = useCallback(async (n: No[], e: Vinc[]) => {
    setEstado("salvando");
    const s = paraSalvar(n, e);
    const { data, error } = await supabase.rpc("salvar_organograma", { proj: projeto.id, p_nos: s.nos, p_arestas: s.arestas });
    if (error) {
      setEstado("erro");
      avisar(erroMsg(error));
      return;
    }
    setEstado("salvo");
    const r = data as { coordenadores: number } | null;
    if (r && r.coordenadores > 1) avisar("Há mais de uma pessoa ligada à Coordenação. O coordenador do projeto não foi alterado.");
  }, [supabase, projeto.id, avisar]);

  // Só grava quando muda algo que importa (posição, texto, vínculo) — não a cada seleção
  useEffect(() => {
    if (!pode || !pronto.current) return;
    const sinal = JSON.stringify(paraSalvar(nos, vs));
    if (sinal === gravado.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await salvar(nos, vs);
      gravado.current = sinal;
    }, 1200);
  }, [nos, vs, pode, salvar]);

  const onConnect = useCallback(
    (c: Connection) => setVs((atual) => addEdge(estilo({ ...c, id: novoId("e"), data: { tipo: tipoVinc } } as Vinc), atual)),
    [setVs, tipoVinc]
  );

  function adicionar(type: TipoNo, data: Partial<DadosNo> = {}) {
    const centro = rf.screenToFlowPosition({
      x: (quadro.current?.getBoundingClientRect().left ?? 0) + (quadro.current?.clientWidth ?? 800) / 2,
      y: (quadro.current?.getBoundingClientRect().top ?? 0) + (quadro.current?.clientHeight ?? 600) / 2,
    });
    const base: DadosNo = {
      nome: type === "pessoa" ? "A definir" : type === "funcao" ? "Nova função" : type === "empresa" ? "Empresa" : "Anotação",
      forma: type === "pessoa" ? "redondo" : type === "nota" ? "reto" : "arredondado",
      papel: type === "funcao" ? "outro" : undefined,
      ...data,
    };
    const n: No = { id: novoId(), type, position: { x: centro.x - 90 + Math.random() * 40, y: centro.y - 30 + Math.random() * 40 }, data: base, selected: true };
    setNos((atual) => [...atual.map((x) => ({ ...x, selected: false })), n]);
    setVazio(false);
  }

  function aplicarModelo(id: string) {
    const m = MODELOS.find((x) => x.id === id)!;
    if (nos.length && !window.confirm("Substituir o organograma atual pelo modelo?")) return;
    const d = m.criar();
    const c = deSalvo(d.nos, d.arestas);
    pronto.current = true;
    setNos(c.nos);
    setVs(c.arestas);
    setVazio(false);
    setTimeout(() => rf.fitView({ padding: 0.2 }), 60);
  }

  async function abrirCopiar() {
    const { data, error } = await supabase.rpc("organogramas_disponiveis", { proj: projeto.id });
    if (error) return avisar(erroMsg(error));
    setCopiar((data as { projeto_id: string; codigo: number | null; nome: string; nos: number }[]) ?? []);
  }
  async function copiarDe(origem: string, pessoasJunto: boolean) {
    const { data, error } = await supabase.rpc("organograma_de", { origem, proj: projeto.id }).maybeSingle();
    if (error || !data) return avisar(erroMsg(error));
    if (nos.length && !window.confirm("Substituir o organograma atual?")) return;
    const o = data as { nos: NoSalvo[]; arestas: VinculoSalvo[] };
    const c = deSalvo(pessoasJunto ? o.nos : soEstrutura(o.nos), o.arestas);
    pronto.current = true;
    setNos(c.nos);
    setVs(c.arestas);
    setCopiar(null);
    setVazio(false);
    setTimeout(() => rf.fitView({ padding: 0.2 }), 60);
  }

  // ---------- Seleção e edição ----------
  const selNo = nos.find((n) => n.selected) ?? null;
  const selVinc = !selNo ? vs.find((e) => e.selected) ?? null : null;
  const mudarNo = (id: string, d: Partial<DadosNo>) => setNos((a) => a.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...d } } : n)));
  const mudarVinc = (id: string, d: Partial<DadosVinculo>) =>
    setVs((a) => a.map((e) => (e.id === id ? estilo({ ...e, data: { ...(e.data ?? { tipo: "subordinacao" }), ...d } as DadosVinculo }) : e)));
  const apagar = () => {
    if (selNo) {
      setNos((a) => a.filter((n) => n.id !== selNo.id));
      setVs((a) => a.filter((e) => e.source !== selNo.id && e.target !== selNo.id));
    } else if (selVinc) setVs((a) => a.filter((e) => e.id !== selVinc.id));
  };
  const duplicar = () => {
    if (!selNo) return;
    const n: No = { ...selNo, id: novoId(), position: { x: selNo.position.x + 40, y: selNo.position.y + 40 }, selected: true };
    setNos((a) => [...a.map((x) => ({ ...x, selected: false })), n]);
  };

  function escolherPessoa(no: No, chave: string) {
    if (!chave) return mudarNo(no.id, { perfil_id: null, convidado_id: null, foto: null, nome: "A definir" });
    const p = pessoas.find((x) => (x.convidado_id ? `c:${x.convidado_id}` : `p:${x.perfil_id}`) === chave);
    if (!p) return;
    mudarNo(no.id, {
      perfil_id: p.convidado_id ? null : p.perfil_id,
      convidado_id: p.convidado_id,
      nome: p.nome,
      foto: p.foto,
      sub: no.data.sub || (p.grupo !== "equipe" ? [FUNCAO[p.grupo as Funcao], p.empresa].filter(Boolean).join(" · ") : p.empresa ?? ""),
    });
  }

  // ---------- PDF (P&B, com logo) ----------
  async function exportar() {
    const el = document.querySelector<HTMLElement>(".og-quadro .react-flow__viewport");
    if (!el || !nos.length) return;
    const larg = 2200;
    const alt = 1400;
    const b = getNodesBounds(nos);
    const vp = getViewportForBounds(b, larg, alt, 0.2, 2, 0.08);
    try {
      const png = await toPng(el, {
        backgroundColor: "#ffffff",
        width: larg,
        height: alt,
        style: { width: `${larg}px`, height: `${alt}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
        filter: (n) => !(n instanceof HTMLElement && n.classList?.contains("react-flow__handle")),
      });
      const w = window.open("", "_blank");
      if (!w) return avisar("Permita pop-ups para gerar o PDF.");
      const hoje = new Date().toLocaleDateString("pt-BR");
      w.document.write(`<!doctype html><html><head><title>Organograma · ${projeto.nome}</title>
        <style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#000;margin:0}
        header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid #000;padding-bottom:8px;margin-bottom:10px}
        header img{height:42px}h1{font-size:18px;margin:0}p{margin:2px 0;font-size:11px}main img{width:100%;filter:grayscale(1)}</style></head>
        <body><header><img src="${location.origin}/logo-full.png" alt="EZE"><div style="text-align:right"><h1>Organograma do projeto</h1>
        <p>${projeto.codigo ? String(projeto.codigo).padStart(3, "0") + " · " : ""}${projeto.nome}${projeto.cliente ? " · " + projeto.cliente : ""}</p><p>${hoje}</p></div></header>
        <main><img src="${png}" alt=""></main>
        ${usados.length ? `<footer style="display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:8px;font-size:11px;border-top:1px solid #000;padding-top:6px">
          <strong>Contratação:</strong>${usados.map(({ c, n }) => `<span><span style="display:inline-block;padding:1px 6px;border-radius:4px;font-weight:700;font-size:10px;${
            c.estilo === "cheio" ? "background:#000;color:#fff" : c.estilo === "tracejado" ? "border:1px dashed #000" : c.estilo === "cinza" ? "background:#d4d6da" : "border:1px solid #000"
          }">${c.sigla}</span> ${c.nome} (${n})</span>`).join("")}</footer>` : ""}
        <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
      w.document.close();
    } catch (e) {
      avisar(`Não foi possível gerar a imagem: ${erroMsg(e)}`);
    }
  }

  const usados = contratos
    .map((c) => ({ c, n: nos.filter((x) => x.data.contratacao === c.id).length }))
    .filter((x) => x.n > 0);

  const recarregarContratos = useCallback(async () => {
    const { data } = await supabase.from("org_contratacoes").select("id,nome,sigla,estilo,descricao,ordem,ativo").eq("escritorio_id", projeto.escritorio_id).order("ordem");
    setContratos((data as Contratacao[]) ?? []);
  }, [supabase, projeto.escritorio_id]);

  const opcoesPessoa = [
    { t: "Equipe", l: pessoas.filter((p) => p.grupo === "equipe") },
    { t: "Convidados", l: pessoas.filter((p) => p.grupo !== "equipe") },
  ];

  return (
    <div className="cd">
      <header className="cd-topo">
        <div className="row" style={{ gap: 12, minWidth: 0, flexWrap: "nowrap" }}>
          <Link href={`/c/${projeto.id}`} className="marca" aria-label="Voltar à coordenação">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" />
          </Link>
          <div style={{ minWidth: 0 }}>
            <p className="mono" style={{ fontSize: 10.5 }}>Organograma</p>
            <strong className="cd-nome">{projeto.codigo ? `${String(projeto.codigo).padStart(3, "0")} · ` : ""}{projeto.nome}</strong>
          </div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
          {pode && <span className="note" style={{ minWidth: 70, textAlign: "right" }}>{estado === "salvando" ? "Salvando…" : estado === "salvo" ? "Salvo" : estado === "erro" ? "Não salvou" : ""}</span>}
          <button type="button" className="btn small ghost" onClick={exportar} disabled={!nos.length}>PDF</button>
          <Link href={`/c/${projeto.id}`} className="btn small">Coordenação</Link>
        </div>
      </header>

      <div className={`og-corpo${pode ? "" : " so-ver"}`}>
        {pode && (
          <aside className="og-lado" aria-label="Ferramentas">
            <p className="mono">Adicionar</p>
            <div className="og-paleta">
              {(["pessoa", "funcao", "empresa", "nota"] as TipoNo[]).map((t) => (
                <button key={t} type="button" className={`og-add og-add-${t}`} onClick={() => adicionar(t)}>{TIPO_NO[t]}</button>
              ))}
            </div>

            <p className="mono" style={{ marginTop: 16 }}>Novo vínculo</p>
            <div className="stack" style={{ gap: 4 }}>
              {(Object.keys(VINCULO) as TipoVinculo[]).map((t) => (
                <label key={t} className={`og-vtipo${tipoVinc === t ? " on" : ""}`}>
                  <input type="radio" name="vinc" checked={tipoVinc === t} onChange={() => setTipoVinc(t)} />
                  <svg width="44" height="10" aria-hidden="true">
                    <line x1="4" y1="5" x2="38" y2="5" stroke="#16181d" strokeWidth="1.8" strokeDasharray={t === "apoio" ? "5 4" : undefined} />
                    <path d="M36 1 L43 5 L36 9 Z" fill="#16181d" />
                    {t === "interface" && <path d="M8 1 L1 5 L8 9 Z" fill="#16181d" />}
                  </svg>
                  <span>{VINCULO[t].nome}</span>
                </label>
              ))}
            </div>
            <p className="note" style={{ margin: "6px 0 0" }}>Arraste de um ponto do card até outro card para ligar.</p>

            <p className="mono" style={{ marginTop: 16 }}>Começar de</p>
            <div className="stack" style={{ gap: 6 }}>
              {MODELOS.map((m) => (
                <button key={m.id} type="button" className="og-modelo" onClick={() => aplicarModelo(m.id)}>
                  <strong>{m.nome}</strong>
                  <small>{m.desc}</small>
                </button>
              ))}
              <button type="button" className="og-modelo" onClick={abrirCopiar}>
                <strong>Copiar de outro projeto</strong>
                <small>Com ou sem as pessoas</small>
              </button>
            </div>
          </aside>
        )}

        <section className="og-quadro" ref={quadro}>
          <Contratacoes.Provider value={contratos}>
          <ReactFlow<No, Vinc>
            nodes={nos}
            edges={vs}
            nodeTypes={TIPOS_NO}
            onNodesChange={pode ? mudarNos : undefined}
            onEdgesChange={pode ? mudarVs : (ch) => mudarVs(ch.filter((c) => c.type === "select"))}
            onConnect={pode ? onConnect : undefined}
            connectionMode={ConnectionMode.Loose}
            nodesDraggable={pode}
            nodesConnectable={pode}
            elementsSelectable
            deleteKeyCode={pode ? ["Backspace", "Delete"] : null}
            snapToGrid
            snapGrid={[10, 10]}
            minZoom={0.15}
            maxZoom={2.5}
            proOptions={{ hideAttribution: false }}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#c9ccd1" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => ((n.data as DadosNo).escuro ? "#16181d" : "#9a9ea6")} maskColor="rgba(244,245,247,.7)" />
            {usados.length > 0 && (
              <Panel position="top-left" className="og-legenda">
                <p className="mono" style={{ marginBottom: 6 }}>Contratação</p>
                {usados.map(({ c, n }) => (
                  <div key={c.id} className="og-leg-i" title={c.descricao ?? ""}>
                    <Selo c={c} />
                    <span>{c.nome}</span>
                    <b>{n}</b>
                  </div>
                ))}
                {pode && <button type="button" className="linkbtn note" style={{ fontSize: 12, marginTop: 4 }} onClick={() => setLegendaEd(true)}>Editar legenda</button>}
              </Panel>
            )}
          </ReactFlow>
          </Contratacoes.Provider>

          {carregado && vazio && pode && (
            <div className="cd-msg">
              <p style={{ margin: 0, fontWeight: 700 }}>Organograma em branco.</p>
              <p className="note" style={{ margin: "4px 0 10px" }}>Comece por um modelo e ajuste, ou adicione os cards um a um.</p>
              <div className="row" style={{ justifyContent: "center" }}>
                <button type="button" className="btn small dark" onClick={() => aplicarModelo("multifamiliar")}>Modelo multifamiliar</button>
                <button type="button" className="btn small" onClick={() => aplicarModelo("unifamiliar")}>Unifamiliar</button>
              </div>
            </div>
          )}
          {carregado && vazio && !pode && <div className="cd-msg">A coordenação ainda não montou o organograma deste projeto.</div>}

          {pode && (selNo || selVinc) && (
            <aside className="og-insp" aria-label="Propriedades">
              {selNo && (
                <div className="stack" style={{ gap: 10 }}>
                  <p className="mono">{TIPO_NO[selNo.type as TipoNo]}</p>
                  {selNo.type === "pessoa" && (
                    <label className="form-l"><span>Quem</span>
                      <select className="f" value={selNo.data.convidado_id ? `c:${selNo.data.convidado_id}` : selNo.data.perfil_id ? `p:${selNo.data.perfil_id}` : ""} onChange={(e) => escolherPessoa(selNo, e.target.value)}>
                        <option value="">A definir (vaga)</option>
                        {opcoesPessoa.map((g) => g.l.length > 0 && (
                          <optgroup key={g.t} label={g.t}>
                            {g.l.map((p) => {
                              const k = p.convidado_id ? `c:${p.convidado_id}` : `p:${p.perfil_id}`;
                              return <option key={k} value={k}>{p.nome}{p.grupo !== "equipe" && p.empresa ? ` · ${p.empresa}` : ""}</option>;
                            })}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                  )}
                  {(selNo.type !== "pessoa" || (!selNo.data.perfil_id && !selNo.data.convidado_id)) && (
                    <label className="form-l"><span>{selNo.type === "nota" ? "Texto" : "Nome"}</span>
                      {selNo.type === "nota"
                        ? <textarea value={selNo.data.nome} onChange={(e) => mudarNo(selNo.id, { nome: e.target.value })} />
                        : <input type="text" value={selNo.data.nome} onChange={(e) => mudarNo(selNo.id, { nome: e.target.value })} />}
                    </label>
                  )}
                  {selNo.type !== "nota" && (
                    <label className="form-l"><span>{selNo.type === "pessoa" ? "Cargo / responsabilidade" : "Detalhe"}</span>
                      <input type="text" value={selNo.data.sub ?? ""} onChange={(e) => mudarNo(selNo.id, { sub: e.target.value })} />
                    </label>
                  )}
                  {selNo.type === "funcao" && (
                    <>
                      <label className="form-l"><span>Papel</span>
                        <select className="f" value={selNo.data.papel ?? "outro"} onChange={(e) => mudarNo(selNo.id, { papel: e.target.value as Papel })}>
                          {(Object.keys(PAPEL) as Papel[]).map((k) => <option key={k} value={k}>{PAPEL[k]}</option>)}
                        </select>
                      </label>
                      {selNo.data.papel === "disciplina" && (
                        <label className="form-l"><span>Disciplina na coordenação</span>
                          <input type="text" list="og-disc" value={selNo.data.disciplina ?? ""} onChange={(e) => mudarNo(selNo.id, { disciplina: e.target.value })} placeholder="Ex.: Estrutura" />
                          <datalist id="og-disc">{["Arquitetura", "Estrutura", "Elétrico", "Hidrossanitário", "Incêndio", "Climatização", "Fundações"].map((d) => <option key={d} value={d} />)}</datalist>
                        </label>
                      )}
                      {selNo.data.papel === "coordenacao" && <p className="note" style={{ margin: 0 }}>A pessoa da equipe ligada a este card vira a coordenadora do projeto (cria e valida apontamentos).</p>}
                      {selNo.data.papel === "disciplina" && <p className="note" style={{ margin: 0 }}>As pessoas ligadas a este card são sugeridas como responsáveis nos apontamentos desta disciplina.</p>}
                    </>
                  )}
                  {selNo.type !== "nota" && (
                    <div className="form-l"><span>Contratação</span>
                      <select className="f" aria-label="Contratação" value={selNo.data.contratacao ?? ""} onChange={(e) => mudarNo(selNo.id, { contratacao: e.target.value || null })}>
                        <option value="">Sem indicação</option>
                        {contratos.filter((c) => c.ativo || c.id === selNo.data.contratacao).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                      <button type="button" className="linkbtn note" style={{ fontSize: 12.5, alignSelf: "flex-start" }} onClick={() => setLegendaEd(true)}>Editar legenda</button>
                    </div>
                  )}
                  <div className="form-l"><span>Formato</span>
                    <div className="row" style={{ gap: 6 }}>
                      {(Object.keys(FORMA) as Forma[]).map((f) => (
                        <button key={f} type="button" className={`pill${(selNo.data.forma ?? "arredondado") === f ? " inv" : ""}`} style={{ border: 0, cursor: "pointer" }} onClick={() => mudarNo(selNo.id, { forma: f })}>{FORMA[f]}</button>
                      ))}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 14, fontSize: 14 }}>
                    <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={!!selNo.data.destaque} onChange={(e) => mudarNo(selNo.id, { destaque: e.target.checked })} /> Borda forte</label>
                    <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={!!selNo.data.escuro} onChange={(e) => mudarNo(selNo.id, { escuro: e.target.checked })} /> Preto</label>
                  </div>
                  <div className="row">
                    <button type="button" className="btn small" onClick={duplicar}>Duplicar</button>
                    <button type="button" className="btn small ghost" onClick={apagar}>Apagar</button>
                  </div>
                </div>
              )}
              {selVinc && (
                <div className="stack" style={{ gap: 10 }}>
                  <p className="mono">Vínculo</p>
                  <div className="stack" style={{ gap: 4 }}>
                    {(Object.keys(VINCULO) as TipoVinculo[]).map((t) => (
                      <label key={t} className={`og-vtipo${(selVinc.data?.tipo ?? "subordinacao") === t ? " on" : ""}`}>
                        <input type="radio" checked={(selVinc.data?.tipo ?? "subordinacao") === t} onChange={() => mudarVinc(selVinc.id, { tipo: t })} />
                        <span>{VINCULO[t].nome}</span><small className="note">{VINCULO[t].desc}</small>
                      </label>
                    ))}
                  </div>
                  <label className="form-l"><span>Texto no vínculo</span>
                    <input type="text" value={selVinc.data?.rotulo ?? ""} onChange={(e) => mudarVinc(selVinc.id, { rotulo: e.target.value })} placeholder="Ex.: aprova, revisa" />
                  </label>
                  <div className="row">
                    <button type="button" className="btn small" onClick={() => setVs((a) => a.map((e) => (e.id === selVinc.id ? { ...e, source: e.target, target: e.source, sourceHandle: e.targetHandle, targetHandle: e.sourceHandle } : e)))}>Inverter</button>
                    <button type="button" className="btn small ghost" onClick={apagar}>Apagar</button>
                  </div>
                </div>
              )}
            </aside>
          )}
        </section>
      </div>

      {copiar && (
        <div className="cd-modal-fundo" onClick={() => setCopiar(null)} role="dialog" aria-label="Copiar de outro projeto">
          <div className="box" style={{ width: "min(520px, 100%)", maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <p className="mono" style={{ marginBottom: 10 }}>Copiar organograma de</p>
            {copiar.length === 0 ? <p className="note">Nenhum outro projeto tem organograma ainda.</p> : (
              <div className="lista">
                {copiar.map((p) => (
                  <div key={p.projeto_id} className="item">
                    <span className="item-t"><strong>{p.codigo ? `${String(p.codigo).padStart(3, "0")} · ` : ""}{p.nome}</strong><small>{p.nos} cards</small></span>
                    <button type="button" className="btn small" onClick={() => copiarDe(p.projeto_id, false)}>Só estrutura</button>
                    <button type="button" className="btn small ghost" onClick={() => copiarDe(p.projeto_id, true)}>Com pessoas</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {legendaEd && <EditarLegenda escritorioId={projeto.escritorio_id} lista={contratos} onClose={() => setLegendaEd(false)} onChange={recarregarContratos} avisar={avisar} />}
      {aviso && <div className="toast" role="status">{aviso}</div>}
    </div>
  );
}

function EditarLegenda({
  escritorioId, lista, onClose, onChange, avisar,
}: { escritorioId: string; lista: Contratacao[]; onClose: () => void; onChange: () => void; avisar: (t: string) => void }) {
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [novo, setNovo] = useState({ nome: "", sigla: "", estilo: "contorno" as EstiloSelo });

  async function mudar(c: Contratacao, d: Partial<Contratacao>) {
    const { error } = await supabase.from("org_contratacoes").update(d).eq("id", c.id);
    if (error) return avisar(erroMsg(error));
    onChange();
  }
  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!novo.nome.trim()) return;
    const { error } = await supabase.from("org_contratacoes").insert({
      escritorio_id: escritorioId, nome: novo.nome.trim(), sigla: (novo.sigla.trim() || novo.nome.trim()).slice(0, 18), estilo: novo.estilo, ordem: lista.length + 1,
    });
    if (error) return avisar(erroMsg(error));
    setNovo({ nome: "", sigla: "", estilo: "contorno" });
    onChange();
  }

  return (
    <div className="cd-modal-fundo" onClick={onClose} role="dialog" aria-label="Legenda de contratação">
      <div className="box" style={{ width: "min(640px, 100%)", maxHeight: "86vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <p className="mono">Legenda de contratação</p>
          <button type="button" className="btn small ghost" onClick={onClose}>Fechar</button>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          {lista.map((c) => (
            <div key={c.id} className="og-leg-ed" style={{ opacity: c.ativo ? 1 : 0.5 }}>
              <Selo c={c} />
              <input type="text" defaultValue={c.nome} onBlur={(e) => e.target.value.trim() && e.target.value !== c.nome && mudar(c, { nome: e.target.value.trim() })} aria-label="Nome" />
              <input type="text" defaultValue={c.sigla} maxLength={18} onBlur={(e) => e.target.value.trim() && e.target.value !== c.sigla && mudar(c, { sigla: e.target.value.trim() })} aria-label="Texto do selo" style={{ width: 120 }} />
              <select className="f" value={c.estilo} onChange={(e) => mudar(c, { estilo: e.target.value as EstiloSelo })} style={{ width: 130 }} aria-label="Estilo">
                {(Object.keys(ESTILO_SELO) as EstiloSelo[]).map((k) => <option key={k} value={k}>{ESTILO_SELO[k]}</option>)}
              </select>
              <button type="button" className="btn small ghost" onClick={() => mudar(c, { ativo: !c.ativo })}>{c.ativo ? "Desativar" : "Ativar"}</button>
            </div>
          ))}
        </div>
        <form className="og-leg-ed" style={{ marginTop: 14 }} onSubmit={criar}>
          <Selo c={{ id: "", nome: novo.nome, sigla: novo.sigla || novo.nome || "Novo", estilo: novo.estilo, descricao: null, ordem: 0, ativo: true }} />
          <input type="text" placeholder="Nova categoria (ex.: Indicação de parceiro)" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          <input type="text" placeholder="Selo" maxLength={18} value={novo.sigla} onChange={(e) => setNovo({ ...novo, sigla: e.target.value })} style={{ width: 120 }} />
          <select className="f" value={novo.estilo} onChange={(e) => setNovo({ ...novo, estilo: e.target.value as EstiloSelo })} style={{ width: 130 }}>
            {(Object.keys(ESTILO_SELO) as EstiloSelo[]).map((k) => <option key={k} value={k}>{ESTILO_SELO[k]}</option>)}
          </select>
          <button className="btn small dark" type="submit">Adicionar</button>
        </form>
        <p className="note" style={{ margin: "10px 0 0" }}>Vale para todos os projetos do escritório. Em P&B, cada categoria se distingue pelo estilo do selo.</p>
      </div>
    </div>
  );
}

export default function Organograma({ projeto }: { projeto: ProjetoCoord }) {
  return (
    <ReactFlowProvider>
      <Editor projeto={projeto} />
    </ReactFlowProvider>
  );
}
