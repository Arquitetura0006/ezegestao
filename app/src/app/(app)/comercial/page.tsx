"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp, usePode } from "../ctx";
import { Cabeca, Vazio } from "../ui";
import { erroMsg } from "@/lib/util";
import { TIPOLOGIAS, dia, hoje, moeda, type Cliente } from "@/lib/gestor";
import { CAMPOS_PROP, FUNIL, STATUS_PROP, codigoProp, ponderado, type Proposta, type StatusProp } from "@/lib/comercial";

type Aba = "funil" | "lista" | "painel";
type Novo = { nome: string; tipologia: string; cliente_id: string; contato: string; cidade: string; area: string; valor: string; status: StatusProp };

const num = (s: string) => (s.trim() ? Number(s.replace(/\./g, "").replace(",", ".")) : null);

export default function Comercial() {
  const { esc } = useApp();
  const admin = usePode("comercial");
  const supabase = useMemo(() => supabaseNavegador(), []);
  const router = useRouter();
  const [lista, setLista] = useState<Proposta[] | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [aba, setAba] = useState<Aba>("funil");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<StatusProp | "abertas" | "todas">("abertas");
  const [novo, setNovo] = useState<Novo | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("propostas").select(CAMPOS_PROP).eq("escritorio_id", esc.id).order("codigo", { ascending: false }).limit(2000);
    if (error) setErro(erroMsg(error));
    setLista((data as unknown as Proposta[]) ?? []);
  }, [supabase, esc.id]);

  useEffect(() => {
    carregar();
    supabase.from("clientes").select("id,nome").eq("escritorio_id", esc.id).eq("ativo", true).order("nome").then(({ data }) => setClientes((data as Cliente[]) ?? []));
  }, [carregar, supabase, esc.id]);

  if (!admin) return <Vazio titulo="Sem acesso ao comercial" texto="Peça a permissão do módulo Comercial." />;

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!novo) return;
    if (!novo.nome.trim()) return setErro("Dê um nome à proposta (endereço ou empreendimento).");
    const { data, error } = await supabase.from("propostas").insert({
      escritorio_id: esc.id, nome: novo.nome.trim(), tipologia: novo.tipologia || null, cliente_id: novo.cliente_id || null,
      contato: novo.contato.trim() || null, cidade: novo.cidade.trim() || null, area_m2: num(novo.area), valor: num(novo.valor), status: novo.status,
      etapas: ["DP", "AP", "PL", "GA", "PB", "PE"], validade: new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10),
    }).select("id").single();
    if (error) return setErro(erroMsg(error));
    router.push(`/comercial/${data.id}`);
  }

  async function mover(p: Proposta, s: StatusProp) {
    if (s === "aprovada") return router.push(`/comercial/${p.id}?aprovar=1`);
    if (s === "recusada") return router.push(`/comercial/${p.id}?recusar=1`);
    setLista((l) => (l ?? []).map((x) => (x.id === p.id ? { ...x, status: s } : x)));
    const { error } = await supabase.from("propostas").update({ status: s }).eq("id", p.id);
    if (error) { setErro(erroMsg(error)); carregar(); }
  }

  const q = busca.trim().toLowerCase();
  const casa = (p: Proposta) => !q || `${p.codigo ?? ""} ${p.nome} ${p.tipologia ?? ""} ${p.cliente?.nome ?? ""} ${p.contato ?? ""} ${p.cidade ?? ""}`.toLowerCase().includes(q);
  const todas = (lista ?? []).filter(casa);
  const abertas = (s: StatusProp) => s === "estudo" || s === "aberta" || s === "pendente";

  const Cartao = ({ p }: { p: Proposta }) => (
    <div draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}>
      <Link href={`/comercial/${p.id}`} className="cartao">
        <small className="note">{codigoProp(p)}{p.tipologia ? ` · ${p.tipologia}` : ""}</small>
        <strong>{p.nome}</strong>
        <small className="note">{[p.cliente?.nome, p.contato].filter(Boolean).join(" · ") || "Sem cliente"}</small>
        <span className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
          <strong style={{ fontSize: 13 }}>{p.valor ? moeda(p.valor) : <span className="note">sem valor</span>}</strong>
          {p.proxima_data && abertas(p.status) && <small className={p.proxima_data < hoje() ? "atras" : "note"}>{dia(p.proxima_data)}</small>}
        </span>
      </Link>
    </div>
  );

  // ---------- Painel ----------
  const ano = hoje().slice(0, 4);
  const doAno = (lista ?? []).filter((p) => (p.decidida_em ?? p.created_at).slice(0, 4) === ano);
  const aprov = doAno.filter((p) => p.status === "aprovada");
  const recus = doAno.filter((p) => p.status === "recusada");
  const fechado = aprov.reduce((s, p) => s + Number(p.valor || 0), 0);
  const emAberto = (lista ?? []).filter((p) => abertas(p.status));
  const pipeline = emAberto.reduce((s, p) => s + Number(p.valor || 0), 0);
  const previsto = emAberto.reduce((s, p) => s + ponderado(p), 0);
  const conv = aprov.length + recus.length ? Math.round((aprov.length / (aprov.length + recus.length)) * 100) : 0;
  const ticket = aprov.filter((p) => p.valor).length ? fechado / aprov.filter((p) => p.valor).length : 0;
  const motivos: Record<string, number> = {};
  recus.forEach((p) => (motivos[p.motivo_perda || "Sem motivo"] = (motivos[p.motivo_perda || "Sem motivo"] ?? 0) + 1));
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
  const porMes = meses.map((m) => aprov.filter((p) => (p.decidida_em ?? "").startsWith(m)).reduce((s, p) => s + Number(p.valor || 0), 0));
  const maxMes = Math.max(1, ...porMes);
  const atrasadas = emAberto.filter((p) => p.proxima_data && p.proxima_data < hoje());
  const semAcao = emAberto.filter((p) => !p.proxima_data);

  const painel = (
    <>
      <div className="kpis">
        <div className="kpi"><small>Fechado em {ano}</small><strong>{moeda(fechado) || "R$ 0"}</strong><span>{aprov.length} propostas</span></div>
        <div className="kpi"><small>Em negociação</small><strong>{moeda(pipeline) || "R$ 0"}</strong><span>{emAberto.length} propostas</span></div>
        <div className="kpi"><small>Previsão ponderada</small><strong>{moeda(previsto) || "R$ 0"}</strong><span>valor × probabilidade</span></div>
        <div className="kpi"><small>Conversão {ano}</small><strong>{conv}%</strong><span>{aprov.length} aprovadas / {recus.length} recusadas</span></div>
        <div className="kpi"><small>Ticket médio</small><strong>{moeda(ticket) || "—"}</strong><span>aprovadas com valor</span></div>
      </div>
      <div className="grid2" style={{ marginTop: 18 }}>
        <section className="box">
          <h3 className="sec-t">Fechado por mês · {ano}</h3>
          <div className="barras">
            {porMes.map((v, i) => (
              <div key={i} className="barra-c" title={moeda(v) || "R$ 0"}>
                <i style={{ height: `${(v / maxMes) * 100}%` }} />
                <small>{["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"][i]}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="box">
          <h3 className="sec-t">Funil agora</h3>
          <div className="stack" style={{ gap: 8 }}>
            {FUNIL.map((s) => {
              const xs = (lista ?? []).filter((p) => p.status === s && (abertas(s) || (p.decidida_em ?? "").startsWith(ano)));
              const v = xs.reduce((a, p) => a + Number(p.valor || 0), 0);
              return (
                <div key={s} className="row" style={{ justifyContent: "space-between" }}>
                  <span>{STATUS_PROP[s]}{!abertas(s) ? ` (${ano})` : ""}</span>
                  <span><strong>{xs.length}</strong> <small className="note">· {moeda(v) || "R$ 0"}</small></span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="box">
          <h3 className="sec-t">Por que perdemos · {ano}</h3>
          {Object.keys(motivos).length === 0 ? <p className="note" style={{ margin: 0 }}>Nenhuma recusa no ano.</p> : (
            <div className="stack" style={{ gap: 8 }}>
              {Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([m, n]) => (
                <div key={m} className="row" style={{ justifyContent: "space-between" }}><span>{m}</span><strong>{n}</strong></div>
              ))}
            </div>
          )}
        </section>
        <section className="box">
          <h3 className="sec-t">Precisa de atenção</h3>
          <div className="stack" style={{ gap: 6 }}>
            {atrasadas.slice(0, 8).map((p) => (
              <Link key={p.id} href={`/comercial/${p.id}`} className="row" style={{ justifyContent: "space-between", textDecoration: "none" }}>
                <span>{codigoProp(p)} {p.nome}</span><small className="atras">{dia(p.proxima_data)}</small>
              </Link>
            ))}
            {semAcao.length > 0 && <p className="note" style={{ margin: "6px 0 0" }}>{semAcao.length} propostas em aberto sem próxima ação marcada.</p>}
            {atrasadas.length === 0 && semAcao.length === 0 && <p className="note" style={{ margin: 0 }}>Tudo em dia.</p>}
          </div>
        </section>
      </div>
    </>
  );

  const vis = todas.filter((p) => (filtro === "todas" ? true : filtro === "abertas" ? abertas(p.status) : p.status === filtro));

  return (
    <>
      <Cabeca kicker={esc.nome} titulo="Comercial">
        {!novo && <button className="btn dark" type="button" onClick={() => setNovo({ nome: "", tipologia: "MULTI", cliente_id: "", contato: "", cidade: "", area: "", valor: "", status: "aberta" })}>Nova proposta</button>}
      </Cabeca>

      {novo && (
        <form className="box stack" style={{ marginBottom: 20 }} onSubmit={criar}>
          <div className="grid2" style={{ gap: 12 }}>
            <label className="form-l"><span>Nome (endereço ou empreendimento)</span><input type="text" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} autoFocus placeholder="Rua Flamingo esq. João de Barro" /></label>
            <label className="form-l"><span>Tipologia</span>
              <select className="f" value={novo.tipologia} onChange={(e) => setNovo({ ...novo, tipologia: e.target.value })}><option value="">—</option>{TIPOLOGIAS.map((t) => <option key={t}>{t}</option>)}</select>
            </label>
            <label className="form-l"><span>Cliente</span>
              <select className="f" value={novo.cliente_id} onChange={(e) => setNovo({ ...novo, cliente_id: e.target.value })}><option value="">Escolha ou cadastre em Cadastros</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            </label>
            <label className="form-l"><span>Quem indicou (corretor, imobiliária)</span><input type="text" value={novo.contato} onChange={(e) => setNovo({ ...novo, contato: e.target.value })} /></label>
            <label className="form-l"><span>Cidade</span><input type="text" value={novo.cidade} onChange={(e) => setNovo({ ...novo, cidade: e.target.value })} placeholder="Bombinhas" /></label>
            <label className="form-l"><span>Área (m²)</span><input type="text" inputMode="decimal" value={novo.area} onChange={(e) => setNovo({ ...novo, area: e.target.value })} /></label>
            <label className="form-l"><span>Valor (R$)</span><input type="text" inputMode="decimal" value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} /></label>
            <label className="form-l"><span>Começa como</span>
              <select className="f" value={novo.status} onChange={(e) => setNovo({ ...novo, status: e.target.value as StatusProp })}>
                <option value="estudo">Estudo de viabilidade</option><option value="aberta">Proposta em elaboração</option>
              </select>
            </label>
          </div>
          {erro && <p className="err" role="alert">{erro}</p>}
          <div className="row"><button className="btn dark small" type="submit">Criar e detalhar</button><button className="btn small" type="button" onClick={() => setNovo(null)}>Cancelar</button></div>
        </form>
      )}

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div className="row">
          <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código, nome, cliente ou indicação" style={{ width: 340, maxWidth: "100%" }} aria-label="Buscar proposta" />
          {aba === "lista" && (
            <select className="f" style={{ width: "auto" }} value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} aria-label="Status">
              <option value="abertas">Em negociação</option>
              {FUNIL.map((s) => <option key={s} value={s}>{STATUS_PROP[s]}</option>)}
              <option value="todas">Todas</option>
            </select>
          )}
        </div>
        <div className="tabs seg" role="tablist">
          {([["funil", "Funil"], ["lista", "Lista"], ["painel", "Painel"]] as [Aba, string][]).map(([k, t]) => (
            <button key={k} type="button" className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{t}</button>
          ))}
        </div>
      </div>

      {erro && !novo && <p className="err" role="alert">{erro}</p>}

      {lista === null ? <p className="note">Carregando…</p> : aba === "painel" ? painel : aba === "funil" ? (
        <div className="quadro">
          {FUNIL.map((s) => {
            const col = todas.filter((p) => p.status === s && (abertas(s) || (p.decidida_em ?? p.created_at) >= new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)));
            const v = col.reduce((a, p) => a + Number(p.valor || 0), 0);
            return (
              <section key={s} className="col" onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { const p = todas.find((x) => x.id === e.dataTransfer.getData("text/plain")); if (p && p.status !== s) mover(p, s); }}>
                <h2 className="col-t">{STATUS_PROP[s]} <small>{col.length}{v ? ` · ${moeda(v)}` : ""}</small></h2>
                {!abertas(s) && <small className="note" style={{ margin: "-4px 6px 4px" }}>últimos 90 dias</small>}
                {col.map((p) => <Cartao key={p.id} p={p} />)}
              </section>
            );
          })}
        </div>
      ) : vis.length === 0 ? <Vazio titulo="Nenhuma proposta" /> : (
        <div className="tabela-w">
          <table className="tabela">
            <thead><tr><th>Código</th><th>Proposta</th><th>Cliente</th><th>Indicação</th><th style={{ textAlign: "right" }}>Área</th><th style={{ textAlign: "right" }}>Valor</th><th>Status</th><th>Próxima ação</th></tr></thead>
            <tbody>
              {vis.map((p) => (
                <tr key={p.id} className="clicavel" onClick={() => router.push(`/comercial/${p.id}`)}>
                  <td>{codigoProp(p)}</td>
                  <td><Link href={`/comercial/${p.id}`} className="forte">{p.tipologia ? `[${p.tipologia}] ` : ""}{p.nome}</Link>{p.cidade && <small className="note"> · {p.cidade}</small>}</td>
                  <td>{p.cliente?.nome ?? <span className="note">—</span>}</td>
                  <td>{p.contato ?? <span className="note">—</span>}</td>
                  <td style={{ textAlign: "right" }}>{p.area_m2 ? `${Number(p.area_m2).toLocaleString("pt-BR")} m²` : "—"}</td>
                  <td style={{ textAlign: "right" }}>{p.valor ? moeda(p.valor) : "—"}</td>
                  <td><span className={`pill${p.status === "aprovada" ? " inv" : p.status === "recusada" ? " dash" : ""}`}>{STATUS_PROP[p.status]}</span></td>
                  <td>{p.proxima_data ? <small className={p.proxima_data < hoje() && abertas(p.status) ? "atras" : ""}>{dia(p.proxima_data)} {p.proxima_acao ?? ""}</small> : <span className="note">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
