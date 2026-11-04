"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../../ctx";
import { Vazio } from "../../ui";
import { dataHora, erroMsg } from "@/lib/util";
import { TIPOLOGIAS, moeda, type Cliente, type Pessoa } from "@/lib/gestor";
import {
  CAMPOS_PROP, MOTIVOS, STATUS_PROP, TIPO_ATIV, codigoProp, reais, valorParcela,
  type Parcela, type Proposta, type StatusProp, type TipoAtiv,
} from "@/lib/comercial";

type EtM = { sigla: string; nome: string; ordem: number };
type Ativ = { id: string; tipo: TipoAtiv; texto: string; created_at: string; autor: { nome: string | null } | null };

const dataBR = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");

export default function PropostaPg({ params }: { params: { id: string } }) {
  const { esc, admin } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const router = useRouter();
  const sp = useSearchParams();
  const [p, setP] = useState<Proposta | null | undefined>(undefined);
  const [orig, setOrig] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [equipe, setEquipe] = useState<Pessoa[]>([]);
  const [etapas, setEtapas] = useState<EtM[]>([]);
  const [ativ, setAtiv] = useState<Ativ[]>([]);
  const [nova, setNova] = useState<{ tipo: TipoAtiv; texto: string }>({ tipo: "ligacao", texto: "" });
  const [recusar, setRecusar] = useState<string | null>(sp.get("recusar") ? MOTIVOS[0] : null);
  const [confAprovar, setConfAprovar] = useState(!!sp.get("aprovar"));
  const [gerar, setGerar] = useState({ entrada: "30", n: "6" });
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const carregar = useCallback(async () => {
    const [{ data }, { data: a }] = await Promise.all([
      supabase.from("propostas").select(CAMPOS_PROP).eq("id", params.id).maybeSingle(),
      supabase.from("proposta_atividades").select("id,tipo,texto,created_at,autor:perfis(nome)").eq("proposta_id", params.id).order("created_at", { ascending: false }),
    ]);
    const x = (data as unknown as Proposta) ?? null;
    if (x) x.parcelas = Array.isArray(x.parcelas) ? x.parcelas : [];
    setP(x);
    setOrig(JSON.stringify(x));
    setAtiv((a as unknown as Ativ[]) ?? []);
  }, [supabase, params.id]);

  useEffect(() => {
    carregar();
    supabase.from("clientes").select("id,nome").eq("escritorio_id", esc.id).order("nome").then(({ data }) => setClientes((data as Cliente[]) ?? []));
    supabase.from("membros").select("perfil:perfis(id,nome,foto_url)").eq("escritorio_id", esc.id).eq("ativo", true)
      .then(({ data }) => setEquipe(((data ?? []) as unknown as { perfil: Pessoa | null }[]).map((x) => x.perfil).filter(Boolean) as Pessoa[]));
    supabase.from("etapas_modelo").select("sigla,nome,ordem").eq("escritorio_id", esc.id).eq("ativo", true).order("ordem").then(({ data }) => setEtapas((data as EtM[]) ?? []));
  }, [carregar, supabase, esc.id]);

  if (!admin) return <Vazio titulo="Só para administradores" />;
  if (p === undefined) return <p className="note">Carregando…</p>;
  if (p === null) return <Vazio titulo="Proposta não encontrada"><Link className="btn small" href="/comercial">Voltar</Link></Vazio>;

  const mudou = JSON.stringify(p) !== orig;
  const set = (x: Partial<Proposta>) => setP({ ...p, ...x });
  const nomeCliente = clientes.find((c) => c.id === p.cliente_id)?.nome ?? p.cliente?.nome ?? "";
  const vm2 = p.valor && p.area_m2 ? Number(p.valor) / Number(p.area_m2) : null;
  const somaParc = p.parcelas.reduce((s, x) => s + (valorParcela(p.valor, x) ?? 0), 0);

  async function salvar() {
    if (!p) return;
    setErro("");
    const { error } = await supabase.from("propostas").update({
      nome: p.nome.trim() || "Sem nome", tipologia: p.tipologia || null, cliente_id: p.cliente_id || null, contato: p.contato || null,
      cidade: p.cidade || null, endereco: p.endereco || null, area_m2: p.area_m2, valor: p.valor, probabilidade: p.probabilidade,
      escopo: p.escopo || null, etapas: p.etapas, prazo: p.prazo || null, validade: p.validade || null, forma_pagamento: p.forma_pagamento || null,
      parcelas: p.parcelas, observacoes: p.observacoes || null, proxima_acao: p.proxima_acao || null, proxima_data: p.proxima_data || null,
      responsavel_id: p.responsavel_id || null,
    }).eq("id", params.id);
    if (error) return setErro(erroMsg(error));
    setOk("Salvo");
    setTimeout(() => setOk(""), 1500);
    carregar();
  }

  async function status(s: StatusProp, extra: Partial<Proposta> = {}) {
    if (mudou) await salvar();
    const { error } = await supabase.from("propostas").update({ status: s, ...extra }).eq("id", params.id);
    if (error) return setErro(erroMsg(error));
    carregar();
  }

  async function aprovar() {
    if (mudou) await salvar();
    const { data, error } = await supabase.rpc("aprovar_proposta", { prop: params.id });
    if (error) return setErro(erroMsg(error));
    setConfAprovar(false);
    router.push(`/projetos/${data}`);
  }

  async function addAtiv(e: React.FormEvent) {
    e.preventDefault();
    if (!nova.texto.trim()) return;
    const { error } = await supabase.from("proposta_atividades").insert({ escritorio_id: esc.id, proposta_id: params.id, tipo: nova.tipo, texto: nova.texto.trim() });
    if (error) return setErro(erroMsg(error));
    setNova({ ...nova, texto: "" });
    carregar();
  }

  function gerarParcelas() {
    if (!p) return;
    const ent = Math.min(100, Math.max(0, Number(gerar.entrada.replace(",", ".")) || 0));
    const n = Math.max(1, Math.min(60, parseInt(gerar.n) || 1));
    const resto = (100 - ent) / n;
    const lista: Parcela[] = [];
    if (ent > 0) lista.push({ descricao: "Entrada", percentual: ent, valor: null, quando: "Na assinatura do contrato" });
    for (let i = 1; i <= n; i++) lista.push({ descricao: `Parcela ${i}/${n}`, percentual: Math.round(resto * 100) / 100, valor: null, quando: `${i * 30} dias após a assinatura` });
    set({ parcelas: lista, forma_pagamento: ent > 0 ? `Entrada de ${ent}% e saldo em ${n} parcelas mensais` : `${n} parcelas mensais` });
  }

  const parc = (i: number, x: Partial<Parcela>) => set({ parcelas: p.parcelas.map((y, j) => (j === i ? { ...y, ...x } : y)) });
  const nEt = (s: string) => etapas.find((e) => e.sigla === s)?.nome ?? s;
  const aberta = p.status === "estudo" || p.status === "aberta" || p.status === "pendente";

  return (
    <div>
      <div className="no-print">
        <p style={{ margin: "0 0 12px" }}><Link href="/comercial" className="note">← Comercial</Link></p>
        <div className="cabeca">
          <div>
            <p className="mono" style={{ marginBottom: 8 }}>{[codigoProp(p), STATUS_PROP[p.status], nomeCliente, p.contato ? `indicação ${p.contato}` : null].filter(Boolean).join(" · ")}</p>
            <h1 className="h-l">{p.tipologia ? `[${p.tipologia}] ` : ""}{p.nome}</h1>
            <div className="resumo">
              <span>Valor <b>{p.valor ? moeda(p.valor) : "—"}</b></span>
              {p.area_m2 && <span>Área <b>{Number(p.area_m2).toLocaleString("pt-BR")} m²</b></span>}
              {vm2 && <span><b>{moeda(vm2)}</b>/m²</span>}
              {p.motivo_perda && p.status === "recusada" && <span>Motivo <b>{p.motivo_perda}</b></span>}
            </div>
          </div>
          <div className="cabeca-acoes">
            {mudou && <button className="btn dark" type="button" onClick={salvar}>Salvar</button>}
            {ok && <span className="note">{ok}</span>}
            <button className="btn" type="button" onClick={() => window.print()}>Imprimir / PDF</button>
            {p.projeto_id && <Link className="btn" href={`/projetos/${p.projeto_id}`}>Ver projeto</Link>}
          </div>
        </div>

        <div className="row" style={{ margin: "4px 0 20px" }}>
          {p.status === "estudo" && <button className="btn small" type="button" onClick={() => status("aberta")}>Virar proposta</button>}
          {(p.status === "estudo" || p.status === "aberta") && <button className="btn small" type="button" onClick={() => status("pendente")}>Marcar como enviada</button>}
          {aberta && <button className="btn small dark" type="button" onClick={() => setConfAprovar(true)}>Aprovar</button>}
          {aberta && <button className="btn small" type="button" onClick={() => setRecusar(MOTIVOS[0])}>Recusar</button>}
          {!aberta && <button className="btn small ghost" type="button" onClick={() => status("pendente", { motivo_perda: null })}>Reabrir</button>}
        </div>

        {confAprovar && aberta && (
          <div className="box stack" style={{ marginBottom: 18 }}>
            <strong>Aprovar e criar o projeto?</strong>
            <p className="note" style={{ margin: 0 }}>
              O projeto nasce com cliente, cidade, área, valor e escopo desta proposta, e com as etapas marcadas ({p.etapas.join(", ") || "todas"}) do processo EZE.
            </p>
            <div className="row"><button className="btn dark small" type="button" onClick={aprovar}>Aprovar e criar projeto</button><button className="btn small" type="button" onClick={() => setConfAprovar(false)}>Cancelar</button></div>
          </div>
        )}
        {recusar !== null && aberta && (
          <div className="box stack" style={{ marginBottom: 18 }}>
            <strong>Por que a proposta foi recusada?</strong>
            <select className="f" value={recusar} onChange={(e) => setRecusar(e.target.value)} style={{ maxWidth: 420 }}>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select>
            <div className="row"><button className="btn dark small" type="button" onClick={() => { status("recusada", { motivo_perda: recusar, probabilidade: 0 }); setRecusar(null); }}>Registrar recusa</button><button className="btn small" type="button" onClick={() => setRecusar(null)}>Cancelar</button></div>
          </div>
        )}
        {erro && <p className="err" role="alert" style={{ marginBottom: 12 }}>{erro}</p>}

        <div className="prop-grid">
          <div className="stack" style={{ gap: 18 }}>
            <section className="box stack">
              <h2 className="sec-t" style={{ margin: 0 }}>Dados</h2>
              <div className="grid2" style={{ gap: 12 }}>
                <label className="form-l"><span>Nome</span><input type="text" value={p.nome} onChange={(e) => set({ nome: e.target.value })} /></label>
                <label className="form-l"><span>Tipologia</span><select className="f" value={p.tipologia ?? ""} onChange={(e) => set({ tipologia: e.target.value || null })}><option value="">—</option>{TIPOLOGIAS.map((t) => <option key={t}>{t}</option>)}</select></label>
                <label className="form-l"><span>Cliente</span><select className="f" value={p.cliente_id ?? ""} onChange={(e) => set({ cliente_id: e.target.value || null })}><option value="">—</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
                <label className="form-l"><span>Indicação</span><input type="text" value={p.contato ?? ""} onChange={(e) => set({ contato: e.target.value })} /></label>
                <label className="form-l"><span>Cidade</span><input type="text" value={p.cidade ?? ""} onChange={(e) => set({ cidade: e.target.value })} /></label>
                <label className="form-l"><span>Endereço</span><input type="text" value={p.endereco ?? ""} onChange={(e) => set({ endereco: e.target.value })} /></label>
                <label className="form-l"><span>Área (m²)</span><input type="number" step="0.01" value={p.area_m2 ?? ""} onChange={(e) => set({ area_m2: e.target.value === "" ? null : Number(e.target.value) })} /></label>
                <label className="form-l"><span>Valor (R$)</span><input type="number" step="0.01" value={p.valor ?? ""} onChange={(e) => set({ valor: e.target.value === "" ? null : Number(e.target.value) })} /></label>
                <label className="form-l"><span>Probabilidade de fechar (%)</span><input type="number" min={0} max={100} step={10} value={p.probabilidade ?? ""} onChange={(e) => set({ probabilidade: e.target.value === "" ? null : Number(e.target.value) })} /></label>
                <label className="form-l"><span>Responsável</span><select className="f" value={p.responsavel_id ?? ""} onChange={(e) => set({ responsavel_id: e.target.value || null })}><option value="">—</option>{equipe.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
                <label className="form-l"><span>Validade da proposta</span><input type="date" value={p.validade ?? ""} onChange={(e) => set({ validade: e.target.value || null })} /></label>
              </div>
            </section>

            <section className="box stack">
              <h2 className="sec-t" style={{ margin: 0 }}>Escopo</h2>
              <div className="etapas-sel">
                {etapas.map((e) => (
                  <label key={e.sigla} className={`pill${p.etapas.includes(e.sigla) ? " inv" : " dash"}`} style={{ cursor: "pointer" }}>
                    <input type="checkbox" style={{ display: "none" }} checked={p.etapas.includes(e.sigla)}
                      onChange={() => set({ etapas: p.etapas.includes(e.sigla) ? p.etapas.filter((s) => s !== e.sigla) : etapas.filter((x) => x.sigla === e.sigla || p.etapas.includes(x.sigla)).map((x) => x.sigla) })} />
                    {e.sigla} · {e.nome}
                  </label>
                ))}
              </div>
              <label className="form-l"><span>Descrição do escopo</span><textarea value={p.escopo ?? ""} onChange={(e) => set({ escopo: e.target.value })} placeholder="O que está incluído e o que não está" /></label>
              <label className="form-l"><span>Prazo</span><input type="text" value={p.prazo ?? ""} onChange={(e) => set({ prazo: e.target.value })} placeholder="Ex.: Anteprojeto em 30 dias a partir do levantamento" /></label>
            </section>

            <section className="box stack">
              <h2 className="sec-t" style={{ margin: 0 }}>Pagamento</h2>
              <div className="row" style={{ alignItems: "flex-end" }}>
                <label className="form-l"><span>Entrada (%)</span><input type="text" inputMode="decimal" value={gerar.entrada} onChange={(e) => setGerar({ ...gerar, entrada: e.target.value })} style={{ width: 90 }} /></label>
                <label className="form-l"><span>Parcelas</span><input type="text" inputMode="numeric" value={gerar.n} onChange={(e) => setGerar({ ...gerar, n: e.target.value })} style={{ width: 80 }} /></label>
                <button className="btn small" type="button" onClick={gerarParcelas}>Gerar parcelas</button>
              </div>
              <label className="form-l"><span>Forma de pagamento</span><input type="text" value={p.forma_pagamento ?? ""} onChange={(e) => set({ forma_pagamento: e.target.value })} /></label>
              {p.parcelas.length > 0 && (
                <div className="tabela-w">
                  <table className="tabela">
                    <thead><tr><th>Parcela</th><th style={{ width: 90 }}>%</th><th style={{ width: 130 }}>Valor fixo</th><th>Quando</th><th style={{ textAlign: "right" }}>Valor</th><th /></tr></thead>
                    <tbody>
                      {p.parcelas.map((x, i) => (
                        <tr key={i}>
                          <td><input type="text" value={x.descricao} onChange={(e) => parc(i, { descricao: e.target.value })} /></td>
                          <td><input type="number" step="0.01" value={x.percentual ?? ""} onChange={(e) => parc(i, { percentual: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                          <td><input type="number" step="0.01" value={x.valor ?? ""} onChange={(e) => parc(i, { valor: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                          <td><input type="text" value={x.quando} onChange={(e) => parc(i, { quando: e.target.value })} /></td>
                          <td style={{ textAlign: "right" }}>{moeda(valorParcela(p.valor, x))}</td>
                          <td><button className="linkbtn" type="button" onClick={() => set({ parcelas: p.parcelas.filter((_, j) => j !== i) })} aria-label="Remover parcela">×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="row" style={{ justifyContent: "space-between" }}>
                <button className="btn small ghost" type="button" onClick={() => set({ parcelas: [...p.parcelas, { descricao: `Parcela ${p.parcelas.length + 1}`, percentual: null, valor: null, quando: "" }] })}>+ Parcela</button>
                {p.parcelas.length > 0 && p.valor && Math.abs(somaParc - Number(p.valor)) > 1 && (
                  <small className="atras">Parcelas somam {moeda(somaParc)}; o valor é {moeda(p.valor)}</small>
                )}
              </div>
            </section>

            <section className="box stack">
              <h2 className="sec-t" style={{ margin: 0 }}>Observações</h2>
              <textarea value={p.observacoes ?? ""} onChange={(e) => set({ observacoes: e.target.value })} placeholder="Condições, o que não está incluído, notas internas" />
            </section>
            {mudou && <div className="row"><button className="btn dark" type="button" onClick={salvar}>Salvar alterações</button></div>}
          </div>

          <aside className="stack" style={{ gap: 18 }}>
            <section className="box stack">
              <h2 className="sec-t" style={{ margin: 0 }}>Próxima ação</h2>
              <input type="text" value={p.proxima_acao ?? ""} onChange={(e) => set({ proxima_acao: e.target.value })} placeholder="Ex.: Ligar para saber da decisão" aria-label="Próxima ação" />
              <input type="date" value={p.proxima_data ?? ""} onChange={(e) => set({ proxima_data: e.target.value || null })} aria-label="Data da próxima ação" />
              {mudou && <button className="btn small dark" type="button" onClick={salvar}>Salvar</button>}
            </section>
            <section className="box stack">
              <h2 className="sec-t" style={{ margin: 0 }}>Histórico</h2>
              <form className="stack" style={{ gap: 8 }} onSubmit={addAtiv}>
                <select className="f" value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as TipoAtiv })} aria-label="Tipo">
                  {(Object.keys(TIPO_ATIV) as TipoAtiv[]).filter((t) => t !== "status").map((t) => <option key={t} value={t}>{TIPO_ATIV[t]}</option>)}
                </select>
                <textarea value={nova.texto} onChange={(e) => setNova({ ...nova, texto: e.target.value })} placeholder="O que aconteceu" style={{ minHeight: 64 }} aria-label="Registro" />
                <button className="btn small" type="submit">Registrar</button>
              </form>
              <div className="stack" style={{ gap: 10 }}>
                {ativ.map((a) => (
                  <div key={a.id} className="ativ">
                    <small className="note">{TIPO_ATIV[a.tipo]} · {dataHora(a.created_at)}{a.autor?.nome ? ` · ${a.autor.nome}` : ""}</small>
                    <p style={{ margin: "2px 0 0", fontSize: 14, whiteSpace: "pre-wrap" }}>{a.texto}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* Documento para impressão / PDF: preto e branco, com o logo */}
      <article className="doc-prop" aria-hidden="true">
        <header className="doc-cab">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="EZE" />
          <div>
            <strong>EZE Arquitetura e Engenharia</strong>
            <span>Bombinhas · SC</span>
          </div>
        </header>
        <h1>Proposta de honorários {codigoProp(p)}</h1>
        <p className="doc-data">{new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
        <table className="doc-tab">
          <tbody>
            <tr><th>Cliente</th><td>{nomeCliente || "—"}</td></tr>
            <tr><th>Empreendimento</th><td>{p.tipologia ? `[${p.tipologia}] ` : ""}{p.nome}</td></tr>
            {(p.endereco || p.cidade) && <tr><th>Local</th><td>{[p.endereco, p.cidade].filter(Boolean).join(" · ")}</td></tr>}
            {p.area_m2 && <tr><th>Área estimada</th><td>{Number(p.area_m2).toLocaleString("pt-BR")} m²</td></tr>}
          </tbody>
        </table>
        {p.etapas.length > 0 && (
          <>
            <h2>Etapas incluídas</h2>
            <ol>{p.etapas.map((s) => <li key={s}>{nEt(s)}</li>)}</ol>
          </>
        )}
        {p.escopo && (<><h2>Escopo</h2><p className="doc-txt">{p.escopo}</p></>)}
        {p.prazo && (<><h2>Prazo</h2><p className="doc-txt">{p.prazo}</p></>)}
        <h2>Investimento</h2>
        <p className="doc-valor">{p.valor ? reais(Number(p.valor)) : "A definir"}{vm2 ? <small> · {reais(vm2)} por m²</small> : null}</p>
        {p.forma_pagamento && <p className="doc-txt">{p.forma_pagamento}</p>}
        {p.parcelas.length > 0 && (
          <table className="doc-tab parc">
            <thead><tr><th>Parcela</th><th>Quando</th><th style={{ textAlign: "right" }}>Valor</th></tr></thead>
            <tbody>
              {p.parcelas.map((x, i) => (
                <tr key={i}><td>{x.descricao}{x.percentual ? ` (${String(x.percentual).replace(".", ",")}%)` : ""}</td><td>{x.quando}</td><td style={{ textAlign: "right" }}>{valorParcela(p.valor, x) != null ? reais(valorParcela(p.valor, x) as number) : "—"}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {p.observacoes && (<><h2>Condições</h2><p className="doc-txt">{p.observacoes}</p></>)}
        {p.validade && <p className="doc-txt">Proposta válida até {dataBR(p.validade)}.</p>}
        <div className="doc-ass">
          <div><span /><strong>Ezequiel Nomi</strong><small>Arquiteto e Urbanista · CAU A140298-6</small><small>EZE Arquitetura e Engenharia</small></div>
          <div><span /><strong>{nomeCliente || "Cliente"}</strong><small>De acordo</small></div>
        </div>
      </article>
    </div>
  );
}
