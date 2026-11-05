"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp, usePode } from "../../ctx";
import { Avatar, Vazio } from "../../ui";
import { dataHora, erroMsg } from "@/lib/util";
import {
  CAMPOS_TAREFA, STATUS_PROJ, STATUS_TAREFA, TIPOLOGIAS, atrasada, dia, horas, moeda, nomeProjeto,
  type Cliente, type Etapa, type Pessoa, type StatusProj, type Tarefa,
} from "@/lib/gestor";
import TarefaPainel from "../TarefaPainel";

type Proj = {
  id: string; codigo: number | null; nome: string; tipologia: string | null; cidade: string | null; endereco: string | null;
  area_m2: number | null; valor: number | null; status: StatusProj; inicio: string | null; termino: string | null;
  cliente_id: string | null; coordenador_id: string | null; escopo: string | null; ativo: boolean; pasta_url: string | null;
  cliente: { nome: string } | null;
};
type Rec = { id: string; texto: string; created_at: string; autor_id: string; autor: { nome: string | null; foto_url: string | null } | null };
type Aba = "eap" | "cronograma" | "horas" | "equipe";

const CAMPOS_PROJ = "id,codigo,nome,tipologia,cidade,endereco,area_m2,valor,status,inicio,termino,cliente_id,coordenador_id,escopo,ativo,pasta_url,cliente:clientes(nome)";

export default function ProjetoPg({ params }: { params: { id: string } }) {
  const { eu, esc } = useApp();
  const admin = usePode("projetos", true);
  const sens = usePode("sensiveis");
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [p, setP] = useState<Proj | null | undefined>(undefined);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [minPorTarefa, setMinPorTarefa] = useState<Record<string, number>>({});
  const [minPorPessoa, setMinPorPessoa] = useState<Record<string, number>>({});
  const [custoPorPessoa, setCustoPorPessoa] = useState<Record<string, number>>({});
  const [nomePessoa, setNomePessoa] = useState<Record<string, string>>({});
  const [minSemTarefa, setMinSemTarefa] = useState(0);
  const [custoTot, setCustoTot] = useState(0);
  const [checks, setChecks] = useState<Record<string, [number, number]>>({});
  const [membros, setMembros] = useState<Pessoa[]>([]);
  const [equipe, setEquipe] = useState<Pessoa[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [aba, setAba] = useState<Aba>("eap");
  const [aberta, setAberta] = useState<string | null>(null);
  const [ed, setEd] = useState<Proj | null>(null);
  const [nova, setNova] = useState<{ etapa: string; titulo: string } | null>(null);
  const [novaEtapa, setNovaEtapa] = useState("");
  const [fechadas, setFechadas] = useState<Record<string, boolean>>({});
  const [soMinhas, setSoMinhas] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const [{ data: pr }, { data: et }, { data: tf }, { data: ap }, { data: ck }, { data: m }] = await Promise.all([
      supabase.from("projetos").select(CAMPOS_PROJ).eq("id", params.id).maybeSingle(),
      supabase.from("projeto_etapas").select("id,projeto_id,sigla,nome,ordem,peso,inicio,termino").eq("projeto_id", params.id).order("ordem"),
      supabase.from("tarefas").select(CAMPOS_TAREFA).eq("projeto_id", params.id).order("ordem"),
      supabase.rpc("horas_projeto", { proj: params.id }),
      supabase.from("checklist_itens").select("tarefa_id,feito,tarefa:tarefas!inner(projeto_id)").eq("tarefa.projeto_id", params.id),
      supabase.from("projeto_membros").select("perfil:perfis(id,nome,foto_url)").eq("projeto_id", params.id),
    ]);
    setP((pr as unknown as Proj) ?? null);
    setEtapas((et as Etapa[]) ?? []);
    setTarefas((tf as Tarefa[]) ?? []);
    const mt: Record<string, number> = {};
    const mp: Record<string, number> = {};
    const cp: Record<string, number> = {};
    const np: Record<string, string> = {};
    let semTarefa = 0;
    let custo = 0;
    ((ap ?? []) as { tarefa_id: string | null; perfil_id: string | null; pessoa: string | null; minutos: number; custo: number | null }[]).forEach((a) => {
      const m = Number(a.minutos);
      if (a.tarefa_id) mt[a.tarefa_id] = (mt[a.tarefa_id] ?? 0) + m;
      else semTarefa += m;
      const k = a.perfil_id ?? `nome:${a.pessoa}`;
      mp[k] = (mp[k] ?? 0) + m;
      cp[k] = (cp[k] ?? 0) + Number(a.custo ?? 0);
      if (a.pessoa) np[k] = a.pessoa;
      custo += Number(a.custo ?? 0);
    });
    setMinPorTarefa(mt);
    setMinPorPessoa(mp);
    setCustoPorPessoa(cp);
    setNomePessoa(np);
    setMinSemTarefa(semTarefa);
    setCustoTot(custo);
    const c: Record<string, [number, number]> = {};
    ((ck ?? []) as { tarefa_id: string; feito: boolean }[]).forEach((i) => {
      const x = c[i.tarefa_id] ?? [0, 0];
      c[i.tarefa_id] = [x[0] + (i.feito ? 1 : 0), x[1] + 1];
    });
    setChecks(c);
    setMembros(((m ?? []) as unknown as { perfil: Pessoa | null }[]).map((x) => x.perfil).filter(Boolean) as Pessoa[]);
  }, [supabase, params.id]);

  useEffect(() => {
    carregar();
    if (admin) {
      supabase.from("membros").select("perfil:perfis(id,nome,foto_url)").eq("escritorio_id", esc.id).eq("ativo", true)
        .then(({ data }) => setEquipe(((data ?? []) as unknown as { perfil: Pessoa | null }[]).map((x) => x.perfil).filter(Boolean) as Pessoa[]));
      supabase.from("clientes").select("id,nome").eq("escritorio_id", esc.id).order("nome").then(({ data }) => setClientes((data as Cliente[]) ?? []));
    }
    const canal = supabase
      .channel(`tarefas-${params.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tarefas", filter: `projeto_id=eq.${params.id}` }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, params.id, esc.id, admin, carregar]);

  const pessoas = admin ? equipe : membros;
  const nomeDe = (id: string | null) => pessoas.find((x) => x.id === id) ?? membros.find((x) => x.id === id) ?? null;

  if (p === undefined) return <p className="note">Carregando…</p>;
  if (p === null) return <Vazio titulo="Projeto não encontrado"><Link className="btn small" href="/projetos">Voltar</Link></Vazio>;

  // ---------- números do projeto ----------
  const raiz = tarefas.filter((t) => !t.pai_id);
  const prevTot = raiz.reduce((s, t) => s + Number(t.horas_previstas || 0), 0);
  const realTot = Object.values(minPorPessoa).reduce((s, v) => s + v, 0);
  const pctEtapa = (e: Etapa) => {
    const ts = raiz.filter((t) => t.etapa_id === e.id);
    const hp = ts.reduce((s, t) => s + Number(t.horas_previstas || 0), 0);
    if (hp > 0) return ts.filter((t) => t.status === "concluida").reduce((s, t) => s + Number(t.horas_previstas || 0), 0) / hp;
    return ts.length ? ts.filter((t) => t.status === "concluida").length / ts.length : 0;
  };
  const pesoTot = etapas.reduce((s, e) => s + Number(e.peso || 0), 0);
  const progresso = pesoTot ? Math.round((100 * etapas.reduce((s, e) => s + pctEtapa(e) * Number(e.peso || 0), 0)) / pesoTot) : 0;
  const nAtras = raiz.filter(atrasada).length;

  // ---------- ações ----------
  async function salvarProj(e: React.FormEvent) {
    e.preventDefault();
    if (!ed) return;
    const { error } = await supabase.from("projetos").update({
      nome: ed.nome.trim() || "Sem nome", tipologia: ed.tipologia || null, cliente_id: ed.cliente_id || null, cidade: ed.cidade || null,
      endereco: ed.endereco || null, area_m2: ed.area_m2, valor: ed.valor, status: ed.status, inicio: ed.inicio || null, termino: ed.termino || null,
      coordenador_id: ed.coordenador_id || null, escopo: ed.escopo || null, pasta_url: ed.pasta_url?.trim() || null, ativo: ed.status !== "finalizado" || ed.ativo,
    }).eq("id", params.id);
    if (error) return setErro(erroMsg(error));
    setEd(null);
    carregar();
  }

  async function aplicarModelo() {
    const { error } = await supabase.rpc("aplicar_modelo", { proj: params.id });
    if (error) return setErro(erroMsg(error));
    carregar();
  }

  async function criarTarefa(e: React.FormEvent) {
    e.preventDefault();
    if (!nova?.titulo.trim()) return;
    const ordem = Math.max(0, ...tarefas.filter((t) => t.etapa_id === (nova.etapa || null)).map((t) => t.ordem)) + 1;
    const { data, error } = await supabase.from("tarefas").insert({
      escritorio_id: esc.id, projeto_id: params.id, etapa_id: nova.etapa || null, titulo: nova.titulo.trim(), ordem,
    }).select("id").single();
    if (error) return setErro(erroMsg(error));
    setNova({ ...nova, titulo: "" });
    await carregar();
    setAberta(data.id);
  }

  async function criarEtapa(e: React.FormEvent) {
    e.preventDefault();
    if (!novaEtapa.trim()) return;
    const { error } = await supabase.from("projeto_etapas").insert({
      escritorio_id: esc.id, projeto_id: params.id, nome: novaEtapa.trim(), ordem: Math.max(0, ...etapas.map((x) => x.ordem)) + 1,
    });
    if (error) return setErro(erroMsg(error));
    setNovaEtapa("");
    carregar();
  }

  async function concluir(t: Tarefa) {
    const s = t.status === "concluida" ? "pendente" : "concluida";
    setTarefas(tarefas.map((x) => (x.id === t.id ? { ...x, status: s } : x)));
    const { error } = await supabase.from("tarefas").update({ status: s }).eq("id", t.id);
    if (error) {
      setErro(erroMsg(error));
      carregar();
    }
  }

  const podeMexer = (t: Tarefa) => admin || t.responsavel_id === eu.id;

  // ---------- EAP ----------
  const Linha = ({ t, n }: { t: Tarefa; n: string }) => {
    const r = nomeDe(t.responsavel_id);
    const c = checks[t.id];
    const real = minPorTarefa[t.id] ?? 0;
    return (
      <div className={`eap-l${t.status === "concluida" ? " ok" : ""}`}>
        <button type="button" className={`tick${t.status === "concluida" ? " on" : ""}`} disabled={!podeMexer(t)} onClick={() => concluir(t)}
          aria-label={t.status === "concluida" ? "Reabrir tarefa" : "Concluir tarefa"} />
        <button type="button" className="eap-t" onClick={() => setAberta(t.id)}>
          <span className="eap-n">{n}</span>
          <strong>{t.titulo}</strong>
          {c && <small className="note">{c[0]}/{c[1]}</small>}
        </button>
        <span className="eap-c">{r ? <><Avatar nome={r.nome} foto={r.foto_url} size={22} eu={r.id === eu.id} /><small>{(r.nome || "").split(" ")[0]}</small></> : <small className="note">—</small>}</span>
        <span className={`eap-c${atrasada(t) ? " atras" : ""}`}><small>{dia(t.termino) || "—"}</small></span>
        <span className="eap-c"><small>{horas(real)} / {Number(t.horas_previstas || 0)}h</small></span>
        <span className="eap-c"><span className={`pill${t.status === "andamento" ? " inv" : t.status === "backlog" ? " dash" : ""}`}>{STATUS_TAREFA[t.status]}</span></span>
      </div>
    );
  };

  const filtradas = (lista: Tarefa[]) => (soMinhas ? lista.filter((t) => t.responsavel_id === eu.id) : lista);
  const semEtapa = filtradas(raiz.filter((t) => !t.etapa_id));

  const eap = (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={soMinhas} onChange={(e) => setSoMinhas(e.target.checked)} /> <span>Só as minhas</span></label>
        <small className="note">{raiz.filter((t) => t.status === "concluida").length} de {raiz.length} tarefas concluídas{nAtras ? ` · ${nAtras} atrasadas` : ""}</small>
      </div>

      {etapas.length === 0 && raiz.length === 0 && (
        <Vazio titulo="Sem etapas ainda" texto="Use o processo padrão da EZE ou crie as etapas à mão.">
          {admin && <button className="btn dark small" type="button" onClick={aplicarModelo}>Usar processo EZE (DP → PV)</button>}
        </Vazio>
      )}

      {etapas.map((e, ie) => {
        const ts = filtradas(raiz.filter((t) => t.etapa_id === e.id));
        const tsAll = raiz.filter((t) => t.etapa_id === e.id);
        const pct = Math.round(pctEtapa(e) * 100);
        const prev = tsAll.reduce((s, t) => s + Number(t.horas_previstas || 0), 0);
        const real = tsAll.reduce((s, t) => s + (minPorTarefa[t.id] ?? 0), 0);
        const fechada = fechadas[e.id] ?? (pct === 100);
        if (soMinhas && ts.length === 0) return null;
        return (
          <section key={e.id} className="eap">
            <button type="button" className="eap-h" onClick={() => setFechadas({ ...fechadas, [e.id]: !fechada })} aria-expanded={!fechada}>
              <span className="eap-n">{ie + 1}</span>
              <strong>{e.sigla ? `${e.sigla} · ` : ""}{e.nome}</strong>
              <span className="prog"><i style={{ width: `${pct}%` }} /></span>
              <small>{pct}%</small>
              <small className="note">{horas(real)} / {prev}h</small>
              <span className="seta" aria-hidden="true">{fechada ? "+" : "−"}</span>
            </button>
            {!fechada && (
              <div className="eap-b">
                {ts.map((t, it) => (
                  <div key={t.id}>
                    <Linha t={t} n={`${ie + 1}.${it + 1}`} />
                    {filtradas(tarefas.filter((s) => s.pai_id === t.id)).map((s, is) => <Linha key={s.id} t={s} n={`${ie + 1}.${it + 1}.${is + 1}`} />)}
                  </div>
                ))}
                {ts.length === 0 && <p className="note" style={{ margin: "8px 14px" }}>Nenhuma tarefa nesta etapa.</p>}
                {admin && (nova?.etapa === e.id ? (
                  <form className="row eap-novo" onSubmit={criarTarefa}>
                    <input type="text" value={nova.titulo} onChange={(x) => setNova({ etapa: e.id, titulo: x.target.value })} placeholder="Título da tarefa" autoFocus aria-label="Título da nova tarefa" />
                    <button className="btn small dark" type="submit">Criar</button>
                    <button className="btn small" type="button" onClick={() => setNova(null)}>Cancelar</button>
                  </form>
                ) : (
                  <button className="linkbtn eap-add" type="button" onClick={() => setNova({ etapa: e.id, titulo: "" })}>+ Nova tarefa</button>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {semEtapa.length > 0 && (
        <section className="eap">
          <div className="eap-h"><strong>Sem etapa</strong></div>
          <div className="eap-b">{semEtapa.map((t, i) => <Linha key={t.id} t={t} n={`${i + 1}`} />)}</div>
        </section>
      )}

      {admin && etapas.length > 0 && (
        <div className="row" style={{ marginTop: 16 }}>
          <form className="row" onSubmit={criarEtapa} style={{ flexWrap: "nowrap" }}>
            <input type="text" value={novaEtapa} onChange={(e) => setNovaEtapa(e.target.value)} placeholder="Nova etapa" aria-label="Nova etapa" style={{ width: 240 }} />
            <button className="btn small" type="submit">Adicionar etapa</button>
          </form>
          <button className="btn small ghost" type="button" onClick={aplicarModelo}>Completar com o processo EZE</button>
        </div>
      )}
    </>
  );

  // ---------- Cronograma (Gantt) ----------
  const datadas = raiz.filter((t) => t.inicio || t.termino);
  const datas = [...datadas.flatMap((t) => [t.inicio, t.termino]), ...etapas.flatMap((e) => [e.inicio, e.termino]), p.inicio, p.termino].filter(Boolean) as string[];
  let gantt: React.ReactNode = <Vazio titulo="Sem datas ainda" texto="Defina início e entrega nas tarefas para ver o cronograma." />;
  if (datas.length) {
    const ini = new Date(datas.reduce((a, b) => (a < b ? a : b)) + "T12:00:00");
    const fim = new Date(datas.reduce((a, b) => (a > b ? a : b)) + "T12:00:00");
    ini.setDate(1);
    fim.setMonth(fim.getMonth() + 1, 0);
    const total = (fim.getTime() - ini.getTime()) / 864e5 + 1;
    const pos = (d: string) => ((new Date(d + "T12:00:00").getTime() - ini.getTime()) / 864e5 / total) * 100;
    const meses: { t: string; l: number; w: number }[] = [];
    const m = new Date(ini);
    while (m <= fim) {
      const a = new Date(m);
      const b = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      meses.push({ t: a.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), l: pos(a.toISOString().slice(0, 10)), w: ((b.getTime() - a.getTime()) / 864e5 + 1) / total * 100 });
      m.setMonth(m.getMonth() + 1);
    }
    const hojeP = pos(new Date().toISOString().slice(0, 10));
    const barra = (a: string | null, b: string | null) => {
      const x = a || b!;
      const y = b || a!;
      return { left: `${pos(x)}%`, width: `${Math.max(pos(y) - pos(x) + 100 / total, 0.6)}%` };
    };
    gantt = (
      <div className="gantt">
        <div className="gantt-l gantt-cab"><span /><div className="gantt-trilho">{meses.map((x) => <span key={x.t} className="gantt-mes" style={{ left: `${x.l}%`, width: `${x.w}%` }}>{x.t}</span>)}</div></div>
        {etapas.map((e) => {
          const ts = raiz.filter((t) => t.etapa_id === e.id && (t.inicio || t.termino));
          const ds = [e.inicio, e.termino, ...ts.flatMap((t) => [t.inicio, t.termino])].filter(Boolean) as string[];
          return (
            <div key={e.id}>
              <div className="gantt-l etapa">
                <strong>{e.sigla || e.nome}</strong>
                <div className="gantt-trilho">
                  {hojeP >= 0 && hojeP <= 100 && <i className="gantt-hoje" style={{ left: `${hojeP}%` }} />}
                  {ds.length > 0 && <b className="gantt-b etapa" style={barra(ds.reduce((a, b) => (a < b ? a : b)), ds.reduce((a, b) => (a > b ? a : b)))} />}
                </div>
              </div>
              {ts.map((t) => (
                <div key={t.id} className="gantt-l">
                  <button type="button" className="linkbtn" onClick={() => setAberta(t.id)}>{t.titulo}</button>
                  <div className="gantt-trilho">
                    {hojeP >= 0 && hojeP <= 100 && <i className="gantt-hoje" style={{ left: `${hojeP}%` }} />}
                    <b className={`gantt-b${t.status === "concluida" ? " ok" : atrasada(t) ? " atras" : ""}`} style={barra(t.inicio, t.termino)} title={`${dia(t.inicio)} – ${dia(t.termino)}`} />
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  // ---------- Horas ----------
  const horasAba = (
    <>
    {admin && (
      <div className="resumo box" style={{ marginBottom: 16, marginTop: 0 }}>
        <span>Custo de horas <b>{moeda(custoTot) || "R$ 0"}</b></span>
        {p.valor ? <span>Contrato <b>{moeda(p.valor)}</b></span> : null}
        {p.valor && custoTot ? <span>Custo / contrato <b>{Math.round((custoTot / p.valor) * 100)}%</b></span> : null}
        {p.area_m2 && custoTot ? <span>Custo por m² <b>{moeda(custoTot / p.area_m2)}</b></span> : null}
      </div>
    )}
    <div className="grid2">
      <section className="box">
        <h3 className="sec-t">Por pessoa</h3>
        {Object.keys(minPorPessoa).length === 0 ? <p className="note" style={{ margin: 0 }}>Nenhuma hora lançada.</p> : (
          <div className="stack" style={{ gap: 10 }}>
            {Object.entries(minPorPessoa).sort((a, b) => b[1] - a[1]).map(([id, min]) => {
              const x = id.startsWith("nome:") ? null : nomeDe(id);
              const nome = x?.nome ?? nomePessoa[id] ?? "—";
              return (
                <div key={id} className="row" style={{ justifyContent: "space-between" }}>
                  <span className="row" style={{ gap: 8 }}><Avatar nome={nome} foto={x?.foto_url} size={26} />{nome}</span>
                  <span>{sens && custoPorPessoa[id] ? <small className="note">{moeda(custoPorPessoa[id])} · </small> : null}<strong>{horas(min)}</strong></span>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section className="box">
        <h3 className="sec-t">Por etapa</h3>
        <div className="stack" style={{ gap: 10 }}>
          {etapas.map((e) => {
            const ts = raiz.filter((t) => t.etapa_id === e.id);
            const prev = ts.reduce((s, t) => s + Number(t.horas_previstas || 0), 0);
            const real = ts.reduce((s, t) => s + (minPorTarefa[t.id] ?? 0), 0);
            return (
              <div key={e.id} className="row" style={{ justifyContent: "space-between" }}>
                <span>{e.sigla || e.nome}</span>
                <span className={real / 60 > prev && prev > 0 ? "forte" : ""}>{horas(real)} / {prev}h</span>
              </div>
            );
          })}
          {minSemTarefa > 0 && (
            <div className="row" style={{ justifyContent: "space-between" }}><span>Sem tarefa</span><span>{horas(minSemTarefa)}</span></div>
          )}
          <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <strong>Total</strong><strong>{horas(realTot)} / {prevTot}h</strong>
          </div>
        </div>
      </section>
    </div>
    </>
  );

  return (
    <div>
      <p style={{ margin: "0 0 12px" }}><Link href="/projetos" className="note">← Projetos</Link></p>

      {!ed ? (
        <div className="cabeca">
          <div>
            <p className="mono" style={{ marginBottom: 8 }}>
              {[STATUS_PROJ[p.status], p.cliente?.nome, p.cidade, p.area_m2 ? `${p.area_m2.toLocaleString("pt-BR")} m²` : null, admin && p.valor ? moeda(p.valor) : null].filter(Boolean).join(" · ")}
            </p>
            <h1 className="h-l">{nomeProjeto(p)}</h1>
            <div className="resumo">
              <span><b>{progresso}%</b> concluído</span>
              <span><b>{horas(realTot)}</b> de {prevTot}h previstas</span>
              {nAtras > 0 && <span><b>{nAtras}</b> atrasadas</span>}
              {p.termino && <span>entrega <b>{dia(p.termino)}/{p.termino.slice(2, 4)}</b></span>}
            </div>
          </div>
          <div className="cabeca-acoes">
            {p.pasta_url && <a className="btn" href={p.pasta_url} target="_blank" rel="noreferrer">Abrir pasta</a>}
            {admin && <button className="btn" type="button" onClick={() => setEd(p)}>Editar</button>}
          </div>
        </div>
      ) : (
        <form className="box stack" style={{ marginBottom: 24 }} onSubmit={salvarProj}>
          <div className="grid2" style={{ gap: 12 }}>
            <label className="form-l"><span>Nome</span><input type="text" value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} maxLength={120} /></label>
            <label className="form-l"><span>Código</span><input type="text" value={ed.codigo ?? ""} disabled /></label>
            <label className="form-l"><span>Tipologia</span>
              <select className="f" value={ed.tipologia ?? ""} onChange={(e) => setEd({ ...ed, tipologia: e.target.value })}><option value="">—</option>{TIPOLOGIAS.map((t) => <option key={t}>{t}</option>)}</select>
            </label>
            <label className="form-l"><span>Status</span>
              <select className="f" value={ed.status} onChange={(e) => setEd({ ...ed, status: e.target.value as StatusProj })}>{(Object.keys(STATUS_PROJ) as StatusProj[]).map((s) => <option key={s} value={s}>{STATUS_PROJ[s]}</option>)}</select>
            </label>
            <label className="form-l"><span>Cliente</span>
              <select className="f" value={ed.cliente_id ?? ""} onChange={(e) => setEd({ ...ed, cliente_id: e.target.value || null })}><option value="">—</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            </label>
            <label className="form-l"><span>Coordenador</span>
              <select className="f" value={ed.coordenador_id ?? ""} onChange={(e) => setEd({ ...ed, coordenador_id: e.target.value || null })}><option value="">—</option>{equipe.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            </label>
            <label className="form-l"><span>Cidade</span><input type="text" value={ed.cidade ?? ""} onChange={(e) => setEd({ ...ed, cidade: e.target.value })} /></label>
            <label className="form-l"><span>Endereço</span><input type="text" value={ed.endereco ?? ""} onChange={(e) => setEd({ ...ed, endereco: e.target.value })} /></label>
            <label className="form-l"><span>Área (m²)</span><input type="number" step="0.01" value={ed.area_m2 ?? ""} onChange={(e) => setEd({ ...ed, area_m2: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label className="form-l"><span>Valor do contrato (R$)</span><input type="number" step="0.01" value={ed.valor ?? ""} onChange={(e) => setEd({ ...ed, valor: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label className="form-l"><span>Início</span><input type="date" value={ed.inicio ?? ""} onChange={(e) => setEd({ ...ed, inicio: e.target.value })} /></label>
            <label className="form-l"><span>Entrega final</span><input type="date" value={ed.termino ?? ""} onChange={(e) => setEd({ ...ed, termino: e.target.value })} /></label>
            <label className="form-l"><span>Link da pasta (Drive, Dropbox…)</span><input type="url" value={ed.pasta_url ?? ""} onChange={(e) => setEd({ ...ed, pasta_url: e.target.value })} /></label>
          </div>
          <label className="form-l"><span>Escopo</span><textarea value={ed.escopo ?? ""} onChange={(e) => setEd({ ...ed, escopo: e.target.value })} placeholder="O que está contratado" /></label>
          <div className="row">
            <button className="btn dark small" type="submit">Salvar</button>
            <button className="btn small" type="button" onClick={() => setEd(null)}>Cancelar</button>
            <button className="btn small ghost" type="button" style={{ marginLeft: "auto" }} onClick={async () => { await supabase.from("projetos").update({ ativo: !p.ativo }).eq("id", params.id); setEd(null); carregar(); }}>
              {p.ativo ? "Arquivar projeto" : "Reativar projeto"}
            </button>
          </div>
        </form>
      )}

      <div className="tabs" role="tablist" style={{ margin: "8px 0 20px" }}>
        {([["eap", "Etapas e tarefas"], ["cronograma", "Cronograma"], ["horas", "Horas"], ["equipe", "Equipe e recados"]] as [Aba, string][]).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{t}</button>
        ))}
      </div>

      {erro && <p className="err" role="alert" style={{ marginBottom: 12 }}>{erro}</p>}

      {aba === "eap" && eap}
      {aba === "cronograma" && gantt}
      {aba === "horas" && horasAba}
      {aba === "equipe" && <EquipeRecados projetoId={params.id} membros={membros} equipe={equipe} onChange={carregar} />}

      {aberta && <TarefaPainel id={aberta} pessoas={pessoas} etapas={etapas} onClose={() => setAberta(null)} onChange={carregar} />}
    </div>
  );
}

// Partners do projeto e recados (o que já existia, agora numa aba)
function EquipeRecados({ projetoId, membros, equipe, onChange }: { projetoId: string; membros: Pessoa[]; equipe: Pessoa[]; onChange: () => void }) {
  const { eu, esc } = useApp();
  const admin = usePode("projetos", true);
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [recados, setRecados] = useState<Rec[]>([]);
  const [texto, setTexto] = useState("");
  const [add, setAdd] = useState("");
  const [erro, setErro] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("recados").select("id,texto,created_at,autor_id,autor:perfis(nome,foto_url)").eq("projeto_id", projetoId).order("created_at");
    setRecados((data as unknown as Rec[]) ?? []);
  }, [supabase, projetoId]);

  useEffect(() => {
    carregar();
    const canal = supabase
      .channel(`recados-${projetoId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "recados", filter: `projeto_id=eq.${projetoId}` }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, projetoId, carregar]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "nearest" });
  }, [recados.length]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    const { error } = await supabase.from("recados").insert({ escritorio_id: esc.id, projeto_id: projetoId, autor_id: eu.id, texto: texto.trim() });
    if (error) return setErro(erroMsg(error));
    setTexto("");
    carregar();
  }

  async function incluir() {
    if (!add) return;
    const { error } = await supabase.from("projeto_membros").insert({ projeto_id: projetoId, perfil_id: add, escritorio_id: esc.id });
    if (error) return setErro(erroMsg(error));
    setAdd("");
    onChange();
  }

  async function tirar(id: string) {
    await supabase.from("projeto_membros").delete().eq("projeto_id", projetoId).eq("perfil_id", id);
    onChange();
  }

  const fora = equipe.filter((x) => !membros.some((m) => m.id === x.id));

  return (
    <div style={{ maxWidth: 900 }}>
      <section style={{ marginBottom: 28 }}>
        <h2 className="sec-t">Equipe do projeto</h2>
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
        <p className="note" style={{ marginTop: 10 }}>Quem está na equipe vê o projeto e pode ser responsável por tarefas.</p>
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
