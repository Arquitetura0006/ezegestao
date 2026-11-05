"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp, usePode } from "../../ctx";
import { Avatar, Vazio } from "../../ui";
import { PAPEL, erroMsg } from "@/lib/util";
import { CAMPOS_TAREFA, hoje, type Pessoa, type StatusTarefa } from "@/lib/gestor";
import { brl, dataBR, parseValor } from "@/lib/financeiro";
import TarefaPainel from "../../projetos/TarefaPainel";
import { Ico, SEL_TAREFA, type MembroP, type TP } from "./comum";
import { Calendario, Lista, Quadro, Timeline } from "./AbasTarefas";
import { Metricas, Timesheet } from "./AbasHoras";
import Custos from "./AbaCustos";
import Documentos from "./AbaDocumentos";
import AbaPermissoes from "./AbaPermissoes";

type Aba = "lista" | "metricas" | "timesheet" | "calendario" | "quadro" | "timeline" | "custos" | "documentos" | "permissoes";
const NOMES: Record<Aba, string> = {
  lista: "Lista", metricas: "Métricas", timesheet: "Timesheet", calendario: "Calendário", quadro: "Quadro",
  timeline: "Timeline", custos: "Centro de Custos", documentos: "Documentos", permissoes: "Permissões",
};

export default function PessoaPagina() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const { eu, esc, admin: souAdmin } = useApp();
  const verEquipe = usePode("equipe");
  const editarEquipe = usePode("equipe", true);
  const verFin = usePode("financeiro");
  const editarProj = usePode("projetos", true);
  const editarPlan = usePode("planejamento", true);
  const editarTarefas = editarProj || editarPlan;
  const supabase = useMemo(() => supabaseNavegador(), []);
  const souEu = id === eu.id;

  const [m, setM] = useState<MembroP | null | undefined>(undefined);
  const [tarefas, setTarefas] = useState<TP[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState("");

  const abas: Aba[] = [
    "lista", "metricas", "timesheet", "calendario", "quadro", "timeline",
    ...(verFin ? (["custos"] as Aba[]) : []),
    ...(souEu || editarEquipe ? (["documentos"] as Aba[]) : []),
    ...(souAdmin ? (["permissoes"] as Aba[]) : []),
  ];
  const pedida = (sp.get("aba") as Aba) || "lista";
  const aba: Aba = abas.includes(pedida) ? pedida : "lista";
  const irAba = (a: Aba) => router.replace(`/equipe/${id}${a === "lista" ? "" : `?aba=${a}`}`, { scroll: false });

  const carregarMembro = useCallback(async () => {
    const { data } = await supabase.from("membros").select("*, perfil:perfis(nome,email,foto_url,cidade)").eq("escritorio_id", esc.id).eq("perfil_id", id).maybeSingle();
    setM((data as MembroP) ?? null);
  }, [supabase, esc.id, id]);

  const carregarTarefas = useCallback(async () => {
    const { data, error } = await supabase.from("tarefas").select(`${CAMPOS_TAREFA},${SEL_TAREFA}`).eq("escritorio_id", esc.id).eq("responsavel_id", id)
      .order("termino", { ascending: true, nullsFirst: false }).limit(3000);
    if (error) setErro(erroMsg(error));
    setTarefas(((data as unknown as TP[]) ?? []).filter((t) => t.projeto?.ativo !== false));
  }, [supabase, esc.id, id]);

  useEffect(() => {
    carregarMembro();
    carregarTarefas();
    supabase.from("membros").select("perfil:perfis(id,nome,foto_url)").eq("escritorio_id", esc.id).eq("ativo", true)
      .then(({ data }) => setPessoas(((data ?? []) as unknown as { perfil: Pessoa | null }[]).map((x) => x.perfil).filter(Boolean) as Pessoa[]));
  }, [carregarMembro, carregarTarefas, supabase, esc.id]);

  async function mover(t: TP, s: StatusTarefa) {
    setTarefas((l) => l.map((x) => (x.id === t.id ? { ...x, status: s } : x)));
    const { error } = await supabase.from("tarefas").update({ status: s }).eq("id", t.id);
    if (error) {
      setErro(erroMsg(error));
      carregarTarefas();
    }
  }

  if (!souEu && !verEquipe) return <Vazio titulo="Sem acesso" texto="Você pode abrir só a sua própria página. Peça acesso ao módulo Equipe." />;
  if (m === undefined) return <p className="note">Carregando…</p>;
  if (m === null) return <Vazio titulo="Pessoa não encontrada"><Link className="btn" href="/equipe">Voltar para a equipe</Link></Vazio>;

  const nome = m.perfil?.nome || m.perfil?.email || "Sem nome";
  const hs = Number(m.horas_semana) || 40;

  return (
    <>
      <div className="pessoa-topo">
        <Avatar nome={nome} foto={m.perfil?.foto_url} size={72} />
        <div style={{ minWidth: 0 }}>
          <div className="pessoa-nome">
            <h1>{nome}</h1>
            <span className={`st-pill${m.ativo ? " cheio" : " cinza"}`}>{m.ativo ? "Ativo" : "Removido"}</span>
            <span className="st-pill">{PAPEL[m.papel]}</span>
          </div>
          <p className="note" style={{ margin: "4px 0 0", fontSize: 14 }}>
            {[m.cargo, (souEu || verEquipe) ? m.perfil?.email : null, m.perfil?.cidade].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="acoes">
          <Link className="btn small ghost" href="/equipe">Equipe</Link>
          {souEu && <Link className="btn small" href="/perfil">Meu perfil</Link>}
          {editarEquipe && <button className="btn small" type="button" onClick={() => setEditando(true)}>Editar cadastro</button>}
        </div>
      </div>

      <nav className="tabs pessoa-tabs" aria-label="Seções da pessoa">
        {abas.map((a) => (
          <button key={a} type="button" className={aba === a ? "on" : ""} aria-current={aba === a ? "page" : undefined} onClick={() => irAba(a)}>
            <Ico k={a} />
            {NOMES[a]}
          </button>
        ))}
      </nav>

      <div className="pessoa-corpo">
        {erro && <p className="err" role="alert" style={{ marginBottom: 10 }}>{erro}</p>}
        {aba === "lista" && <Lista tarefas={tarefas} abrir={setAberta} />}
        {aba === "metricas" && <Metricas pessoa={id} tarefas={tarefas} horasSemana={hs} />}
        {aba === "timesheet" && <Timesheet pessoa={id} horasSemana={hs} souEu={souEu} />}
        {aba === "calendario" && <Calendario pessoa={id} tarefas={tarefas} abrir={setAberta} />}
        {aba === "quadro" && <Quadro tarefas={tarefas} abrir={setAberta} podeMover={editarTarefas || souEu} mover={mover} />}
        {aba === "timeline" && <Timeline tarefas={tarefas} abrir={setAberta} />}
        {aba === "custos" && <Custos m={m} />}
        {aba === "documentos" && <Documentos pessoa={id} />}
        {aba === "permissoes" && <AbaPermissoes m={m} onSaved={carregarMembro} />}
      </div>

      {aberta && <TarefaPainel id={aberta} pessoas={pessoas} onClose={() => setAberta(null)} onChange={carregarTarefas} />}
      {editando && <Cadastro m={m} onClose={() => setEditando(false)} onSaved={() => { setEditando(false); carregarMembro(); }} />}
    </>
  );
}

// Gaveta: cargo, horas por semana, valor/hora (dados sensíveis) e remover/reativar.
function Cadastro({ m, onClose, onSaved }: { m: MembroP; onClose: () => void; onSaved: () => void }) {
  const { eu, esc, papel: meuPapel, admin: souAdmin } = useApp();
  const sens = usePode("sensiveis");
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [f, setF] = useState({ cargo: m.cargo ?? "", hs: String(m.horas_semana ?? 40) });
  const [vh, setVh] = useState<{ valor: number; desde: string }[] | null>(null);
  const [novo, setNovo] = useState({ valor: "", desde: hoje() });
  const [erro, setErro] = useState("");

  const carregarVh = useCallback(() => {
    if (!sens) return;
    supabase.from("valores_hora").select("valor,desde").eq("escritorio_id", esc.id).eq("perfil_id", m.perfil_id).order("desde", { ascending: false })
      .then(({ data }) => setVh((data as { valor: number; desde: string }[]) ?? []));
  }, [supabase, esc.id, m.perfil_id, sens]);
  useEffect(() => {
    carregarVh();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [carregarVh, onClose]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const hs = Number(f.hs.replace(",", "."));
    if (!(hs >= 0 && hs <= 80)) return setErro("Horas por semana entre 0 e 80.");
    const { error } = await supabase.from("membros").update({ cargo: f.cargo.trim() || null, horas_semana: hs }).eq("escritorio_id", esc.id).eq("perfil_id", m.perfil_id);
    if (error) return setErro(erroMsg(error));
    onSaved();
  }

  async function salvarVh() {
    setErro("");
    const v = parseValor(novo.valor);
    if (v === null || v < 0) return setErro("Confira o valor/hora.");
    const { error } = await supabase.from("valores_hora").upsert({ escritorio_id: esc.id, perfil_id: m.perfil_id, valor: v, desde: novo.desde }, { onConflict: "escritorio_id,perfil_id,desde" });
    if (error) return setErro(erroMsg(error));
    setNovo({ valor: "", desde: hoje() });
    carregarVh();
  }

  async function alternar() {
    if (m.ativo && !confirm(`Remover ${m.perfil?.nome || "esta pessoa"} do escritório? O acesso é bloqueado na hora; dá para reativar depois.`)) return;
    const { error } = await supabase.from("membros").update({ ativo: !m.ativo }).eq("escritorio_id", esc.id).eq("perfil_id", m.perfil_id);
    if (error) return setErro(erroMsg(error));
    onSaved();
  }

  const podeRemover = m.perfil_id !== eu.id && m.papel !== "dono" && (souAdmin || m.papel !== "admin") && !(m.papel === "admin" && meuPapel !== "dono");

  return (
    <div className="gaveta-fundo" onClick={onClose}>
      <aside className="gaveta" role="dialog" aria-label="Editar cadastro" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <h2 className="h-m" style={{ margin: 0 }}>Cadastro</h2>
          <button className="btn small ghost" type="button" onClick={onClose}>Fechar</button>
        </div>
        <form className="stack" onSubmit={salvar}>
          <label className="form-l">
            <span>Cargo</span>
            <input type="text" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} placeholder="Ex.: Arquiteta, Projetista, Estagiária" maxLength={60} />
          </label>
          <label className="form-l">
            <span>Horas disponíveis por semana</span>
            <input type="number" min={0} max={80} value={f.hs} onChange={(e) => setF({ ...f, hs: e.target.value })} style={{ maxWidth: 140 }} />
          </label>
          <div className="row"><button className="btn dark" type="submit">Salvar</button></div>
        </form>

        {sens && (
          <section style={{ marginTop: 28 }}>
            <h3 className="sec-t">Valor/hora</h3>
            {vh === null ? <p className="note">Carregando…</p> : vh.length === 0 ? <p className="note">Sem valor cadastrado. Sem ele, o custo das horas fica zerado.</p> : (
              <div className="lista" style={{ marginBottom: 12 }}>
                {vh.map((x, i) => (
                  <div key={x.desde} className="item">
                    <span className="item-t"><strong>{brl(x.valor)} / hora</strong><small>desde {dataBR(x.desde)}{i === 0 ? " · vigente" : ""}</small></span>
                  </div>
                ))}
              </div>
            )}
            {souAdmin && (
              <div className="row" style={{ alignItems: "flex-end" }}>
                <label className="form-l" style={{ flex: "1 1 120px" }}><span>Novo valor</span><input type="text" inputMode="decimal" value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} placeholder="R$ 0,00" /></label>
                <label className="form-l" style={{ flex: "1 1 140px" }}><span>Desde</span><input type="date" value={novo.desde} onChange={(e) => setNovo({ ...novo, desde: e.target.value })} /></label>
                <button className="btn" type="button" onClick={salvarVh}>Adicionar</button>
              </div>
            )}
            <p className="note" style={{ marginTop: 8 }}>O custo de cada hora usa o valor vigente na data do lançamento. Para recalcular o histórico, use Cadastros › Equipe.</p>
          </section>
        )}

        {erro && <p className="err" role="alert" style={{ marginTop: 12 }}>{erro}</p>}

        {podeRemover && (
          <section style={{ marginTop: 28, borderTop: "1px solid var(--line)", paddingTop: 18 }}>
            <button className="btn" type="button" onClick={alternar}>{m.ativo ? "Remover do escritório" : "Reativar no escritório"}</button>
          </section>
        )}
      </aside>
    </div>
  );
}
