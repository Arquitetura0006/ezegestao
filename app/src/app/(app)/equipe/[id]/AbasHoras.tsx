"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp, usePode } from "../../ctx";
import { Vazio } from "../../ui";
import { atrasada, dia, horas, iso, moeda, nomeProjeto, segunda, somaDias } from "@/lib/gestor";
import { buscarTudo } from "@/lib/financeiro";
import type { TP } from "./comum";

type Ap = {
  id: string;
  data: string;
  minutos: number;
  nota: string | null;
  origem: string;
  valor_hora: number | null;
  projeto_id: string | null;
  projeto: { codigo: number | null; tipologia: string | null; nome: string } | null;
  tarefa: { titulo: string } | null;
};
const SEL_AP = "id,data,minutos,nota,origem,valor_hora,projeto_id,projeto:projetos(codigo,tipologia,nome),tarefa:tarefas(titulo)";

function useAps(pessoa: string, de: string, ate: string) {
  const { esc } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [aps, setAps] = useState<Ap[] | null>(null);
  useEffect(() => {
    setAps(null);
    buscarTudo<Ap>((a, b) =>
      supabase.from("apontamentos").select(SEL_AP).eq("escritorio_id", esc.id).eq("perfil_id", pessoa).gte("data", de).lte("data", ate).order("data").range(a, b),
    ).then(setAps).catch(() => setAps([]));
  }, [supabase, esc.id, pessoa, de, ate]);
  return aps;
}

const nomeAp = (a: Ap) => (a.projeto ? nomeProjeto(a.projeto) : "Sem projeto");

// ---------------- Métricas ----------------
type Periodo = "mes" | "tri" | "ano" | "12m";
export function Metricas({ pessoa, tarefas, horasSemana }: { pessoa: string; tarefas: TP[]; horasSemana: number }) {
  const sens = usePode("sensiveis");
  const [per, setPer] = useState<Periodo>("mes");
  const agora = new Date();
  const de = iso(
    per === "mes" ? new Date(agora.getFullYear(), agora.getMonth(), 1)
      : per === "tri" ? new Date(agora.getFullYear(), agora.getMonth() - 2, 1)
      : per === "ano" ? new Date(agora.getFullYear(), 0, 1)
      : new Date(agora.getFullYear(), agora.getMonth() - 11, 1),
  );
  const ate = iso(agora);
  const aps = useAps(pessoa, de, ate);
  // Últimas 12 semanas, para o gráfico
  const seg12 = somaDias(segunda(), -77);
  const aps12 = useAps(pessoa, iso(seg12), ate);

  const min = (aps ?? []).reduce((s, a) => s + a.minutos, 0);
  const custo = (aps ?? []).reduce((s, a) => s + (a.minutos / 60) * Number(a.valor_hora ?? 0), 0);
  const semanas = Math.max(1, (new Date(ate).getTime() - new Date(de).getTime()) / (7 * 864e5));
  const porSemana = min / 60 / semanas;
  const abertas = tarefas.filter((t) => t.status !== "concluida");
  const atrasadas = tarefas.filter((t) => atrasada(t));
  const concl = tarefas.filter((t) => t.status === "concluida" && (t.concluida_em ?? "").slice(0, 10) >= de);
  const comPrazo = concl.filter((t) => t.termino);
  const noPrazo = comPrazo.filter((t) => (t.concluida_em ?? "").slice(0, 10) <= (t.termino ?? ""));

  const porProj: Record<string, { nome: string; min: number; id: string | null }> = {};
  (aps ?? []).forEach((a) => {
    const k = a.projeto_id ?? "-";
    porProj[k] ??= { nome: nomeAp(a), min: 0, id: a.projeto_id };
    porProj[k].min += a.minutos;
  });
  const proj = Object.values(porProj).sort((a, b) => b.min - a.min);
  const maxP = proj[0]?.min || 1;

  const sem = Array.from({ length: 12 }, (_, i) => {
    const s = somaDias(seg12, i * 7);
    const a = iso(s);
    const b = iso(somaDias(s, 6));
    return { t: dia(a), min: (aps12 ?? []).filter((x) => x.data >= a && x.data <= b).reduce((t, x) => t + x.minutos, 0) };
  });
  const maxS = Math.max(horasSemana * 60, ...sem.map((s) => s.min), 1);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="barra-f" style={{ marginBottom: 0 }}>
        <div className="status-linha">
          {(["mes", "tri", "ano", "12m"] as const).map((k) => (
            <button key={k} type="button" className={per === k ? "on" : ""} onClick={() => setPer(k)}>
              {{ mes: "Este mês", tri: "Últimos 3 meses", ano: "Este ano", "12m": "12 meses" }[k]}
            </button>
          ))}
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><small>Horas no período</small><strong>{aps ? horas(min) : "…"}</strong><span>{proj.length} projetos</span></div>
        <div className="kpi"><small>Média por semana</small><strong>{aps ? `${porSemana.toFixed(1).replace(".", ",")} h` : "…"}</strong><span>de {horasSemana} h disponíveis</span></div>
        <div className="kpi"><small>Tarefas abertas</small><strong>{abertas.length}</strong><span>{atrasadas.length} atrasadas</span></div>
        <div className="kpi"><small>Concluídas no período</small><strong>{concl.length}</strong><span>{comPrazo.length ? `${Math.round((noPrazo.length / comPrazo.length) * 100)}% no prazo` : "sem prazo definido"}</span></div>
        {sens && <div className="kpi"><small>Custo das horas</small><strong>{aps ? moeda(custo) || "R$ 0" : "…"}</strong><span>horas × valor/hora</span></div>}
      </div>

      <section className="box">
        <h2 className="sec-t">Horas por semana</h2>
        <div className="barras" style={{ height: 150, position: "relative" }}>
          {sem.map((s) => (
            <div key={s.t} className="barra-c" title={`${horas(s.min)} h`}>
              <small className="valor-n" style={{ fontWeight: 400 }}>{s.min ? Math.round(s.min / 60) : ""}</small>
              <i style={{ height: `${(s.min / maxS) * 100}%` }} />
              <small>{s.t}</small>
            </div>
          ))}
        </div>
        <p className="note" style={{ margin: "8px 0 0" }}>Últimas 12 semanas, a partir da segunda-feira. Capacidade: {horasSemana} h por semana.</p>
      </section>

      <section className="box">
        <h2 className="sec-t">Horas por projeto</h2>
        {aps === null ? <p className="note">Carregando…</p> : proj.length === 0 ? <p className="note" style={{ margin: 0 }}>Nenhuma hora lançada no período.</p> : (
          <div>
            {proj.slice(0, 12).map((p) => (
              <div key={p.nome} className="hbar">
                <span>{p.id ? <Link href={`/projetos/${p.id}`} style={{ textDecoration: "none" }}>{p.nome}</Link> : p.nome}</span>
                <span><i style={{ width: `${(p.min / maxP) * 100}%` }} /></span>
                <b>{horas(p.min)}</b>
              </div>
            ))}
            {proj.length > 12 && <p className="note" style={{ margin: "6px 0 0" }}>+ {proj.length - 12} projetos</p>}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------- Timesheet ----------------
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export function Timesheet({ pessoa, horasSemana, souEu }: { pessoa: string; horasSemana: number; souEu: boolean }) {
  const [semana, setSemana] = useState(segunda());
  const de = iso(semana);
  const ate = iso(somaDias(semana, 6));
  const aps = useAps(pessoa, de, ate);
  const dias = DIAS.map((_, i) => iso(somaDias(semana, i)));
  const linhas: Record<string, { nome: string; id: string | null; d: number[] }> = {};
  (aps ?? []).forEach((a) => {
    const k = a.projeto_id ?? "-";
    linhas[k] ??= { nome: nomeAp(a), id: a.projeto_id, d: Array(7).fill(0) };
    linhas[k].d[dias.indexOf(a.data)] += a.minutos;
  });
  const ls = Object.values(linhas).sort((a, b) => a.nome.localeCompare(b.nome));
  const tot = dias.map((_, i) => ls.reduce((s, l) => s + l.d[i], 0));
  const totS = tot.reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="barra-f">
        <button className="btn small" type="button" onClick={() => setSemana(somaDias(semana, -7))} aria-label="Semana anterior">‹</button>
        <strong className="valor-n" style={{ minWidth: 150, textAlign: "center" }}>{dia(de)} – {dia(ate)}</strong>
        <button className="btn small" type="button" onClick={() => setSemana(somaDias(semana, 7))} aria-label="Próxima semana">›</button>
        <button className="btn small ghost" type="button" onClick={() => setSemana(segunda())}>Esta semana</button>
        <span className="dir">
          <span className="note"><b style={{ color: "var(--fg)" }}>{horas(totS)} h</b> de {horasSemana} h</span>
          {souEu && <Link className="btn small" href="/horas">Lançar horas</Link>}
        </span>
      </div>
      {aps === null ? <p className="note">Carregando…</p> : ls.length === 0 ? (
        <Vazio titulo="Nenhuma hora nesta semana" />
      ) : (
        <>
          <div className="tabela-w">
            <table className="tabela ts">
              <thead>
                <tr>
                  <th>Projeto</th>
                  {DIAS.map((d, i) => <th key={d} className="n">{d} {dia(dias[i])}</th>)}
                  <th className="n">Total</th>
                </tr>
              </thead>
              <tbody>
                {ls.map((l) => (
                  <tr key={l.nome}>
                    <td>{l.id ? <Link href={`/projetos/${l.id}`} style={{ textDecoration: "none" }}>{l.nome}</Link> : l.nome}</td>
                    {l.d.map((m, i) => <td key={i} className="n">{m ? horas(m) : <span className="note">·</span>}</td>)}
                    <td className="n" style={{ fontWeight: 600 }}>{horas(l.d.reduce((a, b) => a + b, 0))}</td>
                  </tr>
                ))}
                <tr className="tot">
                  <td>Total</td>
                  {tot.map((m, i) => <td key={i} className="n">{m ? horas(m) : "·"}</td>)}
                  <td className="n">{horas(totS)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <h2 className="sec-t" style={{ marginTop: 24 }}>Lançamentos</h2>
          <div className="tabela-w">
            <table className="tabela">
              <thead><tr><th>Data</th><th>Projeto</th><th>Tarefa</th><th>Nota</th><th>Origem</th><th style={{ textAlign: "right" }}>Horas</th></tr></thead>
              <tbody>
                {(aps ?? []).map((a) => (
                  <tr key={a.id}>
                    <td className="valor-n" style={{ fontWeight: 400 }}>{dia(a.data)}</td>
                    <td>{nomeAp(a)}</td>
                    <td>{a.tarefa?.titulo || <span className="note">—</span>}</td>
                    <td className="note">{a.nota || ""}</td>
                    <td className="note">{{ manual: "Manual", cronometro: "Cronômetro", agente: "EZE Horas", importado: "Desker" }[a.origem] ?? a.origem}</td>
                    <td className="valor-n" style={{ textAlign: "right" }}>{horas(a.minutos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
