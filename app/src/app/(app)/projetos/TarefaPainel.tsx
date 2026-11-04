"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { Avatar } from "../ui";
import { erroMsg } from "@/lib/util";
import { EVENTO, cronAtual, iniciar, parar } from "@/lib/cronometro";
import {
  CAMPOS_TAREFA, ORDEM_STATUS, PRIORIDADE, STATUS_TAREFA, hoje, horas,
  type Etapa, type Pessoa, type Prioridade, type StatusTarefa, type Tarefa,
} from "@/lib/gestor";

type Item = { id: string; texto: string; feito: boolean; ordem: number };
type Apont = { id: string; data: string; minutos: number; nota: string | null; perfil_id: string; perfil: { nome: string | null } | null };
type Disc = { id: string; nome: string };

// Painel lateral de uma tarefa: dados, checklist e horas.
// Admin edita tudo; o responsável muda status, checklist e lança horas.
export default function TarefaPainel({
  id, pessoas, etapas, onClose, onChange,
}: {
  id: string;
  pessoas: Pessoa[];
  etapas?: Etapa[];
  onClose: () => void;
  onChange: () => void;
}) {
  const { eu, esc, admin } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [t, setT] = useState<Tarefa | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [aps, setAps] = useState<Apont[]>([]);
  const [discs, setDiscs] = useState<Disc[]>([]);
  const [novoItem, setNovoItem] = useState("");
  const [lanc, setLanc] = useState({ data: hoje(), h: "1", nota: "" });
  const [erro, setErro] = useState("");
  const [salvo, setSalvo] = useState(false);
  const [cronAqui, setCronAqui] = useState(false);

  const carregar = useCallback(async () => {
    const [{ data: tt }, { data: ii }, { data: aa }] = await Promise.all([
      supabase.from("tarefas").select(CAMPOS_TAREFA).eq("id", id).maybeSingle(),
      supabase.from("checklist_itens").select("id,texto,feito,ordem").eq("tarefa_id", id).order("ordem"),
      supabase.from("apontamentos").select("id,data,minutos,nota,perfil_id,perfil:perfis(nome)").eq("tarefa_id", id).order("data", { ascending: false }),
    ]);
    setT((tt as Tarefa) ?? null);
    setItens((ii as Item[]) ?? []);
    setAps((aa as unknown as Apont[]) ?? []);
  }, [supabase, id]);

  useEffect(() => {
    carregar();
    supabase.from("disciplinas").select("id,nome").eq("escritorio_id", esc.id).order("ordem").then(({ data }) => setDiscs((data as Disc[]) ?? []));
  }, [carregar, supabase, esc.id]);

  useEffect(() => {
    const ver = () => cronAtual(supabase, eu.id).then((c) => setCronAqui(c?.tarefa_id === id));
    ver();
    window.addEventListener(EVENTO, ver);
    return () => window.removeEventListener(EVENTO, ver);
  }, [supabase, eu.id, id]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  if (!t) {
    return (
      <div className="gaveta-fundo" onClick={onClose}>
        <aside className="gaveta" onClick={(e) => e.stopPropagation()}><p className="note">Carregando…</p></aside>
      </div>
    );
  }

  const souResp = t.responsavel_id === eu.id;
  const pode = admin || souResp;
  const set = (p: Partial<Tarefa>) => setT({ ...t, ...p });

  async function salvar(p: Partial<Tarefa>) {
    setErro("");
    const { error } = await supabase.from("tarefas").update(p).eq("id", id);
    if (error) return setErro(erroMsg(error));
    setSalvo(true);
    setTimeout(() => setSalvo(false), 1500);
    onChange();
  }

  async function salvarTudo(e: React.FormEvent) {
    e.preventDefault();
    if (!t) return;
    const { titulo, descricao, responsavel_id, inicio, termino, horas_previstas, status, prioridade, disciplina_id, etapa_id } = t;
    if (!titulo.trim()) return setErro("Dê um título à tarefa.");
    await salvar(
      admin
        ? { titulo: titulo.trim(), descricao: descricao || null, responsavel_id, inicio: inicio || null, termino: termino || null, horas_previstas: Number(horas_previstas) || 0, status, prioridade, disciplina_id, etapa_id }
        : { status },
    );
  }

  async function mudarStatus(s: StatusTarefa) {
    set({ status: s });
    await salvar({ status: s });
  }

  async function marcar(i: Item) {
    setItens(itens.map((x) => (x.id === i.id ? { ...x, feito: !x.feito } : x)));
    await supabase.from("checklist_itens").update({ feito: !i.feito }).eq("id", i.id);
    onChange();
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!novoItem.trim()) return;
    const { error } = await supabase.from("checklist_itens").insert({ escritorio_id: esc.id, tarefa_id: id, texto: novoItem.trim(), ordem: itens.length + 1 });
    if (error) return setErro(erroMsg(error));
    setNovoItem("");
    carregar();
    onChange();
  }

  async function tirarItem(i: Item) {
    await supabase.from("checklist_itens").delete().eq("id", i.id);
    carregar();
    onChange();
  }

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    if (!t) return;
    const min = Math.round(parseFloat(lanc.h.replace(",", ".")) * 60);
    if (!min || min <= 0 || min > 1440) return setErro("Informe as horas (ex.: 1,5).");
    const { error } = await supabase.from("apontamentos").insert({
      escritorio_id: esc.id, perfil_id: eu.id, projeto_id: t.projeto_id, tarefa_id: id, data: lanc.data, minutos: min, nota: lanc.nota.trim() || null,
    });
    if (error) return setErro(erroMsg(error));
    setLanc({ ...lanc, h: "1", nota: "" });
    carregar();
    onChange();
  }

  async function cronometro() {
    if (!t) return;
    if (cronAqui) {
      await parar(supabase);
      carregar();
      onChange();
      return;
    }
    const error = await iniciar(supabase, esc.id, { projeto_id: t.projeto_id, tarefa_id: id });
    if (error) return setErro(erroMsg(error));
    if (t.status === "pendente" || t.status === "backlog") mudarStatus("andamento");
  }

  async function tirarApont(a: Apont) {
    await supabase.from("apontamentos").delete().eq("id", a.id);
    carregar();
    onChange();
  }

  async function excluir() {
    if (!confirm("Excluir esta tarefa, o checklist e as subtarefas?")) return;
    const { error } = await supabase.from("tarefas").delete().eq("id", id);
    if (error) return setErro(erroMsg(error));
    onChange();
    onClose();
  }

  const feitos = itens.filter((i) => i.feito).length;
  const realizado = aps.reduce((s, a) => s + a.minutos, 0);
  const resp = pessoas.find((p) => p.id === t.responsavel_id);

  return (
    <div className="gaveta-fundo" onClick={onClose}>
      <aside className="gaveta" role="dialog" aria-modal="true" aria-label={t.titulo} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
          <p className="mono">Tarefa{salvo ? " · salvo" : ""}</p>
          <button className="btn small" type="button" onClick={onClose}>Fechar</button>
        </div>

        <form className="stack" onSubmit={salvarTudo}>
          {admin ? (
            <input type="text" className="titulo-in" value={t.titulo} onChange={(e) => set({ titulo: e.target.value })} aria-label="Título" maxLength={200} />
          ) : (
            <h2 className="h-m" style={{ margin: 0 }}>{t.titulo}</h2>
          )}

          <div className="status-linha" role="group" aria-label="Status">
            {ORDEM_STATUS.map((s) => (
              <button key={s} type="button" className={t.status === s ? "on" : ""} disabled={!pode} onClick={() => mudarStatus(s)}>{STATUS_TAREFA[s]}</button>
            ))}
          </div>

          {admin ? (
            <div className="grid2" style={{ gap: 12 }}>
              <label className="form-l"><span>Responsável</span>
                <select className="f" value={t.responsavel_id ?? ""} onChange={(e) => set({ responsavel_id: e.target.value || null })}>
                  <option value="">Sem responsável</option>
                  {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </label>
              <label className="form-l"><span>Prioridade</span>
                <select className="f" value={t.prioridade} onChange={(e) => set({ prioridade: e.target.value as Prioridade })}>
                  {(Object.keys(PRIORIDADE) as Prioridade[]).map((p) => <option key={p} value={p}>{PRIORIDADE[p]}</option>)}
                </select>
              </label>
              <label className="form-l"><span>Início</span><input type="date" value={t.inicio ?? ""} onChange={(e) => set({ inicio: e.target.value || null })} /></label>
              <label className="form-l"><span>Entrega</span><input type="date" value={t.termino ?? ""} onChange={(e) => set({ termino: e.target.value || null })} /></label>
              <label className="form-l"><span>Horas previstas</span><input type="number" min={0} step={0.5} value={t.horas_previstas} onChange={(e) => set({ horas_previstas: Number(e.target.value) })} /></label>
              <label className="form-l"><span>Disciplina</span>
                <select className="f" value={t.disciplina_id ?? ""} onChange={(e) => set({ disciplina_id: e.target.value || null })}>
                  <option value="">—</option>
                  {discs.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              </label>
              {etapas && etapas.length > 0 && (
                <label className="form-l"><span>Etapa</span>
                  <select className="f" value={t.etapa_id ?? ""} onChange={(e) => set({ etapa_id: e.target.value || null })}>
                    <option value="">Sem etapa</option>
                    {etapas.map((x) => <option key={x.id} value={x.id}>{[x.sigla, x.nome].filter(Boolean).join(" · ")}</option>)}
                  </select>
                </label>
              )}
            </div>
          ) : (
            <dl className="ficha">
              <dt>Responsável</dt><dd>{resp?.nome ?? "—"}</dd>
              <dt>Entrega</dt><dd>{t.termino ? t.termino.split("-").reverse().join("/") : "—"}</dd>
              <dt>Previsto</dt><dd>{t.horas_previstas} h</dd>
              <dt>Prioridade</dt><dd>{PRIORIDADE[t.prioridade]}</dd>
            </dl>
          )}

          {admin ? (
            <label className="form-l"><span>Descrição</span><textarea value={t.descricao ?? ""} onChange={(e) => set({ descricao: e.target.value })} placeholder="O que precisa ser entregue, referências, links" /></label>
          ) : (
            t.descricao && <p className="texto-aula" style={{ margin: 0 }}>{t.descricao}</p>
          )}

          {admin && (
            <div className="row">
              <button className="btn dark small" type="submit">Salvar</button>
              <button className="btn small ghost" type="button" onClick={excluir} style={{ marginLeft: "auto" }}>Excluir tarefa</button>
            </div>
          )}
        </form>

        <section style={{ marginTop: 26 }}>
          <h3 className="sec-t">Checklist {itens.length > 0 && <small className="note">{feitos}/{itens.length}</small>}</h3>
          <div className="check">
            {itens.map((i) => (
              <div key={i.id} className="check-i">
                <label>
                  <input type="checkbox" checked={i.feito} disabled={!pode} onChange={() => marcar(i)} />
                  <span className={i.feito ? "feito" : ""}>{i.texto}</span>
                </label>
                {admin && <button className="linkbtn" type="button" onClick={() => tirarItem(i)} aria-label={`Remover ${i.texto}`}>×</button>}
              </div>
            ))}
            {itens.length === 0 && <p className="note" style={{ margin: 0 }}>Sem itens.</p>}
          </div>
          {admin && (
            <form className="row" style={{ marginTop: 10, flexWrap: "nowrap" }} onSubmit={addItem}>
              <input type="text" value={novoItem} onChange={(e) => setNovoItem(e.target.value)} placeholder="Novo item" aria-label="Novo item do checklist" />
              <button className="btn small" type="submit">Adicionar</button>
            </form>
          )}
        </section>

        <section style={{ marginTop: 26 }}>
          <h3 className="sec-t">Horas <small className="note">{horas(realizado)} de {t.horas_previstas}:00 previstas</small></h3>
          {pode && (
            <button className={`btn small${cronAqui ? "" : " dark"}`} type="button" onClick={cronometro} style={{ marginBottom: 10 }}>
              {cronAqui ? "Parar cronômetro" : "Iniciar cronômetro"}
            </button>
          )}
          {pode && (
            <form className="lanc" onSubmit={lancar}>
              <input type="date" value={lanc.data} onChange={(e) => setLanc({ ...lanc, data: e.target.value })} aria-label="Data" />
              <input type="text" inputMode="decimal" value={lanc.h} onChange={(e) => setLanc({ ...lanc, h: e.target.value })} aria-label="Horas" style={{ width: 80 }} />
              <input type="text" value={lanc.nota} onChange={(e) => setLanc({ ...lanc, nota: e.target.value })} placeholder="O que foi feito (opcional)" aria-label="Nota" />
              <button className="btn small dark" type="submit">Lançar</button>
            </form>
          )}
          <div className="lista" style={{ marginTop: 10 }}>
            {aps.length === 0 ? (
              <p className="note" style={{ padding: "12px 16px", margin: 0 }}>Nenhuma hora lançada.</p>
            ) : (
              aps.map((a) => (
                <div key={a.id} className="item" style={{ padding: "10px 16px" }}>
                  <Avatar nome={a.perfil?.nome} size={24} />
                  <div className="item-t">
                    <strong style={{ fontSize: 14 }}>{horas(a.minutos)} · {a.data.split("-").reverse().join("/")}</strong>
                    <small>{[a.perfil?.nome, a.nota].filter(Boolean).join(" · ")}</small>
                  </div>
                  {(admin || a.perfil_id === eu.id) && <button className="linkbtn" type="button" onClick={() => tirarApont(a)} aria-label="Apagar lançamento">×</button>}
                </div>
              ))
            )}
          </div>
        </section>

        {erro && <p className="err" role="alert" style={{ marginTop: 12 }}>{erro}</p>}
      </aside>
    </div>
  );
}
