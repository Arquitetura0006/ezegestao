"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp, usePode } from "../ctx";
import { Avatar, Cabeca, Vazio } from "../ui";
import { erroMsg } from "@/lib/util";
import { STATUS_PROJ, TIPOLOGIAS, dia, nomeProjeto, type Cliente, type StatusProj } from "@/lib/gestor";

type Proj = {
  id: string; codigo: number | null; nome: string; tipologia: string | null; cidade: string | null; status: StatusProj;
  termino: string | null; ativo: boolean;
  cliente: { nome: string } | null;
  membros: { perfil: { nome: string | null; foto_url: string | null } | null }[];
};
type Novo = { nome: string; tipologia: string; cliente_id: string; cidade: string; area_m2: string; valor: string; modelo: boolean };

const STATUS_QUADRO: StatusProj[] = ["pendente", "andamento", "pausado", "finalizado"];

export default function Projetos() {
  const { esc } = useApp();
  const admin = usePode("projetos", true);
  const supabase = useMemo(() => supabaseNavegador(), []);
  const router = useRouter();
  const [lista, setLista] = useState<Proj[] | null>(null);
  const [prog, setProg] = useState<Record<string, number>>({});
  const [etapaAtual, setEtapaAtual] = useState<Record<string, string>>({});
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<StatusProj | "todos" | "arquivados">("andamento");
  const [vista, setVista] = useState<"lista" | "quadro">("lista");
  const [novo, setNovo] = useState<Novo | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const [{ data }, { data: pg }, { data: et }] = await Promise.all([
      supabase
        .from("projetos")
        .select("id,codigo,nome,tipologia,cidade,status,termino,ativo,cliente:clientes(nome),membros:projeto_membros(perfil:perfis(nome,foto_url))")
        .eq("escritorio_id", esc.id)
        .order("codigo", { ascending: false }),
      supabase.from("projeto_progresso").select("projeto_id,progresso"),
      // Etapa em andamento: a primeira etapa com tarefa aberta
      supabase.from("tarefas").select("projeto_id,etapa:projeto_etapas(sigla,nome,ordem)").eq("escritorio_id", esc.id).neq("status", "concluida").not("etapa_id", "is", null),
    ]);
    setLista((data as unknown as Proj[]) ?? []);
    setProg(Object.fromEntries(((pg ?? []) as { projeto_id: string; progresso: number }[]).map((x) => [x.projeto_id, x.progresso])));
    const ea: Record<string, { s: string; o: number }> = {};
    ((et ?? []) as unknown as { projeto_id: string; etapa: { sigla: string | null; nome: string; ordem: number } | null }[]).forEach((x) => {
      if (!x.etapa) return;
      const cur = ea[x.projeto_id];
      if (!cur || x.etapa.ordem < cur.o) ea[x.projeto_id] = { s: x.etapa.sigla || x.etapa.nome, o: x.etapa.ordem };
    });
    setEtapaAtual(Object.fromEntries(Object.entries(ea).map(([k, v]) => [k, v.s])));
  }, [supabase, esc.id]);

  useEffect(() => {
    carregar();
    if (admin) supabase.from("clientes").select("id,nome").eq("escritorio_id", esc.id).eq("ativo", true).order("nome").then(({ data }) => setClientes((data as Cliente[]) ?? []));
  }, [carregar, supabase, esc.id, admin]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!novo) return;
    setErro("");
    if (!novo.nome.trim()) return setErro("Dê um nome ao projeto.");
    const num = (s: string) => (s.trim() ? Number(s.replace(/\./g, "").replace(",", ".")) : null);
    const { data, error } = await supabase
      .from("projetos")
      .insert({
        escritorio_id: esc.id, nome: novo.nome.trim(), tipologia: novo.tipologia || null, cliente_id: novo.cliente_id || null,
        cidade: novo.cidade.trim() || null, area_m2: num(novo.area_m2), valor: num(novo.valor), status: "andamento",
      })
      .select("id")
      .single();
    if (error) return setErro(erroMsg(error));
    if (novo.modelo) await supabase.rpc("aplicar_modelo", { proj: data.id });
    router.push(`/projetos/${data.id}`);
  }

  const q = busca.trim().toLowerCase();
  const vis = (lista ?? []).filter(
    (p) =>
      (filtro === "arquivados" ? !p.ativo : p.ativo) &&
      (vista === "quadro" || filtro === "todos" || filtro === "arquivados" || p.status === filtro) &&
      (!q || `${p.codigo ?? ""} ${p.nome} ${p.tipologia ?? ""} ${p.cliente?.nome ?? ""} ${p.cidade ?? ""}`.toLowerCase().includes(q)),
  );
  const conta = (s: StatusProj) => (lista ?? []).filter((p) => p.ativo && p.status === s).length;
  const nArq = (lista ?? []).filter((p) => !p.ativo).length;

  const Barra = ({ v }: { v: number }) => (
    <span className="prog" aria-label={`${v}% concluído`}><i style={{ width: `${v}%` }} /></span>
  );

  return (
    <>
      <Cabeca kicker={esc.nome} titulo="Projetos">
        {admin && !novo && (
          <button className="btn dark" type="button" onClick={() => setNovo({ nome: "", tipologia: "MULTI", cliente_id: "", cidade: "", area_m2: "", valor: "", modelo: true })}>
            Novo projeto
          </button>
        )}
      </Cabeca>

      {novo && (
        <form className="box stack" style={{ marginBottom: 20 }} onSubmit={criar}>
          <div className="grid2" style={{ gap: 12 }}>
            <label className="form-l"><span>Nome</span><input type="text" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} autoFocus maxLength={120} placeholder="Ex.: Oceana Residence" /></label>
            <label className="form-l"><span>Tipologia</span>
              <select className="f" value={novo.tipologia} onChange={(e) => setNovo({ ...novo, tipologia: e.target.value })}>
                <option value="">—</option>
                {TIPOLOGIAS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="form-l"><span>Cliente</span>
              <select className="f" value={novo.cliente_id} onChange={(e) => setNovo({ ...novo, cliente_id: e.target.value })}>
                <option value="">{clientes.length ? "Escolha" : "Cadastre em Cadastros › Clientes"}</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="form-l"><span>Cidade</span><input type="text" value={novo.cidade} onChange={(e) => setNovo({ ...novo, cidade: e.target.value })} placeholder="Bombinhas" /></label>
            <label className="form-l"><span>Área (m²)</span><input type="text" inputMode="decimal" value={novo.area_m2} onChange={(e) => setNovo({ ...novo, area_m2: e.target.value })} /></label>
            <label className="form-l"><span>Valor do contrato (R$)</span><input type="text" inputMode="decimal" value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} /></label>
          </div>
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={novo.modelo} onChange={(e) => setNovo({ ...novo, modelo: e.target.checked })} />
            <span>Criar etapas e tarefas do processo EZE (DP → PV)</span>
          </label>
          {erro && <p className="err" role="alert">{erro}</p>}
          <div className="row">
            <button className="btn dark small" type="submit">Criar projeto</button>
            <button className="btn small" type="button" onClick={() => setNovo(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {lista && lista.length > 0 && (
        <div className="row" style={{ marginBottom: 16, justifyContent: "space-between" }}>
          <div className="row">
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código, nome, cliente ou cidade" style={{ width: 340, maxWidth: "100%" }} aria-label="Buscar projeto" />
            {vista === "lista" && (
              <select className="f" style={{ width: "auto" }} value={filtro} onChange={(e) => setFiltro(e.target.value as StatusProj | "todos" | "arquivados")} aria-label="Status">
                <option value="todos">Todos ({lista.length - nArq})</option>
                {(Object.keys(STATUS_PROJ) as StatusProj[]).map((s) => <option key={s} value={s}>{STATUS_PROJ[s]} ({conta(s)})</option>)}
                {nArq > 0 && <option value="arquivados">Arquivados ({nArq})</option>}
              </select>
            )}
          </div>
          <div className="tabs seg" role="tablist">
            <button type="button" className={vista === "lista" ? "on" : ""} onClick={() => setVista("lista")}>Lista</button>
            <button type="button" className={vista === "quadro" ? "on" : ""} onClick={() => setVista("quadro")}>Quadro</button>
          </div>
        </div>
      )}

      {lista === null ? (
        <p className="note">Carregando…</p>
      ) : vis.length === 0 ? (
        <Vazio
          titulo={lista.length === 0 ? "Nenhum projeto ainda" : "Nada encontrado"}
          texto={lista.length === 0 ? (admin ? "Cadastre o primeiro projeto ou importe os projetos do Desker." : "Os projetos em que você participa aparecem aqui.") : undefined}
        />
      ) : vista === "lista" ? (
        <div className="tabela-w">
          <table className="tabela">
            <thead>
              <tr><th>Projeto</th><th>Cliente</th><th>Etapa</th><th style={{ width: 150 }}>Progresso</th><th>Entrega</th><th>Equipe</th><th>Status</th></tr>
            </thead>
            <tbody>
              {vis.map((p) => (
                <tr key={p.id} onClick={() => router.push(`/projetos/${p.id}`)} className="clicavel">
                  <td><Link href={`/projetos/${p.id}`} className="forte">{nomeProjeto(p)}</Link>{p.cidade && <small className="note"> · {p.cidade}</small>}</td>
                  <td>{p.cliente?.nome ?? <span className="note">—</span>}</td>
                  <td>{etapaAtual[p.id] ?? <span className="note">—</span>}</td>
                  <td><span className="row" style={{ gap: 8, flexWrap: "nowrap" }}><Barra v={prog[p.id] ?? 0} /><small>{prog[p.id] ?? 0}%</small></span></td>
                  <td>{dia(p.termino) || <span className="note">—</span>}</td>
                  <td>
                    <span className="row" style={{ gap: 0, flexWrap: "nowrap" }}>
                      {p.membros.slice(0, 4).map((m, i) => <span key={i} style={{ marginLeft: i ? -8 : 0 }}><Avatar nome={m.perfil?.nome} foto={m.perfil?.foto_url} size={26} /></span>)}
                      {p.membros.length > 4 && <small className="note" style={{ marginLeft: 6 }}>+{p.membros.length - 4}</small>}
                    </span>
                  </td>
                  <td><span className={`pill${p.status === "andamento" ? " inv" : ""}`}>{STATUS_PROJ[p.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="quadro">
          {STATUS_QUADRO.map((s) => (
            <section key={s} className="col">
              <h2 className="col-t">{STATUS_PROJ[s]} <small>{vis.filter((p) => p.status === s).length}</small></h2>
              {vis.filter((p) => p.status === s).map((p) => (
                <Link key={p.id} href={`/projetos/${p.id}`} className="cartao">
                  <strong>{nomeProjeto(p)}</strong>
                  <small className="note">{[p.cliente?.nome, etapaAtual[p.id]].filter(Boolean).join(" · ") || "—"}</small>
                  <span className="row" style={{ gap: 8, flexWrap: "nowrap", marginTop: 8 }}><Barra v={prog[p.id] ?? 0} /><small>{prog[p.id] ?? 0}%</small></span>
                </Link>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
