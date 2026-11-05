"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../../ctx";
import { Vazio } from "../../ui";
import {
  ORDEM_STATUS, PRIORIDADE, STATUS_TAREFA, atrasada, dia, hoje, horas, iso, nomeProjeto,
  type StatusTarefa,
} from "@/lib/gestor";
import type { TP } from "./comum";

const nomeP = (t: TP) => (t.projeto ? nomeProjeto(t.projeto) : "");

export function StatusPill({ t }: { t: TP }) {
  if (t.status === "concluida") return <span className="st-pill cinza">Concluída</span>;
  if (atrasada(t)) return <span className="st-pill cheio">Atrasada</span>;
  if (t.status === "backlog") return <span className="st-pill trac">Backlog</span>;
  return <span className="st-pill">{STATUS_TAREFA[t.status]}</span>;
}

// ---------------- Lista ----------------
export function Lista({ tarefas, abrir }: { tarefas: TP[]; abrir: (id: string) => void }) {
  const [f, setF] = useState<"abertas" | "atrasadas" | "concluidas" | "todas">("abertas");
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  const l = tarefas
    .filter((t) => (f === "abertas" ? t.status !== "concluida" : f === "atrasadas" ? atrasada(t) : f === "concluidas" ? t.status === "concluida" : true))
    .filter((t) => !termo || `${t.titulo} ${nomeP(t)}`.toLowerCase().includes(termo))
    .sort((a, b) => (f === "concluidas" ? (b.concluida_em ?? "").localeCompare(a.concluida_em ?? "") : (a.termino ?? "9999").localeCompare(b.termino ?? "9999")));
  const n = {
    abertas: tarefas.filter((t) => t.status !== "concluida").length,
    atrasadas: tarefas.filter((t) => atrasada(t)).length,
    concluidas: tarefas.filter((t) => t.status === "concluida").length,
    todas: tarefas.length,
  };
  const mostrar = l.slice(0, 300);
  return (
    <>
      <div className="barra-f">
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tarefa ou projeto…" aria-label="Buscar" />
        <div className="status-linha">
          {(["abertas", "atrasadas", "concluidas", "todas"] as const).map((k) => (
            <button key={k} type="button" className={f === k ? "on" : ""} onClick={() => setF(k)}>
              {{ abertas: "Abertas", atrasadas: "Atrasadas", concluidas: "Concluídas", todas: "Todas" }[k]} {n[k]}
            </button>
          ))}
        </div>
      </div>
      {l.length === 0 ? (
        <Vazio titulo="Nenhuma tarefa aqui" />
      ) : (
        <div className="tabela-w">
          <table className="tabela">
            <thead>
              <tr>
                <th>Tarefa</th>
                <th>Projeto</th>
                <th>Etapa</th>
                <th>Status</th>
                <th>Prioridade</th>
                <th>Início</th>
                <th>Prazo</th>
                <th style={{ textAlign: "right" }}>Previsto</th>
              </tr>
            </thead>
            <tbody>
              {mostrar.map((t) => (
                <tr key={t.id} className="clicavel" onClick={() => abrir(t.id)}>
                  <td style={{ fontWeight: 500 }}>{t.titulo}</td>
                  <td>
                    <Link href={`/projetos/${t.projeto_id}`} onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none" }}>{nomeP(t)}</Link>
                  </td>
                  <td>{t.etapa?.sigla || t.etapa?.nome || <span className="note">—</span>}</td>
                  <td><StatusPill t={t} /></td>
                  <td>{t.prioridade === "alta" || t.prioridade === "urgente" ? <strong>{PRIORIDADE[t.prioridade]}</strong> : PRIORIDADE[t.prioridade]}</td>
                  <td className="valor-n" style={{ fontWeight: 400 }}>{dia(t.inicio) || "—"}</td>
                  <td className="valor-n" style={{ fontWeight: atrasada(t) ? 700 : 400 }}>{dia(t.termino) || "—"}</td>
                  <td className="valor-n" style={{ textAlign: "right", fontWeight: 400 }}>{t.horas_previstas ? `${Number(t.horas_previstas)} h` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {l.length > mostrar.length && <p className="note" style={{ marginTop: 8 }}>Mostrando 300 de {l.length}. Use a busca para encontrar as demais.</p>}
    </>
  );
}

// ---------------- Quadro ----------------
export function Quadro({ tarefas, abrir, podeMover, mover }: { tarefas: TP[]; abrir: (id: string) => void; podeMover: boolean; mover: (t: TP, s: StatusTarefa) => void }) {
  const limite = iso(new Date(Date.now() - 30 * 864e5));
  const l = tarefas.filter((t) => t.status !== "concluida" || (t.concluida_em ?? "") >= limite);
  return (
    <>
      <div className="quadro">
        {ORDEM_STATUS.map((s) => {
          const col = l.filter((t) => t.status === s).sort((a, b) => (a.termino ?? "9999").localeCompare(b.termino ?? "9999"));
          return (
            <div
              key={s}
              className="col"
              onDragOver={(e) => podeMover && e.preventDefault()}
              onDrop={(e) => {
                const t = l.find((x) => x.id === e.dataTransfer.getData("text/plain"));
                if (t && t.status !== s) mover(t, s);
              }}
            >
              <p className="col-t">{STATUS_TAREFA[s]} <small>{col.length}</small></p>
              {col.slice(0, 60).map((t) => (
                <button key={t.id} type="button" className="cartao" draggable={podeMover} onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)} onClick={() => abrir(t.id)}>
                  <strong>{t.titulo}</strong>
                  <small className="note">{nomeP(t)}</small>
                  {t.termino && <small className={atrasada(t) ? "atras" : "note"}>Prazo {dia(t.termino)}</small>}
                </button>
              ))}
              {col.length > 60 && <p className="note" style={{ margin: "0 6px" }}>+ {col.length - 60}</p>}
            </div>
          );
        })}
      </div>
      <p className="note" style={{ marginTop: 8 }}>Concluídas dos últimos 30 dias. {podeMover ? "Arraste o cartão para mudar o status." : ""}</p>
    </>
  );
}

// ---------------- Calendário ----------------
export function Calendario({ pessoa, tarefas, abrir }: { pessoa: string; tarefas: TP[]; abrir: (id: string) => void }) {
  const { esc } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [hrs, setHrs] = useState<Record<string, number>>({});
  const ini = new Date(mes);
  ini.setDate(1 - ((mes.getDay() + 6) % 7));
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(ini);
    d.setDate(ini.getDate() + i);
    return d;
  });
  const de = iso(dias[0]);
  const ate = iso(dias[41]);

  useEffect(() => {
    supabase.from("apontamentos").select("data,minutos").eq("escritorio_id", esc.id).eq("perfil_id", pessoa).gte("data", de).lte("data", ate).limit(2000)
      .then(({ data }) => {
        const m: Record<string, number> = {};
        ((data ?? []) as { data: string; minutos: number }[]).forEach((a) => (m[a.data] = (m[a.data] ?? 0) + a.minutos));
        setHrs(m);
      });
  }, [supabase, esc.id, pessoa, de, ate]);

  const porDia: Record<string, TP[]> = {};
  tarefas.forEach((t) => {
    if (t.termino && t.termino >= de && t.termino <= ate) (porDia[t.termino] ??= []).push(t);
  });
  const hj = hoje();
  const mudar = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1));
  return (
    <>
      <div className="barra-f">
        <button className="btn small" type="button" onClick={() => mudar(-1)} aria-label="Mês anterior">‹</button>
        <strong style={{ minWidth: 150, textAlign: "center" }}>{(() => { const t = mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return t[0].toUpperCase() + t.slice(1); })()}</strong>
        <button className="btn small" type="button" onClick={() => mudar(1)} aria-label="Próximo mês">›</button>
        <button className="btn small ghost" type="button" onClick={() => setMes(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Hoje</button>
        <span className="dir note">Tarefas no dia do prazo · horas lançadas no dia</span>
      </div>
      <div className="cal">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => <div key={d} className="cal-h">{d}</div>)}
        {dias.map((d) => {
          const k = iso(d);
          const ts = porDia[k] ?? [];
          return (
            <div key={k} className={`${d.getMonth() !== mes.getMonth() ? "fora" : ""}${k === hj ? " hj" : ""}`}>
              <span className="cal-d">{d.getDate()}</span>
              {ts.slice(0, 4).map((t) => (
                <button key={t.id} type="button" className={`cal-t${t.status === "concluida" ? " ok" : atrasada(t) ? " atr" : ""}`} onClick={() => abrir(t.id)} title={`${t.titulo} · ${nomeP(t)}`}>
                  {t.titulo}
                </button>
              ))}
              {ts.length > 4 && <small className="note">+ {ts.length - 4}</small>}
              {hrs[k] ? <span className="cal-hr">{horas(hrs[k])} h</span> : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------- Timeline ----------------
export function Timeline({ tarefas, abrir }: { tarefas: TP[]; abrir: (id: string) => void }) {
  const [concl, setConcl] = useState(false);
  const l = tarefas.filter((t) => (t.inicio || t.termino) && (concl || t.status !== "concluida"));
  if (!l.length) return <Vazio titulo="Sem tarefas com datas" texto="Defina início e prazo nas tarefas para ver a linha do tempo." />;
  const datas = l.flatMap((t) => [t.inicio, t.termino]).filter(Boolean) as string[];
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
    meses.push({ t: a.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), l: pos(iso(a)), w: (((b.getTime() - a.getTime()) / 864e5 + 1) / total) * 100 });
    m.setMonth(m.getMonth() + 1);
  }
  const hojeP = pos(hoje());
  const barra = (a: string | null, b: string | null) => {
    const x = a || b!;
    const y = b || a!;
    return { left: `${pos(x)}%`, width: `${Math.max(pos(y) - pos(x) + 100 / total, 0.6)}%` };
  };
  const projetos = [...new Set(l.map((t) => t.projeto_id))];
  return (
    <>
      <div className="barra-f">
        <label className="row note" style={{ gap: 6 }}><input type="checkbox" checked={concl} onChange={(e) => setConcl(e.target.checked)} /> Mostrar concluídas</label>
      </div>
      <div className="gantt">
        <div className="gantt-l gantt-cab"><span /><div className="gantt-trilho">{meses.map((x) => <span key={x.t} className="gantt-mes" style={{ left: `${x.l}%`, width: `${x.w}%` }}>{x.t}</span>)}</div></div>
        {projetos.map((pid) => {
          const ts = l.filter((t) => t.projeto_id === pid).sort((a, b) => (a.inicio || a.termino || "").localeCompare(b.inicio || b.termino || ""));
          const ds = ts.flatMap((t) => [t.inicio, t.termino]).filter(Boolean) as string[];
          return (
            <div key={pid}>
              <div className="gantt-l etapa">
                <strong>{nomeP(ts[0])}</strong>
                <div className="gantt-trilho">
                  {hojeP >= 0 && hojeP <= 100 && <i className="gantt-hoje" style={{ left: `${hojeP}%` }} />}
                  <b className="gantt-b etapa" style={barra(ds.reduce((a, b) => (a < b ? a : b)), ds.reduce((a, b) => (a > b ? a : b)))} />
                </div>
              </div>
              {ts.map((t) => (
                <div key={t.id} className="gantt-l">
                  <button type="button" className="linkbtn" style={{ textDecoration: "none" }} onClick={() => abrir(t.id)}>{t.titulo}</button>
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
    </>
  );
}
