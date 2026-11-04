"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { Avatar, Cabeca, Vazio } from "../ui";
import { erroMsg } from "@/lib/util";
import {
  CAMPOS_TAREFA, ORDEM_STATUS, PRIORIDADE, STATUS_TAREFA, atrasada, dia, diasUteis, hoje, horas, iso, nomeProjeto, segunda, somaDias,
  type Pessoa, type StatusTarefa, type Tarefa,
} from "@/lib/gestor";
import TarefaPainel from "../projetos/TarefaPainel";

type T = Tarefa & { projeto: { codigo: number | null; tipologia: string | null; nome: string } | null; etapa: { sigla: string | null } | null };
type Membro = Pessoa & { horas_semana: number };
type Aba = "lista" | "quadro" | "carga";

export default function Tarefas() {
  const { eu, esc, admin } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [lista, setLista] = useState<T[] | null>(null);
  const [equipe, setEquipe] = useState<Membro[]>([]);
  const [quem, setQuem] = useState<string>(eu.id);
  const [aba, setAba] = useState<Aba>("lista");
  const [grupo, setGrupo] = useState<"proximas" | "atrasadas" | "backlog" | "concluidas">("proximas");
  const [aberta, setAberta] = useState<string | null>(null);
  const [semana, setSemana] = useState(segunda());
  const [apont, setApont] = useState<{ perfil_id: string; minutos: number }[]>([]);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    let q = supabase.from("tarefas").select(`${CAMPOS_TAREFA},projeto:projetos!inner(codigo,tipologia,nome,ativo),etapa:projeto_etapas(sigla)`)
      .eq("escritorio_id", esc.id).eq("projeto.ativo", true).order("termino", { ascending: true, nullsFirst: false }).limit(2000);
    if (quem !== "todos") q = q.eq("responsavel_id", quem);
    const { data, error } = await q;
    if (error) setErro(erroMsg(error));
    setLista((data as unknown as T[]) ?? []);
  }, [supabase, esc.id, quem]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    supabase.from("membros").select("horas_semana,perfil:perfis(id,nome,foto_url)").eq("escritorio_id", esc.id).eq("ativo", true)
      .then(({ data }) => setEquipe(((data ?? []) as unknown as { horas_semana: number; perfil: Pessoa | null }[])
        .filter((x) => x.perfil).map((x) => ({ ...(x.perfil as Pessoa), horas_semana: Number(x.horas_semana) || 40 }))
        .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""))));
  }, [supabase, esc.id]);

  useEffect(() => {
    if (aba !== "carga") return;
    const ini = iso(semana);
    const fim = iso(somaDias(semana, 6));
    supabase.from("apontamentos").select("perfil_id,minutos").eq("escritorio_id", esc.id).gte("data", ini).lte("data", fim)
      .then(({ data }) => setApont((data as { perfil_id: string; minutos: number }[]) ?? []));
    if (quem !== "todos") setQuem("todos");
  }, [aba, semana, supabase, esc.id, quem]);

  async function mover(t: T, s: StatusTarefa) {
    setLista((l) => (l ?? []).map((x) => (x.id === t.id ? { ...x, status: s } : x)));
    const { error } = await supabase.from("tarefas").update({ status: s }).eq("id", t.id);
    if (error) {
      setErro(erroMsg(error));
      carregar();
    }
  }

  const raiz = (lista ?? []);
  const grupos = {
    proximas: raiz.filter((t) => t.status !== "concluida" && t.status !== "backlog" && !atrasada(t)),
    atrasadas: raiz.filter((t) => atrasada(t) && t.status !== "backlog"),
    backlog: raiz.filter((t) => t.status === "backlog"),
    concluidas: raiz.filter((t) => t.status === "concluida").sort((a, b) => (b.concluida_em ?? "").localeCompare(a.concluida_em ?? "")).slice(0, 100),
  };
  const nomeDe = (id: string | null) => equipe.find((p) => p.id === id);

  const Cartao = ({ t }: { t: T }) => {
    const r = nomeDe(t.responsavel_id);
    return (
      <button type="button" className="cartao" onClick={() => setAberta(t.id)}>
        <strong>{t.titulo}</strong>
        <small className="note">{t.projeto ? nomeProjeto(t.projeto) : ""}{t.etapa?.sigla ? ` · ${t.etapa.sigla}` : ""}</small>
        <span className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
          <small className={atrasada(t) ? "atras" : "note"}>{t.termino ? `entrega ${dia(t.termino)}` : "sem data"}</small>
          {r && <Avatar nome={r.nome} foto={r.foto_url} size={22} />}
        </span>
      </button>
    );
  };

  // ---------- carga da semana ----------
  const iniS = iso(semana);
  const fimS = iso(somaDias(semana, 4));
  const previstoNaSemana = (t: Tarefa) => {
    if (t.status === "concluida" || t.status === "backlog" || !t.horas_previstas) return 0;
    const a = t.inicio || t.termino;
    const b = t.termino || t.inicio;
    if (!a || !b) return 0;
    const tot = Math.max(diasUteis(a, b), 1);
    const x = a > iniS ? a : iniS;
    const y = b < fimS ? b : fimS;
    if (x > y) return 0;
    return (Number(t.horas_previstas) * diasUteis(x, y)) / tot;
  };

  const carga = (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div className="row">
          <button className="btn small" type="button" onClick={() => setSemana(somaDias(semana, -7))} aria-label="Semana anterior">←</button>
          <strong>Semana de {dia(iniS)} a {dia(iso(somaDias(semana, 6)))}</strong>
          <button className="btn small" type="button" onClick={() => setSemana(somaDias(semana, 7))} aria-label="Próxima semana">→</button>
          <button className="btn small ghost" type="button" onClick={() => setSemana(segunda())}>Hoje</button>
        </div>
        <small className="note">Previsto = horas das tarefas distribuídas nos dias úteis entre início e entrega.</small>
      </div>
      <div className="lista">
        {equipe.map((p) => {
          const prev = raiz.filter((t) => t.responsavel_id === p.id).reduce((s, t) => s + previstoNaSemana(t), 0);
          const real = apont.filter((a) => a.perfil_id === p.id).reduce((s, a) => s + a.minutos, 0) / 60;
          const cap = p.horas_semana;
          const pc = Math.round((prev / cap) * 100);
          return (
            <div key={p.id} className="item carga">
              <Avatar nome={p.nome} foto={p.foto_url} size={30} />
              <div className="item-t">
                <strong>{p.nome}</strong>
                <span className="carga-b" aria-label={`${pc}% da capacidade planejada`}>
                  <i style={{ width: `${Math.min(pc, 100)}%` }} className={pc > 100 ? "excesso" : ""} />
                  <em style={{ left: `${Math.min((real / cap) * 100, 100)}%` }} title="Horas lançadas" />
                </span>
              </div>
              <small className="carga-n">
                <b>{pc}%</b> {Math.round(prev)}h previstas · {horas(real * 60)} lançadas · {cap}h/sem
              </small>
            </div>
          );
        })}
      </div>
      <p className="note" style={{ marginTop: 10 }}>Barra preta: horas previstas. Marca: horas lançadas. Acima de 100% = sobrecarga. A capacidade de cada pessoa fica em Cadastros › Equipe.</p>
    </>
  );

  return (
    <>
      <Cabeca kicker={esc.nome} titulo="Tarefas">
        {admin && aba !== "carga" && (
          <select className="f" style={{ width: "auto" }} value={quem} onChange={(e) => setQuem(e.target.value)} aria-label="Responsável">
            <option value={eu.id}>Minhas tarefas</option>
            <option value="todos">Toda a equipe</option>
            {equipe.filter((p) => p.id !== eu.id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        )}
      </Cabeca>

      <div className="tabs" role="tablist" style={{ marginBottom: 20 }}>
        <button type="button" className={aba === "lista" ? "on" : ""} onClick={() => setAba("lista")}>Lista</button>
        <button type="button" className={aba === "quadro" ? "on" : ""} onClick={() => setAba("quadro")}>Quadro</button>
        {admin && <button type="button" className={aba === "carga" ? "on" : ""} onClick={() => setAba("carga")}>Carga da equipe</button>}
      </div>

      {erro && <p className="err" role="alert" style={{ marginBottom: 12 }}>{erro}</p>}

      {lista === null ? (
        <p className="note">Carregando…</p>
      ) : aba === "carga" ? (
        carga
      ) : aba === "quadro" ? (
        <div className="quadro">
          {ORDEM_STATUS.map((s) => {
            const col = raiz.filter((t) => t.status === s).slice(0, s === "concluida" ? 30 : 500);
            return (
              <section key={s} className="col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { const id = e.dataTransfer.getData("text/plain"); const t = raiz.find((x) => x.id === id); if (t && t.status !== s) mover(t, s); }}>
                <h2 className="col-t">{STATUS_TAREFA[s]} <small>{raiz.filter((t) => t.status === s).length}</small></h2>
                {col.map((t) => (
                  <div key={t.id} draggable={admin || t.responsavel_id === eu.id} onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}>
                    <Cartao t={t} />
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <div className="tabs" role="tablist" style={{ marginBottom: 14, background: "transparent", padding: 0 }}>
            {([["proximas", "Próximas"], ["atrasadas", "Atrasadas"], ["backlog", "Backlog"], ["concluidas", "Concluídas"]] as const).map(([k, t]) => (
              <button key={k} type="button" className={grupo === k ? "on" : ""} onClick={() => setGrupo(k)}>{t} ({grupos[k].length})</button>
            ))}
          </div>
          {grupos[grupo].length === 0 ? (
            <Vazio titulo={grupo === "atrasadas" ? "Nada atrasado" : "Nenhuma tarefa aqui"} texto={grupo === "proximas" ? "As tarefas atribuídas nos projetos aparecem aqui." : undefined} />
          ) : (
            <div className="lista">
              {grupos[grupo].map((t) => {
                const r = nomeDe(t.responsavel_id);
                return (
                  <button key={t.id} type="button" className="item tarefa-i" onClick={() => setAberta(t.id)}>
                    <span className={`tick${t.status === "concluida" ? " on" : ""}`} aria-hidden="true" />
                    <span className="item-t">
                      <strong>{t.titulo}</strong>
                      <small>
                        {t.projeto && <Link href={`/projetos/${t.projeto_id}`} onClick={(e) => e.stopPropagation()}>{nomeProjeto(t.projeto)}</Link>}
                        {t.etapa?.sigla ? ` · ${t.etapa.sigla}` : ""}
                        {` · ${STATUS_TAREFA[t.status]}`}
                        {t.prioridade !== "media" ? ` · ${PRIORIDADE[t.prioridade]}` : ""}
                        {` · ${t.horas_previstas}h`}
                      </small>
                    </span>
                    <small className={atrasada(t) ? "atras" : "note"}>{t.termino ? (t.termino === hoje() ? "hoje" : dia(t.termino)) : "—"}</small>
                    {quem === "todos" && r && <Avatar nome={r.nome} foto={r.foto_url} size={26} />}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {aberta && <TarefaPainel id={aberta} pessoas={equipe} onClose={() => setAberta(null)} onChange={carregar} />}
    </>
  );
}
