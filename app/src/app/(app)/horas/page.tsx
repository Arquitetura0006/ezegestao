"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp, usePode } from "../ctx";
import { Cabeca, Vazio } from "../ui";
import { erroMsg } from "@/lib/util";
import { dia, hoje, horas, iso, moeda, nomeProjeto, segunda, somaDias } from "@/lib/gestor";
import { EVENTO, cronAtual, iniciar } from "@/lib/cronometro";

type Proj = { id: string; codigo: number | null; tipologia: string | null; nome: string; valor: number | null };
type Tf = { id: string; titulo: string; projeto_id: string };
type Ap = { id: string; data: string; minutos: number; nota: string | null; projeto_id: string | null; tarefa_id: string | null; origem: string; tarefa: { titulo: string } | null };
type Res = { projeto_id: string | null; perfil_id: string | null; pessoa: string | null; minutos: number; custo: number | null };
type Aba = "minhas" | "equipe" | "projetos";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export default function Horas() {
  const { esc } = useApp();
  const admin = usePode("horas");
  const [aba, setAba] = useState<Aba>("minhas");
  return (
    <>
      <Cabeca kicker={esc.nome} titulo="Horas" />
      {admin && (
        <div className="tabs" role="tablist" style={{ marginBottom: 20 }}>
          <button type="button" className={aba === "minhas" ? "on" : ""} onClick={() => setAba("minhas")}>Minhas horas</button>
          <button type="button" className={aba === "equipe" ? "on" : ""} onClick={() => setAba("equipe")}>Equipe</button>
          <button type="button" className={aba === "projetos" ? "on" : ""} onClick={() => setAba("projetos")}>Custo por projeto</button>
        </div>
      )}
      {aba === "minhas" && <Minhas />}
      {aba === "equipe" && <Periodo modo="pessoa" />}
      {aba === "projetos" && <Periodo modo="projeto" />}
    </>
  );
}

function Minhas() {
  const { eu, esc } = useApp();
  const admin = usePode("projetos");
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [projetos, setProjetos] = useState<Proj[]>([]);
  const [tarefas, setTarefas] = useState<Tf[]>([]);
  const [semana, setSemana] = useState(segunda());
  const [aps, setAps] = useState<Ap[] | null>(null);
  const [f, setF] = useState({ projeto: "", tarefa: "", data: hoje(), h: "", nota: "" });
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    // Admin vê todos os projetos ativos; Partner, os seus (RLS)
    supabase.from("projetos").select("id,codigo,tipologia,nome,valor").eq("escritorio_id", esc.id).eq("ativo", true).neq("status", "finalizado").order("codigo", { ascending: false })
      .then(({ data }) => setProjetos((data as Proj[]) ?? []));
  }, [supabase, esc.id, admin]);

  useEffect(() => {
    if (!f.projeto) return setTarefas([]);
    supabase.from("tarefas").select("id,titulo,projeto_id").eq("projeto_id", f.projeto).neq("status", "concluida").order("ordem")
      .then(({ data }) => setTarefas((data as Tf[]) ?? []));
  }, [supabase, f.projeto]);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("apontamentos").select("id,data,minutos,nota,projeto_id,tarefa_id,origem,tarefa:tarefas(titulo)")
      .eq("perfil_id", eu.id).gte("data", iso(semana)).lte("data", iso(somaDias(semana, 6))).order("data").order("created_at");
    setAps((data as unknown as Ap[]) ?? []);
  }, [supabase, eu.id, semana]);

  useEffect(() => {
    carregar();
    const ver = () => { cronAtual(supabase, eu.id).then((c) => setRodando(!!c)); carregar(); };
    ver();
    window.addEventListener(EVENTO, ver);
    return () => window.removeEventListener(EVENTO, ver);
  }, [carregar, supabase, eu.id]);

  async function comecar() {
    setErro("");
    if (!f.projeto) return setErro("Escolha o projeto.");
    const e = await iniciar(supabase, esc.id, { projeto_id: f.projeto, tarefa_id: f.tarefa || null, nota: f.nota.trim() || null });
    if (e) setErro(erroMsg(e));
  }

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!f.projeto) return setErro("Escolha o projeto.");
    const min = Math.round(parseFloat(f.h.replace(",", ".")) * 60);
    if (!min || min <= 0 || min > 1440) return setErro("Informe as horas (ex.: 2,5).");
    const { error } = await supabase.from("apontamentos").insert({
      escritorio_id: esc.id, perfil_id: eu.id, projeto_id: f.projeto, tarefa_id: f.tarefa || null, data: f.data, minutos: min, nota: f.nota.trim() || null,
    });
    if (error) return setErro(erroMsg(error));
    setF({ ...f, h: "", nota: "" });
    carregar();
  }

  async function apagar(a: Ap) {
    await supabase.from("apontamentos").delete().eq("id", a.id);
    carregar();
  }

  const nomeP = (id: string | null) => {
    const p = projetos.find((x) => x.id === id);
    return p ? nomeProjeto(p) : "Projeto";
  };
  const dias = DIAS.map((_, i) => iso(somaDias(semana, i)));
  const porProj = [...new Set((aps ?? []).map((a) => a.projeto_id))];
  const soma = (p: string | null, d?: string) => (aps ?? []).filter((a) => a.projeto_id === p && (!d || a.data === d)).reduce((s, a) => s + a.minutos, 0);
  const total = (aps ?? []).reduce((s, a) => s + a.minutos, 0);

  return (
    <>
      <form className="box stack" style={{ marginBottom: 22 }} onSubmit={lancar}>
        <div className="grid2" style={{ gap: 12 }}>
          <label className="form-l"><span>Projeto</span>
            <select className="f" value={f.projeto} onChange={(e) => setF({ ...f, projeto: e.target.value, tarefa: "" })}>
              <option value="">Escolha</option>
              {projetos.map((p) => <option key={p.id} value={p.id}>{nomeProjeto(p)}</option>)}
            </select>
          </label>
          <label className="form-l"><span>Tarefa (opcional)</span>
            <select className="f" value={f.tarefa} onChange={(e) => setF({ ...f, tarefa: e.target.value })} disabled={!f.projeto}>
              <option value="">Sem tarefa</option>
              {tarefas.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
            </select>
          </label>
        </div>
        <label className="form-l"><span>O que está fazendo (opcional)</span><input type="text" value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} maxLength={200} /></label>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <button className="btn dark" type="button" onClick={comecar} disabled={!f.projeto}>{rodando ? "Trocar cronômetro para este" : "Iniciar cronômetro"}</button>
          <span className="note" style={{ margin: "0 6px 12px" }}>ou lance à mão</span>
          <label className="form-l"><span>Data</span><input type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} style={{ width: 160 }} /></label>
          <label className="form-l"><span>Horas</span><input type="text" inputMode="decimal" value={f.h} onChange={(e) => setF({ ...f, h: e.target.value })} placeholder="2,5" style={{ width: 90 }} /></label>
          <button className="btn" type="submit">Lançar</button>
        </div>
        {erro && <p className="err" role="alert">{erro}</p>}
      </form>

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div className="row">
          <button className="btn small" type="button" onClick={() => setSemana(somaDias(semana, -7))} aria-label="Semana anterior">←</button>
          <strong>Semana de {dia(dias[0])} a {dia(dias[6])}</strong>
          <button className="btn small" type="button" onClick={() => setSemana(somaDias(semana, 7))} aria-label="Próxima semana">→</button>
          <button className="btn small ghost" type="button" onClick={() => setSemana(segunda())}>Hoje</button>
        </div>
        <strong>{horas(total)} na semana</strong>
      </div>

      {aps === null ? <p className="note">Carregando…</p> : aps.length === 0 ? (
        <Vazio titulo="Nenhuma hora nesta semana" texto="Use o cronômetro ou lance as horas à mão." />
      ) : (
        <>
          <div className="tabela-w" style={{ marginBottom: 18 }}>
            <table className="tabela">
              <thead><tr><th>Projeto</th>{DIAS.map((d, i) => <th key={d} style={{ textAlign: "right" }}>{d} {dia(dias[i])}</th>)}<th style={{ textAlign: "right" }}>Total</th></tr></thead>
              <tbody>
                {porProj.map((p) => (
                  <tr key={p ?? "x"}>
                    <td>{p ? <Link href={`/projetos/${p}`}>{nomeP(p)}</Link> : "Sem projeto"}</td>
                    {dias.map((d) => <td key={d} style={{ textAlign: "right" }}>{soma(p, d) ? horas(soma(p, d)) : <span className="note">—</span>}</td>)}
                    <td style={{ textAlign: "right" }}><strong>{horas(soma(p))}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lista">
            {[...aps].reverse().map((a) => (
              <div key={a.id} className="item" style={{ padding: "10px 16px" }}>
                <span className="item-t">
                  <strong style={{ fontSize: 14 }}>{horas(a.minutos)} · {dia(a.data)} · {nomeP(a.projeto_id)}</strong>
                  <small>{[a.tarefa?.titulo, a.nota, a.origem === "cronometro" ? "cronômetro" : null].filter(Boolean).join(" · ") || "—"}</small>
                </span>
                <button className="linkbtn" type="button" onClick={() => apagar(a)} aria-label="Apagar lançamento">×</button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// Visão do administrador: horas e custo por pessoa ou por projeto num período
function Periodo({ modo }: { modo: "pessoa" | "projeto" }) {
  const { esc } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const mesAtual = hoje().slice(0, 7);
  const [mes, setMes] = useState(mesAtual);
  const [tudo, setTudo] = useState(false);
  const [res, setRes] = useState<Res[] | null>(null);
  const [projetos, setProjetos] = useState<Record<string, Proj>>({});
  const [erro, setErro] = useState("");

  useEffect(() => {
    supabase.from("projetos").select("id,codigo,tipologia,nome,valor").eq("escritorio_id", esc.id)
      .then(({ data }) => setProjetos(Object.fromEntries(((data as Proj[]) ?? []).map((p) => [p.id, p]))));
  }, [supabase, esc.id]);

  useEffect(() => {
    setRes(null);
    const [a, m] = mes.split("-").map(Number);
    const de = tudo ? "2000-01-01" : `${mes}-01`;
    const ate = tudo ? "2100-01-01" : iso(new Date(a, m, 0));
    supabase.rpc("horas_periodo", { esc: esc.id, de, ate }).then(({ data, error }) => {
      if (error) setErro(erroMsg(error));
      setRes((data as Res[]) ?? []);
    });
  }, [supabase, esc.id, mes, tudo]);

  const grupos = useMemo(() => {
    const g: Record<string, { nome: string; min: number; custo: number; itens: Res[]; valor?: number | null; id?: string | null }> = {};
    (res ?? []).forEach((r) => {
      const k = modo === "pessoa" ? r.pessoa ?? "—" : r.projeto_id ?? "—";
      const p = r.projeto_id ? projetos[r.projeto_id] : null;
      const nome = modo === "pessoa" ? r.pessoa ?? "—" : p ? nomeProjeto(p) : "Sem projeto";
      g[k] = g[k] ?? { nome, min: 0, custo: 0, itens: [], valor: p?.valor, id: r.projeto_id };
      g[k].min += Number(r.minutos);
      g[k].custo += Number(r.custo ?? 0);
      g[k].itens.push(r);
    });
    return Object.values(g).sort((a, b) => b.min - a.min);
  }, [res, modo, projetos]);

  const tMin = grupos.reduce((s, x) => s + x.min, 0);
  const tCusto = grupos.reduce((s, x) => s + x.custo, 0);

  function exportar() {
    const linhas = [["Projeto", "Pessoa", "Horas", "Custo"]].concat(
      (res ?? []).map((r) => [r.projeto_id && projetos[r.projeto_id] ? nomeProjeto(projetos[r.projeto_id]) : "Sem projeto", r.pessoa ?? "", (Number(r.minutos) / 60).toFixed(2).replace(".", ","), Number(r.custo ?? 0).toFixed(2).replace(".", ",")]),
    );
    const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `horas-${tudo ? "total" : mes}.csv`;
    a.click();
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <div className="row">
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} disabled={tudo} aria-label="Mês" style={{ width: 170 }} className="f" />
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={tudo} onChange={(e) => setTudo(e.target.checked)} /> Todo o período</label>
        </div>
        <div className="row">
          <strong>{horas(tMin)} · {moeda(tCusto)}</strong>
          <button className="btn small" type="button" onClick={exportar} disabled={!res?.length}>Exportar para Excel</button>
        </div>
      </div>
      {erro && <p className="err" role="alert">{erro}</p>}
      {res === null ? <p className="note">Carregando…</p> : grupos.length === 0 ? <Vazio titulo="Nenhuma hora no período" /> : (
        <div className="tabela-w">
          <table className="tabela">
            <thead>
              <tr>
                <th>{modo === "pessoa" ? "Pessoa" : "Projeto"}</th>
                <th style={{ textAlign: "right" }}>Horas</th>
                <th style={{ textAlign: "right" }}>Custo</th>
                {modo === "projeto" && <th style={{ textAlign: "right" }}>Contrato</th>}
                {modo === "projeto" && tudo && <th style={{ textAlign: "right" }}>Custo / contrato</th>}
                <th>{modo === "pessoa" ? "Principais projetos" : "Quem trabalhou"}</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.nome + (g.id ?? "")}>
                  <td>{modo === "projeto" && g.id ? <Link href={`/projetos/${g.id}`}>{g.nome}</Link> : g.nome}</td>
                  <td style={{ textAlign: "right" }}>{horas(g.min)}</td>
                  <td style={{ textAlign: "right" }}>{g.custo ? moeda(g.custo) : <span className="note">—</span>}</td>
                  {modo === "projeto" && <td style={{ textAlign: "right" }}>{g.valor ? moeda(g.valor) : <span className="note">—</span>}</td>}
                  {modo === "projeto" && tudo && <td style={{ textAlign: "right" }}>{g.valor && g.custo ? <strong>{Math.round((g.custo / g.valor) * 100)}%</strong> : <span className="note">—</span>}</td>}
                  <td><small className="note">
                    {g.itens.sort((a, b) => Number(b.minutos) - Number(a.minutos)).slice(0, 3)
                      .map((i) => `${modo === "pessoa" ? (i.projeto_id && projetos[i.projeto_id] ? nomeProjeto(projetos[i.projeto_id]) : "Sem projeto") : i.pessoa ?? "—"} ${horas(Number(i.minutos))}`).join(" · ")}
                  </small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="note" style={{ marginTop: 10 }}>Custo = horas × valor/hora da pessoa na data do lançamento. Cadastre o valor/hora em Cadastros › Equipe.</p>
    </>
  );
}
