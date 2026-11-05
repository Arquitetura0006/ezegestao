"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { Cabeca, Vazio } from "../ui";
import { erroMsg } from "@/lib/util";
import { hoje, nomeProjeto } from "@/lib/gestor";
import {
  CAMPOS_LANC, STATUS_LANC, baixarCSV, brl, buscarTudo, carregarBase, dataBR, fimMes, mesNome, somaMes, status,
  type Base, type Lanc, type Status, type TipoLanc,
} from "@/lib/financeiro";
import LancEditor from "./LancEditor";
import Relatorios from "./Relatorios";
import CadastrosFin from "./CadastrosFin";

type Aba = "lancamentos" | "receber" | "caixas" | "relatorios" | "cadastros";

export default function Financeiro() {
  const { esc, financeiro } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [aba, setAba] = useState<Aba>("lancamentos");
  const [base, setBase] = useState<Base | null>(null);
  const [editor, setEditor] = useState<{ id: string | null; inicial?: Partial<Lanc> } | null>(null);
  const [versao, setVersao] = useState(0);

  const carregarB = useCallback(async () => setBase(await carregarBase(supabase, esc.id)), [supabase, esc.id]);
  useEffect(() => {
    if (financeiro) carregarB();
  }, [carregarB, financeiro]);

  if (!financeiro) return <Vazio titulo="Acesso restrito" texto="O financeiro é visto só por quem tem permissão." />;
  if (!base) return <p className="note">Carregando…</p>;

  const salvo = () => setVersao((v) => v + 1);
  const novo = (inicial?: Partial<Lanc>) => setEditor({ id: null, inicial });
  const abrir = (id: string) => setEditor({ id });

  return (
    <>
      <Cabeca kicker={esc.nome} titulo="Financeiro">
        <button className="btn" type="button" onClick={() => novo({ tipo: "receita" })}>Novo recebimento</button>
        <button className="btn dark" type="button" onClick={() => novo({ tipo: "despesa" })}>Novo pagamento</button>
      </Cabeca>
      <div className="tabs" role="tablist" style={{ marginBottom: 20, flexWrap: "wrap" }}>
        {([["lancamentos", "Lançamentos"], ["receber", "A receber"], ["caixas", "Caixas"], ["relatorios", "Relatórios"], ["cadastros", "Cadastros"]] as [Aba, string][]).map(([k, t]) => (
          <button key={k} type="button" className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{t}</button>
        ))}
      </div>
      {aba === "lancamentos" && <Lancamentos base={base} versao={versao} abrir={abrir} />}
      {aba === "receber" && <Receber base={base} versao={versao} abrir={abrir} />}
      {aba === "caixas" && <Caixas base={base} versao={versao} abrir={abrir} novo={novo} />}
      {aba === "relatorios" && <Relatorios base={base} />}
      {aba === "cadastros" && <CadastrosFin base={base} onChange={carregarB} />}
      {editor && <LancEditor id={editor.id} inicial={editor.inicial} base={base} onClose={() => setEditor(null)} onSaved={salvo} onBase={carregarB} />}
    </>
  );
}

// ---------- utilidades de exibição ----------
function useNomes(base: Base) {
  return useMemo(() => {
    const cx = Object.fromEntries(base.caixas.map((c) => [c.id, c.nome]));
    const cat = Object.fromEntries(base.categorias.map((c) => [c.id, c.nome]));
    const proj = Object.fromEntries(base.projetos.map((p) => [p.id, nomeProjeto(p)]));
    const cli = Object.fromEntries(base.clientes.map((c) => [c.id, c.nome]));
    const forn = Object.fromEntries(base.fornecedores.map((f) => [f.id, f.nome]));
    return { cx, cat, proj, cli, forn };
  }, [base]);
}

const sinal = (l: Lanc) => (l.tipo === "receita" ? 1 : l.tipo === "despesa" ? -1 : 0);

function Lancamentos({ base, versao, abrir }: { base: Base; versao: number; abrir: (id: string) => void }) {
  const { esc } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const N = useNomes(base);
  const [mes, setMes] = useState(hoje().slice(0, 7));
  const [lista, setLista] = useState<Lanc[] | null>(null);
  const [f, setF] = useState<{ tipo: TipoLanc | ""; st: Status | ""; caixa: string; cat: string; q: string }>({ tipo: "", st: "", caixa: "", cat: "", q: "" });
  const [erro, setErro] = useState("");
  const hj = hoje();

  const carregar = useCallback(async () => {
    try {
      const rows = await buscarTudo<Lanc>((de, ate) =>
        supabase.from("lancamentos").select(CAMPOS_LANC).eq("escritorio_id", esc.id).gte("vencimento", `${mes}-01`).lte("vencimento", fimMes(mes)).order("vencimento").order("descricao").range(de, ate));
      setLista(rows);
    } catch (e) {
      setErro(erroMsg(e));
    }
  }, [supabase, esc.id, mes]);
  useEffect(() => {
    carregar();
  }, [carregar, versao]);

  async function pagar(l: Lanc) {
    const { error } = await supabase.from("lancamentos").update({ pago_em: hj }).eq("id", l.id);
    if (error) return setErro(erroMsg(error));
    carregar();
  }

  const q = f.q.trim().toLowerCase();
  const vis = (lista ?? []).filter((l) =>
    (!f.tipo || l.tipo === f.tipo) && (!f.st || status(l, hj) === f.st) && (!f.caixa || l.caixa_id === f.caixa || l.caixa_destino_id === f.caixa) &&
    (!f.cat || l.categoria_id === f.cat) &&
    (!q || `${l.descricao} ${N.proj[l.projeto_id ?? ""] ?? ""} ${N.cli[l.cliente_id ?? ""] ?? ""} ${N.forn[l.fornecedor_id ?? ""] ?? ""} ${l.documento ?? ""}`.toLowerCase().includes(q)));
  const tot = (t: TipoLanc, pagos?: boolean) => vis.filter((l) => l.tipo === t && (pagos === undefined || !!l.pago_em === pagos)).reduce((s, l) => s + Number(l.valor), 0);
  const entPrev = tot("receita"), saiPrev = tot("despesa"), entReal = tot("receita", true), saiReal = tot("despesa", true);

  function exportar() {
    baixarCSV(`lancamentos-${mes}.csv`, [["Vencimento", "Pago em", "Tipo", "Descrição", "Projeto", "Cliente/Fornecedor", "Categoria", "Caixa", "Valor", "Status", "Documento"],
      ...vis.map((l) => [dataBR(l.vencimento), dataBR(l.pago_em), l.tipo, l.descricao, N.proj[l.projeto_id ?? ""] ?? "", N.cli[l.cliente_id ?? ""] ?? N.forn[l.fornecedor_id ?? ""] ?? "",
        N.cat[l.categoria_id ?? ""] ?? "", l.tipo === "transferencia" ? `${N.cx[l.caixa_id ?? ""]} → ${N.cx[l.caixa_destino_id ?? ""]}` : N.cx[l.caixa_id ?? ""] ?? "",
        sinal(l) * Number(l.valor) || Number(l.valor), STATUS_LANC[status(l, hj)], l.documento])]);
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <div className="row">
          <button className="btn small" type="button" onClick={() => setMes(somaMes(mes, -1))} aria-label="Mês anterior">←</button>
          <strong style={{ minWidth: 150, textAlign: "center", textTransform: "capitalize" }}>{mesNome(mes)}</strong>
          <button className="btn small" type="button" onClick={() => setMes(somaMes(mes, 1))} aria-label="Próximo mês">→</button>
          <button className="btn small ghost" type="button" onClick={() => setMes(hoje().slice(0, 7))}>Hoje</button>
        </div>
        <button className="btn small" type="button" onClick={exportar} disabled={!vis.length}>Exportar para Excel</button>
      </div>

      <div className="kpis" style={{ marginBottom: 14 }}>
        <div className="kpi"><small>Entradas</small><strong>{brl(entReal)}</strong><span>de {brl(entPrev)} previstas</span></div>
        <div className="kpi"><small>Saídas</small><strong>{brl(saiReal)}</strong><span>de {brl(saiPrev)} previstas</span></div>
        <div className="kpi"><small>Resultado</small><strong>{brl(entReal - saiReal)}</strong><span>previsto {brl(entPrev - saiPrev)}</span></div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <input type="text" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar descrição, projeto, cliente, fornecedor, NF" style={{ width: 300, maxWidth: "100%" }} aria-label="Buscar" />
        <select className="f" style={{ width: "auto" }} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoLanc | "" })} aria-label="Tipo">
          <option value="">Tudo</option><option value="receita">Recebimentos</option><option value="despesa">Pagamentos</option><option value="transferencia">Transferências</option>
        </select>
        <select className="f" style={{ width: "auto" }} value={f.st} onChange={(e) => setF({ ...f, st: e.target.value as Status | "" })} aria-label="Status">
          <option value="">Qualquer status</option><option value="aberto">Em aberto</option><option value="atrasado">Atrasado</option><option value="pago">Pago</option>
        </select>
        <select className="f" style={{ width: "auto" }} value={f.caixa} onChange={(e) => setF({ ...f, caixa: e.target.value })} aria-label="Caixa">
          <option value="">Todos os caixas</option>{base.caixas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="f" style={{ width: "auto", maxWidth: 240 }} value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })} aria-label="Categoria">
          <option value="">Todas as categorias</option>{base.categorias.map((c) => <option key={c.id} value={c.id}>{c.grupo} › {c.nome}</option>)}
        </select>
      </div>

      {erro && <p className="err" role="alert">{erro}</p>}
      {lista === null ? <p className="note">Carregando…</p> : vis.length === 0 ? <Vazio titulo="Nenhum lançamento neste mês" /> : (
        <div className="tabela-w">
          <table className="tabela">
            <thead><tr><th>Venc.</th><th>Descrição</th><th>Projeto</th><th>Cliente / fornecedor</th><th>Categoria</th><th>Caixa</th><th style={{ textAlign: "right" }}>Valor</th><th>Status</th></tr></thead>
            <tbody>
              {vis.map((l) => {
                const st = status(l, hj);
                return (
                  <tr key={l.id} className="clicavel" onClick={() => abrir(l.id)}>
                    <td>{dataBR(l.vencimento).slice(0, 5)}</td>
                    <td><strong style={{ fontWeight: 600 }}>{l.descricao}</strong>{l.recorrente && <small className="note"> · mensal</small>}</td>
                    <td>{l.projeto_id ? <small>{N.proj[l.projeto_id]}</small> : <span className="note">—</span>}</td>
                    <td><small>{N.cli[l.cliente_id ?? ""] ?? N.forn[l.fornecedor_id ?? ""] ?? "—"}</small></td>
                    <td><small>{l.tipo === "transferencia" ? "Transferência" : N.cat[l.categoria_id ?? ""] ?? <span className="atras">sem categoria</span>}</small></td>
                    <td><small>{l.tipo === "transferencia" ? `${N.cx[l.caixa_id ?? ""]} → ${N.cx[l.caixa_destino_id ?? ""]}` : N.cx[l.caixa_id ?? ""] ?? "—"}</small></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}><strong>{l.tipo === "despesa" ? "− " : l.tipo === "receita" ? "+ " : ""}{brl(l.valor)}</strong></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {st === "pago" ? <span className="pill">Pago {dataBR(l.pago_em).slice(0, 5)}</span> : (
                        <button className={`btn small${st === "atrasado" ? " dark" : ""}`} type="button" onClick={() => pagar(l)} title="Marcar como pago hoje">
                          {st === "atrasado" ? "Atrasado · baixar" : l.tipo === "receita" ? "Receber" : l.tipo === "despesa" ? "Pagar" : "Transferir"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Receber({ base, versao, abrir }: { base: Base; versao: number; abrir: (id: string) => void }) {
  const { esc } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const N = useNomes(base);
  const [lista, setLista] = useState<Lanc[] | null>(null);
  const [tipo, setTipo] = useState<"receita" | "despesa">("receita");
  const hj = hoje();

  useEffect(() => {
    buscarTudo<Lanc>((de, ate) => supabase.from("lancamentos").select(CAMPOS_LANC).eq("escritorio_id", esc.id).eq("tipo", tipo).is("pago_em", null).order("vencimento").range(de, ate))
      .then(setLista).catch(() => setLista([]));
  }, [supabase, esc.id, tipo, versao]);

  const dias = (l: Lanc) => Math.round((new Date(hj).getTime() - new Date(l.vencimento).getTime()) / 864e5);
  const faixas: [string, (d: number) => boolean][] = [
    ["Vencidos há mais de 90 dias", (d) => d > 90],
    ["Vencidos de 31 a 90 dias", (d) => d > 30 && d <= 90],
    ["Vencidos até 30 dias", (d) => d > 0 && d <= 30],
    ["Vencem nos próximos 30 dias", (d) => d <= 0 && d > -30],
    ["Vencem depois de 30 dias", (d) => d <= -30],
  ];
  const tot = (xs: Lanc[]) => xs.reduce((s, l) => s + Number(l.valor), 0);
  const quem = (l: Lanc) => N.cli[l.cliente_id ?? ""] ?? N.forn[l.fornecedor_id ?? ""] ?? "";

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <div className="tabs seg" role="tablist">
          <button type="button" className={tipo === "receita" ? "on" : ""} onClick={() => setTipo("receita")}>A receber</button>
          <button type="button" className={tipo === "despesa" ? "on" : ""} onClick={() => setTipo("despesa")}>A pagar</button>
        </div>
        {lista && <strong>{brl(tot(lista))} em aberto</strong>}
      </div>
      {lista === null ? <p className="note">Carregando…</p> : lista.length === 0 ? <Vazio titulo="Nada em aberto" /> : (
        <div className="stack" style={{ gap: 16 }}>
          {faixas.map(([t, fn]) => {
            const xs = lista.filter((l) => fn(dias(l)));
            if (!xs.length) return null;
            return (
              <section key={t}>
                <h3 className="sec-t">{t} <small className="note">· {xs.length} · {brl(tot(xs))}</small></h3>
                <div className="tabela-w">
                  <table className="tabela">
                    <tbody>
                      {xs.map((l) => (
                        <tr key={l.id} className="clicavel" onClick={() => abrir(l.id)}>
                          <td style={{ width: 90 }}>{dataBR(l.vencimento)}</td>
                          <td><strong style={{ fontWeight: 600 }}>{l.descricao}</strong></td>
                          <td><small>{l.projeto_id ? N.proj[l.projeto_id] : ""}</small></td>
                          <td><small>{quem(l)}</small></td>
                          <td style={{ textAlign: "right" }}><strong>{brl(l.valor)}</strong></td>
                          <td style={{ width: 110 }}><small className={dias(l) > 0 ? "atras" : "note"}>{dias(l) > 0 ? `${dias(l)} dias` : dias(l) === 0 ? "hoje" : `em ${-dias(l)} dias`}</small></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function Caixas({ base, versao, abrir, novo }: { base: Base; versao: number; abrir: (id: string) => void; novo: (i?: Partial<Lanc>) => void }) {
  const { esc } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const N = useNomes(base);
  const [saldos, setSaldos] = useState<Record<string, { saldo: number; previsto: number }>>({});
  const [sel, setSel] = useState<string>(base.caixas[0]?.id ?? "");
  const [mes, setMes] = useState(hoje().slice(0, 7));
  const [ext, setExt] = useState<{ l: Lanc; v: number; saldo: number }[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    supabase.rpc("saldo_caixas", { esc: esc.id }).then(({ data, error }) => {
      if (error) return setErro(erroMsg(error));
      setSaldos(Object.fromEntries(((data ?? []) as { caixa_id: string; saldo: number; previsto: number }[]).map((x) => [x.caixa_id, { saldo: Number(x.saldo), previsto: Number(x.previsto) }])));
    });
  }, [supabase, esc.id, versao]);

  useEffect(() => {
    if (!sel) return;
    setExt(null);
    (async () => {
      const ini = `${mes}-01`;
      const dia0 = new Date(new Date(ini).getTime() - 864e5).toISOString().slice(0, 10);
      const [{ data: s0 }, rows] = await Promise.all([
        supabase.rpc("saldo_caixas", { esc: esc.id, ate: dia0 }),
        buscarTudo<Lanc>((de, ate) => supabase.from("lancamentos").select(CAMPOS_LANC).eq("escritorio_id", esc.id).or(`caixa_id.eq.${sel},caixa_destino_id.eq.${sel}`)
          .gte("pago_em", ini).lte("pago_em", fimMes(mes)).order("pago_em").order("created_at").range(de, ate)),
      ]);
      let saldo = Number(((s0 ?? []) as { caixa_id: string; saldo: number }[]).find((x) => x.caixa_id === sel)?.saldo ?? 0);
      const linhas = rows.map((l) => {
        const v = l.tipo === "receita" ? Number(l.valor) : l.tipo === "despesa" ? -Number(l.valor) : l.caixa_destino_id === sel ? Number(l.valor) : -Number(l.valor);
        saldo += v;
        return { l, v, saldo };
      });
      setExt(linhas);
    })();
  }, [supabase, esc.id, sel, mes, versao]);

  const total = base.caixas.reduce((s, c) => s + (saldos[c.id]?.saldo ?? 0), 0);
  const cx = base.caixas.find((c) => c.id === sel);

  return (
    <>
      {erro && <p className="err" role="alert">{erro}</p>}
      <div className="kpis" style={{ marginBottom: 18 }}>
        {base.caixas.filter((c) => c.ativo).map((c) => (
          <button key={c.id} type="button" className={`kpi kpi-b${sel === c.id ? " on" : ""}`} onClick={() => setSel(c.id)}>
            <small>{c.nome}</small><strong>{brl(saldos[c.id]?.saldo)}</strong><span>previsto {brl(saldos[c.id]?.previsto)}</span>
          </button>
        ))}
        <div className="kpi"><small>Total em caixa</small><strong>{brl(total)}</strong><span>hoje</span></div>
      </div>
      {cx && (
        <>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <div className="row">
              <strong>Extrato · {cx.nome}</strong>
              <button className="btn small" type="button" onClick={() => setMes(somaMes(mes, -1))} aria-label="Mês anterior">←</button>
              <span style={{ textTransform: "capitalize" }}>{mesNome(mes)}</span>
              <button className="btn small" type="button" onClick={() => setMes(somaMes(mes, 1))} aria-label="Próximo mês">→</button>
            </div>
            <div className="row">
              <button className="btn small" type="button" onClick={() => novo({ tipo: "transferencia", caixa_id: cx.id, pago_em: hoje() })}>Transferir entre caixas</button>
              {ext && <button className="btn small" type="button" onClick={() => baixarCSV(`extrato-${cx.nome}-${mes}.csv`, [["Data", "Descrição", "Projeto", "Valor", "Saldo"], ...ext.map((x) => [dataBR(x.l.pago_em), x.l.descricao, N.proj[x.l.projeto_id ?? ""] ?? "", x.v, x.saldo])])}>Exportar</button>}
            </div>
          </div>
          {ext === null ? <p className="note">Carregando…</p> : ext.length === 0 ? <Vazio titulo="Sem movimento neste mês" /> : (
            <div className="tabela-w">
              <table className="tabela">
                <thead><tr><th>Data</th><th>Descrição</th><th>Projeto</th><th style={{ textAlign: "right" }}>Valor</th><th style={{ textAlign: "right" }}>Saldo</th></tr></thead>
                <tbody>
                  {ext.map(({ l, v, saldo }) => (
                    <tr key={l.id} className="clicavel" onClick={() => abrir(l.id)}>
                      <td>{dataBR(l.pago_em)}</td>
                      <td>{l.descricao}{l.tipo === "transferencia" && <small className="note"> · transferência</small>}</td>
                      <td><small>{l.projeto_id ? <Link href={`/projetos/${l.projeto_id}`} onClick={(e) => e.stopPropagation()}>{N.proj[l.projeto_id]}</Link> : ""}</small></td>
                      <td style={{ textAlign: "right" }}>{v < 0 ? "− " : "+ "}{brl(Math.abs(v))}</td>
                      <td style={{ textAlign: "right" }}><strong>{brl(saldo)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
