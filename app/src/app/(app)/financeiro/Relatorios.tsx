"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { Vazio } from "../ui";
import { erroMsg } from "@/lib/util";
import { hoje, nomeProjeto } from "@/lib/gestor";
import { LINHA_DRE, TIPO_FORN, baixarCSV, brl, fimMes, type Base } from "@/lib/financeiro";

type R = { mes: string; tipo: "receita" | "despesa"; categoria_id: string | null; projeto_id: string | null; caixa_id: string | null; fornecedor_id: string | null; total: number; qtd: number };
type Rel = "fluxo" | "dre" | "projetos" | "categorias" | "fornecedores";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default function Relatorios({ base }: { base: Base }) {
  const { esc } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [rel, setRel] = useState<Rel>("fluxo");
  const [ano, setAno] = useState(Number(hoje().slice(0, 4)));
  const [mes, setMes] = useState<string>("");            // "" = ano inteiro
  const [regime, setRegime] = useState<"caixa" | "competencia">("caixa");
  const [dados, setDados] = useState<R[] | null>(null);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [erro, setErro] = useState("");

  const de = mes ? `${ano}-${mes}-01` : `${ano}-01-01`;
  const ate = mes ? fimMes(`${ano}-${mes}`) : `${ano}-12-31`;

  useEffect(() => {
    setDados(null);
    supabase.rpc("fin_resumo", { esc: esc.id, de, ate, por_pagamento: regime === "caixa" }).then(({ data, error }) => {
      if (error) setErro(erroMsg(error));
      setDados(((data ?? []) as R[]).map((r) => ({ ...r, total: Number(r.total) })));
    });
  }, [supabase, esc.id, de, ate, regime]);

  const cat = useMemo(() => Object.fromEntries(base.categorias.map((c) => [c.id, c])), [base]);
  const proj = useMemo(() => Object.fromEntries(base.projetos.map((p) => [p.id, p])), [base]);
  const cx = useMemo(() => Object.fromEntries(base.caixas.map((c) => [c.id, c.nome])), [base]);
  const forn = useMemo(() => Object.fromEntries(base.fornecedores.map((f) => [f.id, f])), [base]);
  const soma = (xs: R[]) => xs.reduce((s, r) => s + r.total, 0);
  const d = dados ?? [];
  const periodo = mes ? `${MESES[Number(mes) - 1]}/${ano}` : String(ano);

  const filtros = (
    <div className="row" style={{ marginBottom: 16 }}>
      <select className="f" style={{ width: "auto" }} value={ano} onChange={(e) => setAno(Number(e.target.value))} aria-label="Ano">
        {Array.from({ length: 6 }, (_, i) => Number(hoje().slice(0, 4)) + 1 - i).map((a) => <option key={a}>{a}</option>)}
      </select>
      <select className="f" style={{ width: "auto" }} value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
        <option value="">Ano inteiro</option>
        {MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
      </select>
      <div className="tabs" role="tablist">
        <button type="button" className={regime === "caixa" ? "on" : ""} onClick={() => setRegime("caixa")} title="Pelo dia em que o dinheiro entrou ou saiu">Realizado</button>
        <button type="button" className={regime === "competencia" ? "on" : ""} onClick={() => setRegime("competencia")} title="Pelo vencimento, pago ou não">Previsto</button>
      </div>
    </div>
  );

  // ---------- Fluxo mensal ----------
  const fluxo = () => {
    const linhas = Array.from({ length: 12 }, (_, i) => {
      const m = `${ano}-${String(i + 1).padStart(2, "0")}`;
      const r = soma(d.filter((x) => x.mes === m && x.tipo === "receita"));
      const p = soma(d.filter((x) => x.mes === m && x.tipo === "despesa"));
      return { m: MESES[i], r, p, res: r - p };
    });
    const max = Math.max(1, ...linhas.flatMap((l) => [l.r, l.p]));
    let acum = 0;
    return (
      <>
        <div className="fluxo">
          {linhas.map((l) => (
            <div key={l.m} className="fluxo-c" title={`${l.m}: entradas ${brl(l.r)} · saídas ${brl(l.p)}`}>
              <div className="fluxo-b"><i className="ent" style={{ height: `${(l.r / max) * 100}%` }} /><i className="sai" style={{ height: `${(l.p / max) * 100}%` }} /></div>
              <small>{l.m}</small>
            </div>
          ))}
        </div>
        <p className="note" style={{ margin: "6px 0 14px" }}>Barra preta: entradas. Barra cinza: saídas.</p>
        <div className="tabela-w">
          <table className="tabela">
            <thead><tr><th>Mês</th><th style={{ textAlign: "right" }}>Entradas</th><th style={{ textAlign: "right" }}>Saídas</th><th style={{ textAlign: "right" }}>Resultado</th><th style={{ textAlign: "right" }}>Acumulado</th></tr></thead>
            <tbody>
              {linhas.map((l) => { acum += l.res; return (
                <tr key={l.m}><td>{l.m}</td><td style={{ textAlign: "right" }}>{brl(l.r)}</td><td style={{ textAlign: "right" }}>{brl(l.p)}</td><td style={{ textAlign: "right" }}><strong>{brl(l.res)}</strong></td><td style={{ textAlign: "right" }}>{brl(acum)}</td></tr>
              ); })}
            </tbody>
          </table>
        </div>
        <button className="btn small" type="button" style={{ marginTop: 10 }} onClick={() => { let a = 0; baixarCSV(`fluxo-${ano}.csv`, [["Mês", "Entradas", "Saídas", "Resultado", "Acumulado"], ...linhas.map((l) => { a += l.res; return [l.m, l.r, l.p, l.res, a]; })]); }}>Exportar</button>
      </>
    );
  };

  // ---------- DRE ----------
  const dre = () => {
    const linha = (k: string) => d.filter((r) => (r.categoria_id ? cat[r.categoria_id]?.dre : r.tipo === "receita" ? "receita" : "administrativa") === k);
    const val = (k: string) => { const xs = linha(k); return soma(xs.filter((r) => r.tipo === "receita")) - soma(xs.filter((r) => r.tipo === "despesa")); };
    const bruta = val("receita");
    const liquida = bruta + val("deducao");
    const margem = liquida + val("custo");
    const operacional = margem + val("pessoal") + val("administrativa") + val("comercial");
    const antes = operacional + val("financeira");
    const final = antes + val("nao_operacional");
    const sub = (k: string) => {
      const g: Record<string, number> = {};
      linha(k).forEach((r) => { const n = r.categoria_id ? cat[r.categoria_id]?.nome ?? "—" : "Sem categoria"; g[n] = (g[n] ?? 0) + (r.tipo === "receita" ? r.total : -r.total); });
      return Object.entries(g).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    };
    const pct = (v: number) => (bruta ? `${Math.round((v / bruta) * 1000) / 10}%` : "");
    const L = ({ k, t }: { k: string; t: string }) => (
      <>
        <tr className="clicavel" onClick={() => setAbertos({ ...abertos, [k]: !abertos[k] })}><td>{abertos[k] ? "− " : "+ "}{t}</td><td style={{ textAlign: "right" }}>{brl(val(k))}</td><td style={{ textAlign: "right" }}><small className="note">{pct(val(k))}</small></td></tr>
        {abertos[k] && sub(k).map(([n, v]) => <tr key={n}><td style={{ paddingLeft: 34 }}><small>{n}</small></td><td style={{ textAlign: "right" }}><small>{brl(v)}</small></td><td /></tr>)}
      </>
    );
    const T = ({ t, v }: { t: string; v: number }) => <tr className="dre-t"><td><strong>{t}</strong></td><td style={{ textAlign: "right" }}><strong>{brl(v)}</strong></td><td style={{ textAlign: "right" }}><small>{pct(v)}</small></td></tr>;
    return (
      <>
        <div className="tabela-w" style={{ maxWidth: 760 }}>
          <table className="tabela">
            <tbody>
              <L k="receita" t={LINHA_DRE[0][1]} />
              <L k="deducao" t={LINHA_DRE[1][1]} />
              <T t="Receita líquida" v={liquida} />
              <L k="custo" t={LINHA_DRE[2][1]} />
              <T t="Margem dos projetos" v={margem} />
              <L k="pessoal" t={LINHA_DRE[3][1]} />
              <L k="administrativa" t={LINHA_DRE[4][1]} />
              <L k="comercial" t={LINHA_DRE[5][1]} />
              <T t="Resultado operacional" v={operacional} />
              <L k="financeira" t={LINHA_DRE[6][1]} />
              <T t="Resultado antes dos não operacionais" v={antes} />
              <L k="nao_operacional" t={LINHA_DRE[7][1]} />
              <T t="Resultado final do período" v={final} />
            </tbody>
          </table>
        </div>
        <p className="note">{regime === "caixa" ? "Regime de caixa: pelo dia do pagamento." : "Por vencimento: inclui o que ainda não foi pago."} Clique numa linha para abrir as categorias.</p>
        <button className="btn small" type="button" onClick={() => baixarCSV(`dre-${periodo}.csv`, [["Linha", "Categoria", "Valor"], ...LINHA_DRE.flatMap(([k, t]) => [[t, "", val(k)], ...sub(k).map(([n, v]) => ["", n, v])])])}>Exportar</button>
      </>
    );
  };

  // ---------- Recebimentos por projeto ----------
  const projetos = () => {
    const g: Record<string, { total: number; caixas: Record<string, number> }> = {};
    d.filter((r) => r.tipo === "receita").forEach((r) => {
      const k = r.projeto_id ?? "—";
      g[k] = g[k] ?? { total: 0, caixas: {} };
      g[k].total += r.total;
      const c = r.caixa_id ? cx[r.caixa_id] ?? "—" : "Sem caixa";
      g[k].caixas[c] = (g[k].caixas[c] ?? 0) + r.total;
    });
    const linhas = Object.entries(g).sort((a, b) => b[1].total - a[1].total);
    if (!linhas.length) return <Vazio titulo="Nenhum recebimento no período" />;
    return (
      <>
        <div className="tabela-w">
          <table className="tabela">
            <thead><tr><th>Projeto</th><th style={{ textAlign: "right" }}>Recebido</th><th>Por caixa</th><th style={{ textAlign: "right" }}>Contrato</th></tr></thead>
            <tbody>
              {linhas.map(([k, v]) => {
                const p = proj[k];
                return (
                  <tr key={k}>
                    <td>{p ? <Link href={`/projetos/${k}`}>{nomeProjeto(p)}</Link> : "Sem projeto"}</td>
                    <td style={{ textAlign: "right" }}><strong>{brl(v.total)}</strong></td>
                    <td><small className="note">{Object.entries(v.caixas).map(([c, x]) => `${c} ${brl(x)}`).join(" · ")}</small></td>
                    <td style={{ textAlign: "right" }}><small>{p?.valor ? brl(p.valor) : "—"}</small></td>
                  </tr>
                );
              })}
              <tr className="dre-t"><td><strong>Total</strong></td><td style={{ textAlign: "right" }}><strong>{brl(linhas.reduce((s, [, v]) => s + v.total, 0))}</strong></td><td /><td /></tr>
            </tbody>
          </table>
        </div>
        <button className="btn small" type="button" style={{ marginTop: 10 }} onClick={() => baixarCSV(`recebimentos-por-projeto-${periodo}.csv`, [["Projeto", "Caixa", "Valor"], ...linhas.flatMap(([k, v]) => Object.entries(v.caixas).map(([c, x]) => [proj[k] ? nomeProjeto(proj[k]) : "Sem projeto", c, x]))])}>Exportar</button>
      </>
    );
  };

  // ---------- Despesas por categoria ----------
  const categorias = () => {
    const g: Record<string, Record<string, number>> = {};
    d.filter((r) => r.tipo === "despesa").forEach((r) => {
      const c = r.categoria_id ? cat[r.categoria_id] : null;
      const grp = c?.grupo ?? "Sem categoria", n = c?.nome ?? "Sem categoria";
      g[grp] = g[grp] ?? {};
      g[grp][n] = (g[grp][n] ?? 0) + r.total;
    });
    const tot = soma(d.filter((r) => r.tipo === "despesa"));
    const grupos = Object.entries(g).map(([k, v]) => [k, v, Object.values(v).reduce((s, x) => s + x, 0)] as const).sort((a, b) => b[2] - a[2]);
    if (!grupos.length) return <Vazio titulo="Nenhuma despesa no período" />;
    return (
      <>
        <div className="tabela-w" style={{ maxWidth: 760 }}>
          <table className="tabela">
            <tbody>
              {grupos.map(([grp, v, t]) => (
                <Fragment key={grp}>
                  <tr className="dre-t"><td><strong>{grp}</strong></td><td style={{ textAlign: "right" }}><strong>{brl(t)}</strong></td><td style={{ textAlign: "right", width: 70 }}><small>{tot ? Math.round((t / tot) * 100) : 0}%</small></td></tr>
                  {Object.entries(v).sort((a, b) => b[1] - a[1]).map(([n, x]) => <tr key={grp + n}><td style={{ paddingLeft: 30 }}>{n}</td><td style={{ textAlign: "right" }}>{brl(x)}</td><td /></tr>)}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn small" type="button" style={{ marginTop: 10 }} onClick={() => baixarCSV(`despesas-${periodo}.csv`, [["Grupo", "Categoria", "Valor"], ...grupos.flatMap(([grp, v]) => Object.entries(v).map(([n, x]) => [grp, n, x]))])}>Exportar</button>
      </>
    );
  };

  // ---------- Pagamentos a fornecedores e Partners ----------
  const fornecedores = () => {
    const g: Record<string, { total: number; qtd: number }> = {};
    d.filter((r) => r.tipo === "despesa" && r.fornecedor_id).forEach((r) => {
      const k = r.fornecedor_id as string;
      g[k] = g[k] ?? { total: 0, qtd: 0 };
      g[k].total += r.total;
      g[k].qtd += Number(r.qtd);
    });
    const linhas = Object.entries(g).sort((a, b) => (forn[a[0]]?.tipo === "partner" ? 0 : 1) - (forn[b[0]]?.tipo === "partner" ? 0 : 1) || b[1].total - a[1].total);
    if (!linhas.length) return <Vazio titulo="Nenhum pagamento a fornecedor no período" />;
    return (
      <>
        <div className="tabela-w" style={{ maxWidth: 760 }}>
          <table className="tabela">
            <thead><tr><th>Nome</th><th>Tipo</th><th style={{ textAlign: "right" }}>Lançamentos</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
            <tbody>
              {linhas.map(([k, v]) => (
                <tr key={k}><td>{forn[k]?.nome ?? "—"}</td><td><small>{TIPO_FORN[forn[k]?.tipo ?? "outro"]}</small></td><td style={{ textAlign: "right" }}>{v.qtd}</td><td style={{ textAlign: "right" }}><strong>{brl(v.total)}</strong></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn small" type="button" style={{ marginTop: 10 }} onClick={() => baixarCSV(`pagamentos-fornecedores-${periodo}.csv`, [["Nome", "Tipo", "Lançamentos", "Total"], ...linhas.map(([k, v]) => [forn[k]?.nome ?? "", TIPO_FORN[forn[k]?.tipo ?? "outro"], v.qtd, v.total])])}>Exportar</button>
      </>
    );
  };

  return (
    <>
      <div className="tabs" role="tablist" style={{ marginBottom: 14, background: "transparent", padding: 0, flexWrap: "wrap" }}>
        {([["fluxo", "Fluxo mensal"], ["dre", "DRE"], ["projetos", "Recebimentos por projeto"], ["categorias", "Despesas por categoria"], ["fornecedores", "Fornecedores e Partners"]] as [Rel, string][]).map(([k, t]) => (
          <button key={k} type="button" className={rel === k ? "on" : ""} onClick={() => setRel(k)}>{t}</button>
        ))}
      </div>
      {filtros}
      {erro && <p className="err" role="alert">{erro}</p>}
      {dados === null ? <p className="note">Carregando…</p> : rel === "fluxo" ? fluxo() : rel === "dre" ? dre() : rel === "projetos" ? projetos() : rel === "categorias" ? categorias() : fornecedores()}
    </>
  );
}
