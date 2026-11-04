"use client";

import { useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { erroMsg } from "@/lib/util";
import { TIPO_FORN, parseValor, type Base, type Caixa, type Fornecedor } from "@/lib/financeiro";

type Aba = "caixas" | "categorias" | "fornecedores";

export default function CadastrosFin({ base, onChange }: { base: Base; onChange: () => void }) {
  const { esc } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [aba, setAba] = useState<Aba>("caixas");
  const [erro, setErro] = useState("");
  const [novoCx, setNovoCx] = useState({ nome: "", tipo: "banco" });
  const [novaCat, setNovaCat] = useState({ tipo: "despesa", grupo: "", nome: "", dre: "administrativa" });
  const [forn, setForn] = useState<Partial<Fornecedor> | null>(null);
  const [buscaF, setBuscaF] = useState("");

  const up = async (tab: string, id: string, p: Record<string, unknown>) => {
    const { error } = await supabase.from(tab).update(p).eq("id", id);
    if (error) setErro(erroMsg(error));
    onChange();
  };

  async function addCaixa(e: React.FormEvent) {
    e.preventDefault();
    if (!novoCx.nome.trim()) return;
    const { error } = await supabase.from("caixas").insert({ escritorio_id: esc.id, nome: novoCx.nome.trim(), tipo: novoCx.tipo, ordem: base.caixas.length + 1 });
    if (error) return setErro(erroMsg(error));
    setNovoCx({ nome: "", tipo: "banco" });
    onChange();
  }

  async function addCat(e: React.FormEvent) {
    e.preventDefault();
    if (!novaCat.grupo.trim() || !novaCat.nome.trim()) return setErro("Informe grupo e nome.");
    const { error } = await supabase.from("fin_categorias").insert({ escritorio_id: esc.id, ...novaCat, grupo: novaCat.grupo.trim(), nome: novaCat.nome.trim(), ordem: 200 });
    if (error) return setErro(erroMsg(error));
    setNovaCat({ ...novaCat, nome: "" });
    onChange();
  }

  async function salvarForn(e: React.FormEvent) {
    e.preventDefault();
    if (!forn?.nome?.trim()) return setErro("Informe o nome.");
    const reg = { escritorio_id: esc.id, nome: forn.nome.trim(), tipo: forn.tipo ?? "fornecedor", documento: forn.documento || null, email: forn.email || null, telefone: forn.telefone || null, pix: forn.pix || null, obs: forn.obs || null, ativo: forn.ativo ?? true };
    const { error } = forn.id ? await supabase.from("fornecedores").update(reg).eq("id", forn.id) : await supabase.from("fornecedores").insert(reg);
    if (error) return setErro(erroMsg(error));
    setForn(null);
    onChange();
  }

  const grupos = (t: string) => [...new Set(base.categorias.filter((c) => c.tipo === t).map((c) => c.grupo))];
  const qf = buscaF.trim().toLowerCase();

  return (
    <>
      <div className="tabs" role="tablist" style={{ marginBottom: 16, background: "transparent", padding: 0 }}>
        {([["caixas", "Caixas"], ["categorias", "Plano de contas"], ["fornecedores", "Fornecedores e Partners"]] as [Aba, string][]).map(([k, t]) => (
          <button key={k} type="button" className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{t}</button>
        ))}
      </div>
      {erro && <p className="err" role="alert">{erro}</p>}

      {aba === "caixas" && (
        <>
          <p className="note" style={{ marginTop: 0, maxWidth: 720 }}>Saldo inicial é o saldo do caixa na data informada. Os lançamentos pagos a partir dessa data somam e subtraem dele. Transferências entre caixas não contam como receita nem despesa.</p>
          <div className="lista">
            {base.caixas.map((c: Caixa) => (
              <div key={c.id} className="item" style={{ opacity: c.ativo ? 1 : 0.5, flexWrap: "wrap" }}>
                <input type="text" defaultValue={c.nome} style={{ width: 200 }} aria-label="Nome do caixa" onBlur={(e) => e.target.value.trim() && e.target.value !== c.nome && up("caixas", c.id, { nome: e.target.value.trim() })} />
                <select className="f" style={{ width: "auto" }} defaultValue={c.tipo} onChange={(e) => up("caixas", c.id, { tipo: e.target.value })} aria-label="Tipo">
                  <option value="banco">Conta bancária</option><option value="dinheiro">Dinheiro</option><option value="investimento">Investimento</option><option value="cartao">Cartão</option>
                </select>
                <input type="text" defaultValue={c.banco ?? ""} placeholder="Banco" style={{ width: 120 }} aria-label="Banco" onBlur={(e) => e.target.value !== (c.banco ?? "") && up("caixas", c.id, { banco: e.target.value || null })} />
                <label className="row" style={{ gap: 6, flexWrap: "nowrap" }}><small className="note">Saldo inicial</small>
                  <input type="text" inputMode="decimal" defaultValue={String(c.saldo_inicial).replace(".", ",")} style={{ width: 120 }} aria-label="Saldo inicial"
                    onBlur={(e) => { const v = parseValor(e.target.value); if (v !== null && v !== Number(c.saldo_inicial)) up("caixas", c.id, { saldo_inicial: v }); }} />
                </label>
                <label className="row" style={{ gap: 6, flexWrap: "nowrap" }}><small className="note">em</small>
                  <input type="date" defaultValue={c.saldo_inicial_em} style={{ width: 150 }} aria-label="Data do saldo inicial" onBlur={(e) => e.target.value && e.target.value !== c.saldo_inicial_em && up("caixas", c.id, { saldo_inicial_em: e.target.value })} />
                </label>
                <button className="btn small" type="button" onClick={() => up("caixas", c.id, { ativo: !c.ativo })}>{c.ativo ? "Desativar" : "Ativar"}</button>
              </div>
            ))}
          </div>
          <form className="row" style={{ marginTop: 12, flexWrap: "nowrap" }} onSubmit={addCaixa}>
            <input type="text" value={novoCx.nome} onChange={(e) => setNovoCx({ ...novoCx, nome: e.target.value })} placeholder="Novo caixa (ex.: Sicredi, Itaú)" aria-label="Novo caixa" />
            <select className="f" style={{ width: "auto" }} value={novoCx.tipo} onChange={(e) => setNovoCx({ ...novoCx, tipo: e.target.value })} aria-label="Tipo">
              <option value="banco">Conta bancária</option><option value="dinheiro">Dinheiro</option><option value="investimento">Investimento</option><option value="cartao">Cartão</option>
            </select>
            <button className="btn small" type="submit">Adicionar caixa</button>
          </form>
        </>
      )}

      {aba === "categorias" && (
        <>
          <p className="note" style={{ marginTop: 0, maxWidth: 720 }}>Cada categoria cai numa linha do DRE. Desative em vez de excluir, para não perder o histórico.</p>
          {(["receita", "despesa"] as const).map((t) => (
            <section key={t} style={{ marginBottom: 18 }}>
              <h3 className="sec-t">{t === "receita" ? "Recebimentos" : "Pagamentos"}</h3>
              <div className="stack" style={{ gap: 10 }}>
                {grupos(t).map((g) => (
                  <div key={g}>
                    <strong style={{ fontSize: 14 }}>{g}</strong>
                    <div className="row" style={{ marginTop: 6 }}>
                      {base.categorias.filter((c) => c.tipo === t && c.grupo === g).map((c) => (
                        <button key={c.id} type="button" className={`pill${c.ativo ? "" : " dash"}`} onClick={() => up("fin_categorias", c.id, { ativo: !c.ativo })} title={c.ativo ? "Clique para desativar" : "Clique para ativar"}>
                          {c.nome}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <form className="row" onSubmit={addCat}>
            <select className="f" style={{ width: "auto" }} value={novaCat.tipo} onChange={(e) => setNovaCat({ ...novaCat, tipo: e.target.value, dre: e.target.value === "receita" ? "receita" : "administrativa" })} aria-label="Tipo">
              <option value="despesa">Pagamento</option><option value="receita">Recebimento</option>
            </select>
            <input type="text" list="grupos-fin" value={novaCat.grupo} onChange={(e) => setNovaCat({ ...novaCat, grupo: e.target.value })} placeholder="Grupo" style={{ width: 200 }} aria-label="Grupo" />
            <datalist id="grupos-fin">{grupos(novaCat.tipo).map((g) => <option key={g} value={g} />)}</datalist>
            <input type="text" value={novaCat.nome} onChange={(e) => setNovaCat({ ...novaCat, nome: e.target.value })} placeholder="Categoria" style={{ width: 220 }} aria-label="Categoria" />
            <select className="f" style={{ width: "auto" }} value={novaCat.dre} onChange={(e) => setNovaCat({ ...novaCat, dre: e.target.value })} aria-label="Linha do DRE">
              <option value="receita">Receita</option><option value="deducao">Imposto sobre faturamento</option><option value="custo">Custo do projeto</option><option value="pessoal">Pessoal</option>
              <option value="administrativa">Administrativa</option><option value="comercial">Comercial</option><option value="financeira">Financeira</option><option value="nao_operacional">Não operacional</option>
            </select>
            <button className="btn small" type="submit">Adicionar</button>
          </form>
        </>
      )}

      {aba === "fornecedores" && (
        <>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <input type="text" value={buscaF} onChange={(e) => setBuscaF(e.target.value)} placeholder="Buscar" style={{ width: 280 }} aria-label="Buscar fornecedor" />
            {!forn && <button className="btn small dark" type="button" onClick={() => setForn({ tipo: "fornecedor", ativo: true })}>Novo</button>}
          </div>
          {forn && (
            <form className="box stack" style={{ marginBottom: 14 }} onSubmit={salvarForn}>
              <div className="grid2" style={{ gap: 12 }}>
                <label className="form-l"><span>Nome</span><input type="text" value={forn.nome ?? ""} onChange={(e) => setForn({ ...forn, nome: e.target.value })} autoFocus /></label>
                <label className="form-l"><span>Tipo</span><select className="f" value={forn.tipo ?? "fornecedor"} onChange={(e) => setForn({ ...forn, tipo: e.target.value })}>{Object.entries(TIPO_FORN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="form-l"><span>CPF / CNPJ</span><input type="text" value={forn.documento ?? ""} onChange={(e) => setForn({ ...forn, documento: e.target.value })} /></label>
                <label className="form-l"><span>Chave PIX</span><input type="text" value={forn.pix ?? ""} onChange={(e) => setForn({ ...forn, pix: e.target.value })} /></label>
                <label className="form-l"><span>E-mail</span><input type="email" value={forn.email ?? ""} onChange={(e) => setForn({ ...forn, email: e.target.value })} /></label>
                <label className="form-l"><span>Telefone</span><input type="text" value={forn.telefone ?? ""} onChange={(e) => setForn({ ...forn, telefone: e.target.value })} /></label>
              </div>
              <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={forn.ativo ?? true} onChange={(e) => setForn({ ...forn, ativo: e.target.checked })} /> Ativo</label>
              <div className="row"><button className="btn dark small" type="submit">Salvar</button><button className="btn small" type="button" onClick={() => setForn(null)}>Cancelar</button></div>
            </form>
          )}
          <div className="lista">
            {base.fornecedores.filter((f) => !qf || `${f.nome} ${f.documento ?? ""}`.toLowerCase().includes(qf)).map((f) => (
              <button key={f.id} type="button" className="item" style={{ opacity: f.ativo ? 1 : 0.5, width: "100%", background: "none", border: 0, font: "inherit", textAlign: "left", cursor: "pointer" }} onClick={() => setForn(f)}>
                <span className="item-t"><strong>{f.nome}</strong><small>{[TIPO_FORN[f.tipo], f.documento, f.pix ? `PIX ${f.pix}` : null].filter(Boolean).join(" · ")}</small></span>
              </button>
            ))}
            {base.fornecedores.length === 0 && <p className="note" style={{ padding: 16, margin: 0 }}>Nenhum fornecedor ainda.</p>}
          </div>
          <p className="note" style={{ marginTop: 10 }}>Marque como Partner quem trabalha por PJ nos projetos: o relatório de pagamentos a Partners usa esse tipo.</p>
        </>
      )}
    </>
  );
}
