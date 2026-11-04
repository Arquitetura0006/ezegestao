"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { erroMsg } from "@/lib/util";
import { hoje, nomeProjeto } from "@/lib/gestor";
import { CAMPOS_LANC, TIPO_LANC, brl, parseValor, somaMesesData, type Base, type Lanc, type TipoLanc } from "@/lib/financeiro";

type Repetir = "unica" | "parcelado" | "recorrente";

// Gaveta para criar ou editar um lançamento.
export default function LancEditor({ id, base, inicial, onClose, onSaved, onBase }: {
  id: string | null;                       // null = novo
  base: Base;
  inicial?: Partial<Lanc>;
  onClose: () => void;
  onSaved: () => void;
  onBase: () => void;                      // recarregar cadastros (fornecedor novo)
}) {
  const { esc } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [l, setL] = useState<Partial<Lanc> | null>(id ? null : { tipo: "despesa", vencimento: hoje(), pago_em: null, ...inicial });
  const [valorTxt, setValorTxt] = useState(inicial?.valor ? String(inicial.valor).replace(".", ",") : "");
  const [pago, setPago] = useState(!!inicial?.pago_em);
  const [repetir, setRepetir] = useState<Repetir>("unica");
  const [n, setN] = useState("3");
  const [grupo, setGrupo] = useState<Lanc[]>([]);
  const [aplicarGrupo, setAplicarGrupo] = useState(false);
  const [novoForn, setNovoForn] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!id) return;
    supabase.from("lancamentos").select(CAMPOS_LANC).eq("id", id).maybeSingle().then(async ({ data }) => {
      const x = data as Lanc;
      setL(x);
      setValorTxt(String(x.valor).replace(".", ","));
      setPago(!!x.pago_em);
      if (x.grupo_id) {
        const { data: g } = await supabase.from("lancamentos").select(CAMPOS_LANC).eq("grupo_id", x.grupo_id).order("vencimento");
        setGrupo((g as Lanc[]) ?? []);
      }
    });
  }, [id, supabase]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  if (!l) return <div className="gaveta-fundo" onClick={onClose}><aside className="gaveta"><p className="note">Carregando…</p></aside></div>;

  const set = (x: Partial<Lanc>) => setL({ ...l, ...x });
  const tipo = (l.tipo ?? "despesa") as TipoLanc;
  const cats = base.categorias.filter((c) => c.ativo && c.tipo === tipo);
  const grupos = [...new Set(cats.map((c) => c.grupo))];
  const projetosAtivos = base.projetos.filter((p) => p.ativo || p.id === l.projeto_id);
  const valor = parseValor(valorTxt);
  const nn = Math.max(2, Math.min(120, parseInt(n) || 2));

  async function criarFornecedor() {
    if (!novoForn?.trim()) return;
    const { data, error } = await supabase.from("fornecedores").insert({ escritorio_id: esc.id, nome: novoForn.trim() }).select("id").single();
    if (error) return setErro(erroMsg(error));
    setNovoForn(null);
    onBase();
    set({ fornecedor_id: data.id });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!l) return;
    setErro("");
    if (!l.descricao?.trim()) return setErro("Descreva o lançamento.");
    if (!valor || valor <= 0) return setErro("Informe o valor.");
    if (!l.vencimento) return setErro("Informe a data.");
    if (tipo === "transferencia" && (!l.caixa_id || !l.caixa_destino_id || l.caixa_id === l.caixa_destino_id)) return setErro("Escolha caixas de origem e destino diferentes.");
    const reg = {
      escritorio_id: esc.id, tipo, descricao: l.descricao.trim(), valor, vencimento: l.vencimento,
      pago_em: pago ? l.pago_em || l.vencimento : null, caixa_id: l.caixa_id || null,
      caixa_destino_id: tipo === "transferencia" ? l.caixa_destino_id || null : null,
      categoria_id: tipo === "transferencia" ? null : l.categoria_id || null,
      projeto_id: tipo === "transferencia" ? null : l.projeto_id || null,
      cliente_id: tipo === "receita" ? l.cliente_id || null : null,
      fornecedor_id: tipo === "despesa" ? l.fornecedor_id || null : null,
      documento: l.documento || null, observacao: l.observacao || null, anexo_url: l.anexo_url || null,
    };
    if (id) {
      const { error } = await supabase.from("lancamentos").update(reg).eq("id", id);
      if (error) return setErro(erroMsg(error));
      // Aplica as mudanças comuns às parcelas/recorrências seguintes ainda abertas
      if (aplicarGrupo && l.grupo_id) {
        const { pago_em: _p, vencimento: _v, valor: _val, ...comum } = reg;
        void _p; void _v; void _val;
        const descBase = reg.descricao.replace(/\s*\(\d+\/\d+\)$/, "");
        for (const g of grupo.filter((g) => g.id !== id && !g.pago_em && g.vencimento >= (l.vencimento as string))) {
          const desc = g.parcelas ? `${descBase} (${g.parcela}/${g.parcelas})` : descBase;
          await supabase.from("lancamentos").update({ ...comum, descricao: desc, valor: reg.valor }).eq("id", g.id);
        }
      }
    } else if (repetir === "unica" || tipo === "transferencia") {
      const { error } = await supabase.from("lancamentos").insert(reg);
      if (error) return setErro(erroMsg(error));
    } else {
      const grupo_id = crypto.randomUUID();
      const linhas = [];
      if (repetir === "parcelado") {
        const parte = Math.floor((valor / nn) * 100) / 100;
        const resto = Math.round((valor - parte * nn) * 100) / 100;
        for (let i = 0; i < nn; i++) {
          linhas.push({
            ...reg, valor: Math.round((parte + (i === 0 ? resto : 0)) * 100) / 100, vencimento: somaMesesData(reg.vencimento, i),
            pago_em: i === 0 ? reg.pago_em : null, descricao: `${reg.descricao} (${i + 1}/${nn})`, grupo_id, parcela: i + 1, parcelas: nn, origem: "parcelas",
          });
        }
      } else {
        for (let i = 0; i < nn; i++) {
          linhas.push({ ...reg, vencimento: somaMesesData(reg.vencimento, i), pago_em: i === 0 ? reg.pago_em : null, grupo_id, recorrente: true, origem: "recorrencia" });
        }
      }
      const { error } = await supabase.from("lancamentos").insert(linhas);
      if (error) return setErro(erroMsg(error));
    }
    onSaved();
    onClose();
  }

  async function excluir(todos: boolean) {
    if (!id || !l) return;
    const msg = todos ? "Excluir este e os próximos lançamentos em aberto do mesmo grupo?" : "Excluir este lançamento?";
    if (!confirm(msg)) return;
    if (todos && l.grupo_id) {
      await supabase.from("lancamentos").delete().eq("grupo_id", l.grupo_id).is("pago_em", null).gte("vencimento", l.vencimento as string);
      await supabase.from("lancamentos").delete().eq("id", id);
    } else {
      const { error } = await supabase.from("lancamentos").delete().eq("id", id);
      if (error) return setErro(erroMsg(error));
    }
    onSaved();
    onClose();
  }

  return (
    <div className="gaveta-fundo" onClick={onClose}>
      <aside className="gaveta" role="dialog" aria-modal="true" aria-label="Lançamento" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
          <p className="mono">{id ? "Editar lançamento" : "Novo lançamento"}</p>
          <button className="btn small" type="button" onClick={onClose}>Fechar</button>
        </div>
        <form className="stack" onSubmit={salvar}>
          {!id && (
            <div className="status-linha" role="group" aria-label="Tipo">
              {(["receita", "despesa", "transferencia"] as TipoLanc[]).map((t) => (
                <button key={t} type="button" className={tipo === t ? "on" : ""} onClick={() => set({ tipo: t, categoria_id: null })}>{TIPO_LANC[t]}</button>
              ))}
            </div>
          )}
          <label className="form-l"><span>Descrição</span><input type="text" value={l.descricao ?? ""} onChange={(e) => set({ descricao: e.target.value })} autoFocus={!id} maxLength={200} placeholder={tipo === "receita" ? "Projeto arquitetônico Oceana — parcela" : "Aluguel do escritório"} /></label>
          <div className="grid2" style={{ gap: 12 }}>
            <label className="form-l"><span>{repetir === "parcelado" && !id ? "Valor total (R$)" : "Valor (R$)"}</span><input type="text" inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} placeholder="0,00" /></label>
            <label className="form-l"><span>{tipo === "transferencia" ? "Data" : "Vencimento"}</span><input type="date" value={l.vencimento ?? ""} onChange={(e) => set({ vencimento: e.target.value })} /></label>
            <label className="form-l"><span>{tipo === "transferencia" ? "Sai do caixa" : "Caixa"}</span>
              <select className="f" value={l.caixa_id ?? ""} onChange={(e) => set({ caixa_id: e.target.value || null })}>
                <option value="">Escolha</option>
                {base.caixas.filter((c) => c.ativo || c.id === l.caixa_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            {tipo === "transferencia" ? (
              <label className="form-l"><span>Entra no caixa</span>
                <select className="f" value={l.caixa_destino_id ?? ""} onChange={(e) => set({ caixa_destino_id: e.target.value || null })}>
                  <option value="">Escolha</option>
                  {base.caixas.filter((c) => c.ativo && c.id !== l.caixa_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </label>
            ) : (
              <label className="form-l"><span>Categoria</span>
                <select className="f" value={l.categoria_id ?? ""} onChange={(e) => set({ categoria_id: e.target.value || null })}>
                  <option value="">Escolha</option>
                  {grupos.map((g) => (
                    <optgroup key={g} label={g}>{cats.filter((c) => c.grupo === g).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</optgroup>
                  ))}
                </select>
              </label>
            )}
            {tipo !== "transferencia" && (
              <label className="form-l"><span>Projeto</span>
                <select className="f" value={l.projeto_id ?? ""} onChange={(e) => set({ projeto_id: e.target.value || null })}>
                  <option value="">{tipo === "receita" ? "Escolha o projeto" : "Despesa geral do escritório"}</option>
                  {projetosAtivos.map((p) => <option key={p.id} value={p.id}>{nomeProjeto(p)}</option>)}
                </select>
              </label>
            )}
            {tipo === "receita" && (
              <label className="form-l"><span>Cliente</span>
                <select className="f" value={l.cliente_id ?? ""} onChange={(e) => set({ cliente_id: e.target.value || null })}>
                  <option value="">—</option>
                  {base.clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </label>
            )}
            {tipo === "despesa" && (
              <label className="form-l"><span>Fornecedor / Partner</span>
                {novoForn === null ? (
                  <select className="f" value={l.fornecedor_id ?? ""} onChange={(e) => (e.target.value === "__novo" ? setNovoForn("") : set({ fornecedor_id: e.target.value || null }))}>
                    <option value="">—</option>
                    <option value="__novo">+ Cadastrar novo…</option>
                    {base.fornecedores.filter((f) => f.ativo || f.id === l.fornecedor_id).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                ) : (
                  <span className="row" style={{ flexWrap: "nowrap" }}>
                    <input type="text" value={novoForn} onChange={(e) => setNovoForn(e.target.value)} placeholder="Nome" autoFocus />
                    <button className="btn small" type="button" onClick={criarFornecedor}>Criar</button>
                  </span>
                )}
              </label>
            )}
          </div>

          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={pago} onChange={(e) => { setPago(e.target.checked); if (e.target.checked && !l.pago_em) set({ pago_em: hoje() }); }} />
            <span>{tipo === "receita" ? "Já recebido" : tipo === "despesa" ? "Já pago" : "Já transferido"}</span>
            {pago && <input type="date" value={l.pago_em ?? ""} onChange={(e) => set({ pago_em: e.target.value })} style={{ width: 160 }} aria-label="Data do pagamento" />}
          </label>

          {!id && tipo !== "transferencia" && (
            <div className="box stack" style={{ padding: 14, gap: 10 }}>
              <div className="status-linha" role="group" aria-label="Repetição">
                <button type="button" className={repetir === "unica" ? "on" : ""} onClick={() => setRepetir("unica")}>Única</button>
                <button type="button" className={repetir === "parcelado" ? "on" : ""} onClick={() => setRepetir("parcelado")}>Parcelado</button>
                <button type="button" className={repetir === "recorrente" ? "on" : ""} onClick={() => setRepetir("recorrente")}>Todo mês</button>
              </div>
              {repetir !== "unica" && (
                <label className="row" style={{ gap: 8 }}>
                  <input type="text" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} style={{ width: 70 }} aria-label="Quantidade" />
                  <span className="note">
                    {repetir === "parcelado" ? `parcelas mensais de ${valor ? brl(valor / nn) : "—"}` : `meses de ${valor ? brl(valor) : "—"} (até ${l.vencimento ? somaMesesData(l.vencimento, nn - 1).split("-").reverse().join("/") : "—"})`}
                  </span>
                </label>
              )}
            </div>
          )}

          <div className="grid2" style={{ gap: 12 }}>
            <label className="form-l"><span>Nota fiscal / documento</span><input type="text" value={l.documento ?? ""} onChange={(e) => set({ documento: e.target.value })} /></label>
            <label className="form-l"><span>Link do comprovante</span><input type="url" value={l.anexo_url ?? ""} onChange={(e) => set({ anexo_url: e.target.value })} placeholder="Drive, e-mail…" /></label>
          </div>
          <label className="form-l"><span>Observação</span><textarea value={l.observacao ?? ""} onChange={(e) => set({ observacao: e.target.value })} style={{ minHeight: 60 }} /></label>

          {id && l.grupo_id && grupo.length > 1 && (
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={aplicarGrupo} onChange={(e) => setAplicarGrupo(e.target.checked)} />
              <span>Aplicar também aos próximos em aberto ({grupo.filter((g) => !g.pago_em && g.id !== id && g.vencimento >= (l.vencimento as string)).length})</span>
            </label>
          )}

          {erro && <p className="err" role="alert">{erro}</p>}
          <div className="row">
            <button className="btn dark" type="submit">Salvar</button>
            {id && <button className="btn small ghost" type="button" onClick={() => excluir(false)} style={{ marginLeft: "auto" }}>Excluir</button>}
            {id && l.grupo_id && <button className="btn small ghost" type="button" onClick={() => excluir(true)}>Excluir este e os próximos</button>}
          </div>
        </form>
      </aside>
    </div>
  );
}
