"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp, usePode } from "../../ctx";
import { Vazio } from "../../ui";
import { erroMsg } from "@/lib/util";
import { hoje, nomeProjeto } from "@/lib/gestor";
import {
  CAMPOS_LANC, STATUS_LANC, TIPO_FORN, baixarCSV, brl, buscarTudo, carregarBase, dataBR, status,
  type Base, type Lanc,
} from "@/lib/financeiro";
import LancEditor from "../../financeiro/LancEditor";
import type { MembroP } from "./comum";

// Centro de custos da pessoa: lançamentos do financeiro ligados ao cadastro dela
// (fornecedor/Partner/colaborador com perfil_id = pessoa).
export default function Custos({ m }: { m: MembroP }) {
  const { esc } = useApp();
  const editar = usePode("financeiro", true);
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [base, setBase] = useState<Base | null>(null);
  const [lanc, setLanc] = useState<Lanc[] | null>(null);
  const [busca, setBusca] = useState("");
  const [ano, setAno] = useState<string>("todos");
  const [st, setSt] = useState<"todos" | "aberto" | "pago">("todos");
  const [aberto, setAberto] = useState<string | "novo" | null>(null);
  const [escolha, setEscolha] = useState("");
  const [erro, setErro] = useState("");

  const carregarBaseF = useCallback(() => carregarBase(supabase, esc.id).then(setBase), [supabase, esc.id]);
  useEffect(() => {
    carregarBaseF();
  }, [carregarBaseF]);

  const forn = base?.fornecedores.find((f) => (f as { perfil_id?: string | null }).perfil_id === m.perfil_id) ?? null;

  const carregar = useCallback(async () => {
    if (!forn) return setLanc([]);
    try {
      const l = await buscarTudo<Lanc>((a, b) =>
        supabase.from("lancamentos").select(CAMPOS_LANC).eq("escritorio_id", esc.id).eq("fornecedor_id", forn.id).order("vencimento", { ascending: false }).range(a, b));
      setLanc(l);
    } catch (e) {
      setErro(erroMsg(e));
      setLanc([]);
    }
  }, [supabase, esc.id, forn]);
  useEffect(() => {
    if (base) carregar();
  }, [base, carregar]);

  async function vincular(id: string) {
    setErro("");
    const { error } = await supabase.from("fornecedores").update({ perfil_id: m.perfil_id }).eq("id", id);
    if (error) return setErro(error.message.includes("perfil_id") ? "Rode a migração 0009 no Supabase para ligar pessoas ao financeiro." : erroMsg(error));
    carregarBaseF();
  }
  async function desvincular() {
    if (!forn || !confirm(`Desligar ${forn.nome} desta pessoa? Os lançamentos continuam no financeiro.`)) return;
    await supabase.from("fornecedores").update({ perfil_id: null }).eq("id", forn.id);
    carregarBaseF();
  }
  async function criar() {
    setErro("");
    const { error } = await supabase.from("fornecedores").insert({
      escritorio_id: esc.id, nome: m.perfil?.nome || m.perfil?.email || "Sem nome", tipo: m.papel === "partner" ? "partner" : "colaborador", email: m.perfil?.email, perfil_id: m.perfil_id,
    });
    if (error) return setErro(erroMsg(error));
    carregarBaseF();
  }

  if (!base) return <p className="note">Carregando…</p>;

  if (!forn) {
    const nome = (m.perfil?.nome || "").toLowerCase().split(/\s+/)[0];
    const cands = base.fornecedores
      .filter((f) => !(f as { perfil_id?: string | null }).perfil_id)
      .sort((a, b) => Number(b.nome.toLowerCase().includes(nome)) - Number(a.nome.toLowerCase().includes(nome)) || a.nome.localeCompare(b.nome));
    return (
      <Vazio titulo="Esta pessoa ainda não está ligada ao financeiro" texto="Escolha o cadastro dela em Fornecedores/Partners para ver salários, pagamentos e reembolsos aqui.">
        {editar ? (
          <div className="row" style={{ justifyContent: "center" }}>
            <select className="f" style={{ width: 280 }} value={escolha} onChange={(e) => setEscolha(e.target.value)} aria-label="Cadastro no financeiro">
              <option value="">Escolher cadastro…</option>
              {cands.map((f) => <option key={f.id} value={f.id}>{f.nome} · {TIPO_FORN[f.tipo] ?? f.tipo}</option>)}
            </select>
            <button className="btn dark" type="button" disabled={!escolha} onClick={() => vincular(escolha)}>Ligar</button>
            <button className="btn" type="button" onClick={criar}>Criar cadastro</button>
          </div>
        ) : <p className="note">Peça a quem cuida do financeiro para fazer a ligação.</p>}
        {erro && <p className="err" role="alert" style={{ width: "100%" }}>{erro}</p>}
      </Vazio>
    );
  }

  const hj = hoje();
  const anos = [...new Set((lanc ?? []).map((l) => l.vencimento.slice(0, 4)))].sort().reverse();
  const termo = busca.trim().toLowerCase();
  const cat = (id: string | null) => base.categorias.find((c) => c.id === id)?.nome ?? "";
  const proj = (id: string | null) => {
    const p = base.projetos.find((x) => x.id === id);
    return p ? nomeProjeto(p) : "";
  };
  const l = (lanc ?? [])
    .filter((x) => ano === "todos" || x.vencimento.startsWith(ano))
    .filter((x) => st === "todos" || (st === "pago" ? !!x.pago_em : !x.pago_em))
    .filter((x) => !termo || `${x.descricao} ${cat(x.categoria_id)} ${proj(x.projeto_id)}`.toLowerCase().includes(termo));
  const sinal = (x: Lanc) => (x.tipo === "receita" ? -1 : 1); // custo da pessoa: pagamentos somam, recebimentos (reembolsos) abatem
  const pago = l.filter((x) => x.pago_em).reduce((s, x) => s + sinal(x) * x.valor, 0);
  const aberto_ = l.filter((x) => !x.pago_em).reduce((s, x) => s + sinal(x) * x.valor, 0);

  return (
    <>
      <div className="barra-f">
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar transações…" aria-label="Buscar" />
        <select className="f" style={{ width: "auto" }} value={ano} onChange={(e) => setAno(e.target.value)} aria-label="Período">
          <option value="todos">Todo o período</option>
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="f" style={{ width: "auto" }} value={st} onChange={(e) => setSt(e.target.value as typeof st)} aria-label="Status">
          <option value="todos">Todos</option>
          <option value="aberto">Em aberto</option>
          <option value="pago">Pagos</option>
        </select>
        <span className="dir">
          <button className="btn small ghost" type="button" onClick={() => baixarCSV(`custos-${(m.perfil?.nome || "pessoa").replace(/\s+/g, "-")}.csv`, [
            ["Data", "Tipo", "Descrição", "Categoria", "Projeto", "Valor", "Status"],
            ...l.map((x) => [dataBR(x.vencimento), x.tipo === "receita" ? "Receita" : "Despesa", x.descricao, cat(x.categoria_id), proj(x.projeto_id), x.valor, STATUS_LANC[status(x, hj)]]),
          ])}>Excel</button>
          {editar && <button className="btn dark" type="button" onClick={() => setAberto("novo")}>+ Adicionar</button>}
        </span>
      </div>

      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><small>Pago</small><strong>{brl(pago)}</strong><span>{ano === "todos" ? "todo o período" : ano}</span></div>
        <div className="kpi"><small>Em aberto</small><strong>{brl(aberto_)}</strong><span>{l.filter((x) => !x.pago_em).length} lançamentos</span></div>
        <div className="kpi"><small>Cadastro no financeiro</small><strong style={{ fontSize: 15, fontWeight: 500 }}>{forn.nome}</strong><span>{TIPO_FORN[forn.tipo] ?? forn.tipo}{editar && <> · <button type="button" className="linkbtn" onClick={desvincular}>desligar</button></>}</span></div>
      </div>

      {erro && <p className="err" role="alert" style={{ marginBottom: 10 }}>{erro}</p>}
      {lanc === null ? <p className="note">Carregando…</p> : l.length === 0 ? <Vazio titulo="Nenhum lançamento" /> : (
        <div className="tabela-w">
          <table className="tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th>Projeto</th>
                <th style={{ textAlign: "right" }}>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {l.map((x) => {
                const s = status(x, hj);
                return (
                  <tr key={x.id} className={editar ? "clicavel" : ""} onClick={() => editar && setAberto(x.id)}>
                    <td className="valor-n" style={{ fontWeight: 400 }}>{dataBR(x.vencimento)}</td>
                    <td><span className={`st-pill${x.tipo === "despesa" ? " cheio" : ""}`}>{x.tipo === "receita" ? "Receita" : x.tipo === "despesa" ? "Despesa" : "Transferência"}</span></td>
                    <td>{x.descricao}{x.parcelas ? <span className="note"> · {x.parcela}/{x.parcelas}</span> : null}</td>
                    <td>{cat(x.categoria_id) || <span className="note">—</span>}</td>
                    <td className="note">{proj(x.projeto_id)}</td>
                    <td className="valor-n" style={{ textAlign: "right" }}>{x.tipo === "receita" ? "+ " : "− "}{brl(x.valor)}</td>
                    <td><span className={`st-pill${s === "pago" ? " cinza" : s === "atrasado" ? " cheio" : ""}`}>{STATUS_LANC[s]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {aberto && (
        <LancEditor
          id={aberto === "novo" ? null : aberto}
          base={base}
          inicial={aberto === "novo" ? { tipo: "despesa", fornecedor_id: forn.id, descricao: "" } : undefined}
          onClose={() => setAberto(null)}
          onSaved={() => {
            setAberto(null);
            carregar();
          }}
          onBase={carregarBaseF}
        />
      )}
    </>
  );
}
