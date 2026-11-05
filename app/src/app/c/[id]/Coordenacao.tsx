"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import {
  BUCKET, CAMPOS_ITEM, ORDEM_STATUS, STATUS_ITEM, chavePessoa, num, vencido,
  type Item, type Modelo, type Pessoa, type ProjetoCoord, type Revisao, type StatusItem,
} from "@/lib/coord";
import { dataCurta, erroMsg } from "@/lib/util";
import type { Pick, Visor } from "./visor";
import ItemPainel from "./ItemPainel";
import NovoItem, { type Rascunho } from "./NovoItem";
import Modelos from "./Modelos";
import Pessoas from "./Pessoas";
import Ajustes from "./Ajustes";

export type Eu = { id: string; nome: string; foto: string | null; email: string };
type Aba = "itens" | "modelos" | "pessoas" | "ajustes";
type Filtro = "abertos" | "meus" | "vencidos" | "validados" | "todos";

// Cache local dos modelos convertidos (cada revisão é um arquivo novo, então nunca fica velho)
async function baixarFrag(supabase: ReturnType<typeof supabaseNavegador>, caminho: string): Promise<ArrayBuffer> {
  const chave = `/__frag/${caminho}`;
  try {
    const cache = await caches.open("ezeg-bim");
    const r = await cache.match(chave);
    if (r) return await r.arrayBuffer();
    const { data, error } = await supabase.storage.from(BUCKET).download(caminho);
    if (error || !data) throw error ?? new Error("Arquivo não encontrado");
    const buf = await data.arrayBuffer();
    try {
      await cache.put(chave, new Response(buf.slice(0)));
    } catch {}
    return buf;
  } catch (e) {
    const { data, error } = await supabase.storage.from(BUCKET).download(caminho);
    if (error || !data) throw e;
    return await data.arrayBuffer();
  }
}

export default function Coordenacao({ projeto, eu }: { projeto: ProjetoCoord; eu: Eu }) {
  const supabase = useMemo(() => supabaseNavegador(), []);
  const coordena = projeto.coordena;
  const tela = useRef<HTMLDivElement>(null);
  const visor = useRef<Visor | null>(null);
  const [pronto, setPronto] = useState(false);
  const [erroVisor, setErroVisor] = useState("");

  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [revisoes, setRevisoes] = useState<Revisao[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [etapas, setEtapas] = useState<{ sigla: string; nome: string }[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [carregados, setCarregados] = useState<Record<string, string>>({}); // modelo → revisão carregada
  const [baixando, setBaixando] = useState<Record<string, boolean>>({});
  const [visiveis, setVisiveis] = useState<Record<string, boolean>>({});
  const [transp, setTransp] = useState(false);
  const [corte, setCorte] = useState(false);
  const [apontando, setApontando] = useState(false);
  const [sel, setSel] = useState<Pick | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("itens");
  const [filtro, setFiltro] = useState<Filtro>(coordena ? "abertos" : "meus");
  const [discF, setDiscF] = useState("");
  const [busca, setBusca] = useState("");
  const [aviso, setAviso] = useState("");
  const [lateral, setLateral] = useState(true);
  const pinos = useRef<HTMLDivElement>(null);

  const avisar = useCallback((t: string) => {
    setAviso(t);
    setTimeout(() => setAviso(""), 5000);
  }, []);

  // ---------- Dados ----------
  const carregarItens = useCallback(async () => {
    const { data } = await supabase.from("coord_itens").select(CAMPOS_ITEM).eq("projeto_id", projeto.id).order("numero", { ascending: false });
    setItens((data as unknown as Item[]) ?? []);
  }, [supabase, projeto.id]);

  const carregarModelos = useCallback(async () => {
    const [{ data: m }, { data: r }] = await Promise.all([
      supabase.from("coord_modelos").select("id,projeto_id,disciplina_id,nome,ordem").eq("projeto_id", projeto.id).order("ordem").order("created_at"),
      supabase.from("coord_revisoes").select("id,modelo_id,numero,arquivo,ifc_caminho,frag_caminho,tamanho,nota,created_at").eq("projeto_id", projeto.id).order("numero", { ascending: false }),
    ]);
    setModelos((m as Modelo[]) ?? []);
    setRevisoes((r as Revisao[]) ?? []);
  }, [supabase, projeto.id]);

  const carregarPessoas = useCallback(async () => {
    const { data } = await supabase.rpc("coord_pessoas", { proj: projeto.id });
    setPessoas((data as Pessoa[]) ?? []);
  }, [supabase, projeto.id]);

  useEffect(() => {
    carregarItens();
    carregarModelos();
    carregarPessoas();
    if (projeto.equipe) {
      supabase.from("etapas_modelo").select("sigla,nome").eq("escritorio_id", projeto.escritorio_id).eq("ativo", true).order("ordem")
        .then(({ data }) => setEtapas((data as { sigla: string; nome: string }[]) ?? []));
      supabase.from("coord_tipos").select("nome").eq("escritorio_id", projeto.escritorio_id).eq("ativo", true).order("ordem")
        .then(({ data }) => setTipos(((data as { nome: string }[]) ?? []).map((t) => t.nome)));
    }
    const canal = supabase
      .channel(`coord-${projeto.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "coord_itens", filter: `projeto_id=eq.${projeto.id}` }, () => carregarItens())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, projeto.id, projeto.equipe, projeto.escritorio_id, carregarItens, carregarModelos, carregarPessoas]);

  const ultima = useMemo(() => {
    const u: Record<string, Revisao> = {};
    revisoes.forEach((r) => {
      if (!u[r.modelo_id] || u[r.modelo_id].numero < r.numero) u[r.modelo_id] = r;
    });
    return u;
  }, [revisoes]);

  // ---------- Visor ----------
  useEffect(() => {
    let vivo = true;
    let v: Visor | null = null;
    (async () => {
      try {
        const { Visor } = await import("./visor");
        if (!vivo || !tela.current) return;
        v = await Visor.criar(tela.current);
        visor.current = v;
        setPronto(true);
      } catch (e) {
        setErroVisor(`Não foi possível abrir o 3D neste navegador. ${erroMsg(e)}`);
      }
    })();
    return () => {
      vivo = false;
      v?.dispose();
      visor.current = null;
    };
  }, []);

  // Carrega a última revisão de cada modelo (e troca quando sobe revisão nova)
  useEffect(() => {
    if (!pronto) return;
    const v = visor.current!;
    let primeiro = Object.keys(carregados).length === 0;
    modelos.forEach(async (m) => {
      const r = ultima[m.id];
      if (!r?.frag_caminho || carregados[m.id] === r.id || baixando[m.id]) return;
      setBaixando((b) => ({ ...b, [m.id]: true }));
      try {
        const buf = await baixarFrag(supabase, r.frag_caminho);
        await v.carregar(m.id, buf);
        setCarregados((c) => ({ ...c, [m.id]: r.id }));
        setVisiveis((s) => ({ ...s, [m.id]: s[m.id] ?? true }));
        if (primeiro) {
          primeiro = false;
          await v.enquadrar();
        }
      } catch (e) {
        avisar(`Não foi possível abrir ${m.nome}: ${erroMsg(e)}`);
      } finally {
        setBaixando((b) => ({ ...b, [m.id]: false }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, modelos, ultima]);

  // Marcadores dos apontamentos acompanham a câmera
  const comPonto = useMemo(() => itens.filter((i) => i.ponto && i.status !== "validado"), [itens]);
  useEffect(() => {
    if (!pronto) return;
    let raf = 0;
    const loop = () => {
      const v = visor.current;
      const box = pinos.current;
      if (v && box) {
        box.querySelectorAll<HTMLButtonElement>("[data-pino]").forEach((b) => {
          const i = comPonto.find((x) => x.id === b.dataset.pino);
          const disc = i?.modelo_id;
          if (!i?.ponto || (disc && visiveis[disc] === false)) {
            b.style.display = "none";
            return;
          }
          const p = v.projetar(i.ponto);
          b.style.display = p.frente ? "" : "none";
          b.style.transform = `translate(${p.x}px, ${p.y}px)`;
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pronto, comPonto, visiveis]);

  // ---------- Interação no 3D ----------
  const toque = useRef<{ x: number; y: number } | null>(null);
  async function clicar(e: React.PointerEvent) {
    const ini = toque.current;
    toque.current = null;
    if (!ini || Math.hypot(e.clientX - ini.x, e.clientY - ini.y) > 6) return; // foi arrasto (girar/mover)
    const v = visor.current;
    if (!v) return;
    if (corte) {
      await v.criarCorte();
      return;
    }
    const p = await v.escolher(e.clientX, e.clientY);
    setSel(p);
    await v.destacar(p ? { modelo: p.modelo, localId: p.localId } : null);
    if (p && apontando) {
      setApontando(false);
      abrirRascunho(p);
    }
  }

  function abrirRascunho(p: Pick | null) {
    const v = visor.current;
    if (!v) return;
    setRascunho({
      print: v.print(),
      camera: v.camera(),
      pick: p,
      visiveis: modelos.filter((m) => visiveis[m.id] !== false && carregados[m.id]).map((m) => m.id),
      revisoes: Object.fromEntries(Object.entries(carregados)),
      marcador: p ? v.projetar(p.ponto) : null,
      tela: { w: v.canvas.clientWidth, h: v.canvas.clientHeight },
    });
  }

  async function abrirItem(i: Item) {
    setAberto(i.id);
    setLateral(false);
    const v = visor.current;
    if (!v) return;
    if (i.visiveis?.length) {
      const novo: Record<string, boolean> = {};
      modelos.forEach((m) => {
        novo[m.id] = i.visiveis.includes(m.id);
        v.setVisivel(m.id, novo[m.id]);
      });
      setVisiveis(novo);
    }
    if (i.camera) await v.irPara(i.camera);
    await v.destacar(i.elemento ? { modelo: i.elemento.modelo, localId: i.elemento.localId } : null);
  }

  function alternar(id: string) {
    const novo = !(visiveis[id] ?? true);
    setVisiveis((s) => ({ ...s, [id]: novo }));
    visor.current?.setVisivel(id, novo);
  }

  // ---------- Lista ----------
  const meus = useCallback(
    (i: Item) =>
      (i.coord_responsaveis ?? []).some(
        (r) => r.perfil_id === eu.id || pessoas.some((p) => p.convidado_id && p.convidado_id === r.convidado_id && p.perfil_id === eu.id)
      ),
    [eu.id, pessoas]
  );
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (filtro === "abertos" && i.status === "validado") return false;
      if (filtro === "validados" && i.status !== "validado") return false;
      if (filtro === "meus" && (!meus(i) || i.status === "validado")) return false;
      if (filtro === "vencidos" && !vencido(i)) return false;
      if (discF && i.modelo_id !== discF) return false;
      if (t && !`${num(i.numero)} ${i.titulo} ${i.descricao ?? ""} ${i.tipo ?? ""}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [itens, filtro, discF, busca, meus]);

  const contagem = useMemo(() => {
    const c: Record<StatusItem, number> = { aberto: 0, em_correcao: 0, respondido: 0, validado: 0 };
    itens.forEach((i) => (c[i.status] += 1));
    return c;
  }, [itens]);

  const nomeModelo = (id: string | null) => modelos.find((m) => m.id === id)?.nome ?? "";
  const respNomes = (i: Item) =>
    (i.coord_responsaveis ?? [])
      .map((r) => pessoas.find((p) => chavePessoa(p) === chavePessoa(r))?.nome)
      .filter(Boolean)
      .join(", ");
  const itemAberto = itens.find((i) => i.id === aberto) ?? null;
  const semModelo = modelos.length === 0 || !Object.values(ultima).some((r) => r.frag_caminho);

  return (
    <div className="cd">
      <header className="cd-topo">
        <div className="row" style={{ gap: 12, minWidth: 0, flexWrap: "nowrap" }}>
          <Link href={projeto.equipe ? `/projetos/${projeto.id}` : "/c"} className="marca" aria-label="Voltar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" />
          </Link>
          <div style={{ minWidth: 0 }}>
            <p className="mono" style={{ fontSize: 10.5 }}>Coordenação{projeto.convidado && !projeto.equipe ? ` · ${projeto.escritorio}` : ""}</p>
            <strong className="cd-nome">{projeto.codigo ? `${String(projeto.codigo).padStart(3, "0")} · ` : ""}{projeto.nome}</strong>
          </div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
          <button type="button" className="btn small ghost cd-so-cel" onClick={() => setLateral((x) => !x)}>{lateral ? "Ver 3D" : "Lista"}</button>
          <Link href="/c" className="btn small ghost">Projetos</Link>
          {!projeto.equipe && (
            <form action="/auth/sair" method="post">
              <button className="btn small ghost" type="submit">Sair</button>
            </form>
          )}
        </div>
      </header>

      <div className={`cd-corpo${lateral ? " com-lado" : ""}`}>
        <aside className="cd-lado" aria-label="Coordenação">
          <div className="tabs cd-abas" role="tablist">
            {([["itens", "Apontamentos"], ["modelos", "Modelos"], ["pessoas", "Pessoas"], ...(coordena ? [["ajustes", "Ajustes"]] : [])] as [Aba, string][]).map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{t}</button>
            ))}
          </div>

          {aba === "itens" && (
            <div className="stack" style={{ gap: 10 }}>
              <div className="cd-cont">
                {ORDEM_STATUS.map((s) => (
                  <span key={s}><b>{contagem[s]}</b> {STATUS_ITEM[s]}</span>
                ))}
              </div>
              <div className="row" style={{ gap: 6 }}>
                {([["abertos", "Em aberto"], ["meus", "Comigo"], ["vencidos", "Vencidos"], ["validados", "Validados"], ["todos", "Todos"]] as [Filtro, string][]).map(([k, t]) => (
                  <button key={k} type="button" className={`pill${filtro === k ? " inv" : ""}`} style={{ border: 0, cursor: "pointer" }} onClick={() => setFiltro(k)}>{t}</button>
                ))}
              </div>
              <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                <input type="text" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ padding: "8px 10px" }} />
                <select className="f" value={discF} onChange={(e) => setDiscF(e.target.value)} style={{ width: 150 }} aria-label="Disciplina">
                  <option value="">Disciplinas</option>
                  {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
              {lista.length === 0 ? (
                <div className="vazio" style={{ padding: 22 }}>
                  <p className="vazio-t">Nenhum apontamento aqui.</p>
                  {coordena && !semModelo && <p className="note" style={{ margin: "4px 0 0" }}>Use “Apontar” no 3D e clique no elemento.</p>}
                </div>
              ) : (
                <div className="lista">
                  {lista.map((i) => (
                    <button key={i.id} type="button" className={`item cd-item${aberto === i.id ? " on" : ""}`} onClick={() => abrirItem(i)}>
                      <span className="cd-num">{num(i.numero)}</span>
                      <span className="item-t">
                        <strong>{i.titulo}</strong>
                        <small>
                          {[nomeModelo(i.modelo_id), i.etapa, respNomes(i) || "Sem responsável", i.prazo ? `até ${dataCurta(i.prazo)}` : ""].filter(Boolean).join(" · ")}
                        </small>
                      </span>
                      <span className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
                        <span className={`pill cd-st-${i.status}`}>{STATUS_ITEM[i.status]}</span>
                        {vencido(i) && <span className="atras" style={{ fontSize: 12 }}>Vencido</span>}
                        {i.interno && <span className="note" style={{ fontSize: 11.5 }}>Interno</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {aba === "modelos" && (
            <Modelos
              projeto={projeto}
              modelos={modelos}
              revisoes={revisoes}
              visiveis={visiveis}
              carregados={carregados}
              baixando={baixando}
              visor={visor}
              onAlternar={alternar}
              onChange={carregarModelos}
              avisar={avisar}
            />
          )}

          {aba === "pessoas" && <Pessoas projeto={projeto} pessoas={pessoas} modelos={modelos} eu={eu} onChange={carregarPessoas} avisar={avisar} />}
          {aba === "ajustes" && coordena && <Ajustes projeto={projeto} etapas={etapas} onTipos={setTipos} avisar={avisar} />}
        </aside>

        <section className="cd-3d">
          <div
            ref={tela}
            className={`cd-tela${apontando ? " mira" : ""}`}
            onPointerDown={(e) => (toque.current = { x: e.clientX, y: e.clientY })}
            onPointerUp={clicar}
          />
          <div ref={pinos} className="cd-pinos" aria-hidden={false}>
            {comPonto.map((i) => (
              <button
                key={i.id}
                type="button"
                data-pino={i.id}
                className={`cd-pino${aberto === i.id ? " on" : ""}`}
                title={`${num(i.numero)} ${i.titulo}`}
                onClick={() => abrirItem(i)}
                style={{ display: "none" }}
              >
                {i.numero}
              </button>
            ))}
          </div>

          <div className="cd-barra">
            {modelos.filter((m) => carregados[m.id]).map((m) => (
              <button key={m.id} type="button" className={`cd-tg${visiveis[m.id] !== false ? " on" : ""}`} onClick={() => alternar(m.id)} aria-pressed={visiveis[m.id] !== false}>
                {m.nome}
              </button>
            ))}
            {Object.keys(carregados).length > 0 && <span className="cd-sep" />}
            <button type="button" className={`cd-tg${transp ? " on" : ""}`} onClick={() => { setTransp(!transp); visor.current?.setTransparente(!transp); }}>Transparência</button>
            <button type="button" className={`cd-tg${corte ? " on" : ""}`} onClick={() => { const n = !corte; setCorte(n); if (visor.current) visor.current.corte = n; }} title="Ligue e clique numa face para cortar">Corte</button>
            {corte && <button type="button" className="cd-tg" onClick={() => visor.current?.limparCortes()}>Limpar cortes</button>}
            <button type="button" className="cd-tg" onClick={() => visor.current?.enquadrar()}>Enquadrar</button>
            {coordena && (
              <>
                <span className="cd-sep" />
                <button type="button" className={`cd-tg forte${apontando ? " on" : ""}`} disabled={semModelo} onClick={() => { setApontando(!apontando); setCorte(false); if (visor.current) visor.current.corte = false; }}>
                  {apontando ? "Clique no elemento…" : "+ Apontar"}
                </button>
                <button type="button" className="cd-tg" disabled={!pronto} onClick={() => abrirRascunho(sel)} title="Apontamento com a vista atual">Usar vista</button>
              </>
            )}
          </div>

          {sel && !apontando && (
            <div className="cd-sel">
              <strong>{sel.nome || "Elemento"}</strong>
              <small>{[nomeModelo(sel.modelo), sel.categoria].filter(Boolean).join(" · ")}</small>
              {sel.guid && <small className="note">GUID {sel.guid}</small>}
              {coordena && <button type="button" className="btn small dark" onClick={() => abrirRascunho(sel)}>Apontar neste elemento</button>}
            </div>
          )}

          {!pronto && !erroVisor && <div className="cd-msg">Abrindo o 3D…</div>}
          {erroVisor && <div className="cd-msg">{erroVisor}</div>}
          {pronto && semModelo && (
            <div className="cd-msg">
              <p style={{ margin: 0, fontWeight: 700 }}>Nenhum modelo IFC ainda.</p>
              <p className="note" style={{ margin: "4px 0 10px" }}>
                {coordena ? "Envie o IFC de arquitetura e de estrutura na aba Modelos." : "A coordenação ainda não enviou os modelos."}
              </p>
              {coordena && <button className="btn small dark" type="button" onClick={() => { setAba("modelos"); setLateral(true); }}>Enviar IFC</button>}
            </div>
          )}
          {Object.values(baixando).some(Boolean) && <div className="cd-carreg">Carregando modelos…</div>}

          {itemAberto && (
            <ItemPainel
              key={itemAberto.id}
              item={itemAberto}
              projeto={projeto}
              eu={eu}
              pessoas={pessoas}
              modelos={modelos}
              etapas={etapas}
              tipos={tipos}
              souResp={meus(itemAberto)}
              onClose={() => { setAberto(null); visor.current?.destacar(null); }}
              onChange={carregarItens}
              irPara={() => abrirItem(itemAberto)}
              avisar={avisar}
            />
          )}
        </section>
      </div>

      {rascunho && (
        <NovoItem
          projeto={projeto}
          rascunho={rascunho}
          pessoas={pessoas}
          modelos={modelos}
          etapas={etapas}
          tipos={tipos}
          onClose={() => setRascunho(null)}
          onSalvo={async (id) => {
            setRascunho(null);
            await carregarItens();
            setAberto(id);
            setAba("itens");
            avisar("Apontamento criado.");
          }}
        />
      )}

      {aviso && <div className="toast" role="status">{aviso}</div>}
    </div>
  );
}
