"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { Avatar, Cabeca, Vazio } from "../ui";
import { erroMsg } from "@/lib/util";

type Aba = "clientes" | "processo" | "disciplinas" | "equipe";
type Cli = { id: string; nome: string; documento: string | null; email: string | null; telefone: string | null; cidade: string | null; contato: string | null; obs: string | null; ativo: boolean };
type EtM = { id: string; sigla: string; nome: string; ordem: number; peso: number; ativo: boolean };
type TfM = { id: string; etapa_id: string; titulo: string; horas_previstas: number; checklist: string[]; ordem: number };
type Disc = { id: string; nome: string; ordem: number };
type Mem = { perfil_id: string; cargo: string | null; horas_semana: number; perfil: { nome: string | null; foto_url: string | null } | null };

const CLI_VAZIO: Omit<Cli, "id"> = { nome: "", documento: "", email: "", telefone: "", cidade: "", contato: "", obs: "", ativo: true };

export default function Cadastros() {
  const { esc, admin } = useApp();
  const [aba, setAba] = useState<Aba>("clientes");
  if (!admin) return <Vazio titulo="Só para administradores" />;
  return (
    <>
      <Cabeca kicker={esc.nome} titulo="Cadastros" />
      <div className="tabs" role="tablist" style={{ marginBottom: 20 }}>
        {([["clientes", "Clientes"], ["processo", "Processo EZE"], ["disciplinas", "Disciplinas"], ["equipe", "Equipe"]] as [Aba, string][]).map(([k, t]) => (
          <button key={k} type="button" className={aba === k ? "on" : ""} onClick={() => setAba(k)}>{t}</button>
        ))}
      </div>
      {aba === "clientes" && <Clientes />}
      {aba === "processo" && <Processo />}
      {aba === "disciplinas" && <Disciplinas />}
      {aba === "equipe" && <Equipe />}
    </>
  );
}

function Clientes() {
  const { esc } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [lista, setLista] = useState<Cli[] | null>(null);
  const [ed, setEd] = useState<(Omit<Cli, "id"> & { id?: string }) | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("clientes").select("*").eq("escritorio_id", esc.id).order("nome");
    setLista((data as Cli[]) ?? []);
  }, [supabase, esc.id]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!ed) return;
    if (!ed.nome.trim()) return setErro("Informe o nome.");
    const reg = { escritorio_id: esc.id, nome: ed.nome.trim(), documento: ed.documento || null, email: ed.email || null, telefone: ed.telefone || null, cidade: ed.cidade || null, contato: ed.contato || null, obs: ed.obs || null, ativo: ed.ativo };
    const { error } = ed.id ? await supabase.from("clientes").update(reg).eq("id", ed.id) : await supabase.from("clientes").insert(reg);
    if (error) return setErro(erroMsg(error));
    setEd(null);
    setErro("");
    carregar();
  }

  const q = busca.trim().toLowerCase();
  const vis = (lista ?? []).filter((c) => !q || `${c.nome} ${c.documento ?? ""} ${c.cidade ?? ""} ${c.contato ?? ""}`.toLowerCase().includes(q));
  const campo = (k: keyof Omit<Cli, "id" | "ativo">, t: string, tipo = "text") => (
    <label className="form-l"><span>{t}</span><input type={tipo} value={(ed?.[k] as string) ?? ""} onChange={(e) => ed && setEd({ ...ed, [k]: e.target.value })} /></label>
  );

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente" style={{ width: 320 }} aria-label="Buscar cliente" />
        {!ed && <button className="btn dark small" type="button" onClick={() => setEd({ ...CLI_VAZIO })}>Novo cliente</button>}
      </div>
      {ed && (
        <form className="box stack" style={{ marginBottom: 16 }} onSubmit={salvar}>
          <div className="grid2" style={{ gap: 12 }}>
            {campo("nome", "Nome ou razão social")}
            {campo("documento", "CPF ou CNPJ")}
            {campo("contato", "Pessoa de contato")}
            {campo("email", "E-mail", "email")}
            {campo("telefone", "Telefone")}
            {campo("cidade", "Cidade")}
          </div>
          <label className="form-l"><span>Observações</span><textarea value={ed.obs ?? ""} onChange={(e) => setEd({ ...ed, obs: e.target.value })} /></label>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={ed.ativo} onChange={(e) => setEd({ ...ed, ativo: e.target.checked })} /> Ativo</label>
          {erro && <p className="err" role="alert">{erro}</p>}
          <div className="row">
            <button className="btn dark small" type="submit">Salvar</button>
            <button className="btn small" type="button" onClick={() => { setEd(null); setErro(""); }}>Cancelar</button>
          </div>
        </form>
      )}
      {lista === null ? <p className="note">Carregando…</p> : vis.length === 0 ? <Vazio titulo="Nenhum cliente" texto="Cadastre os clientes ou importe do Desker." /> : (
        <div className="lista">
          {vis.map((c) => (
            <button key={c.id} type="button" className="item" onClick={() => setEd(c)} style={{ opacity: c.ativo ? 1 : 0.5 }}>
              <span className="item-t">
                <strong>{c.nome}</strong>
                <small>{[c.documento, c.contato, c.email, c.telefone, c.cidade].filter(Boolean).join(" · ") || "—"}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function Processo() {
  const { esc } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [etapas, setEtapas] = useState<EtM[]>([]);
  const [tfs, setTfs] = useState<TfM[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);
  const [nova, setNova] = useState({ sigla: "", nome: "" });
  const [novaT, setNovaT] = useState({ titulo: "", horas: "1" });
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const [{ data: e }, { data: t }] = await Promise.all([
      supabase.from("etapas_modelo").select("*").eq("escritorio_id", esc.id).order("ordem"),
      supabase.from("tarefas_modelo").select("*").eq("escritorio_id", esc.id).order("ordem"),
    ]);
    setEtapas((e as EtM[]) ?? []);
    setTfs((t as TfM[]) ?? []);
  }, [supabase, esc.id]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const up = async (tab: string, id: string, p: Record<string, unknown>) => {
    const { error } = await supabase.from(tab).update(p).eq("id", id);
    if (error) setErro(erroMsg(error));
    carregar();
  };

  async function addEtapa(e: React.FormEvent) {
    e.preventDefault();
    if (!nova.sigla.trim() || !nova.nome.trim()) return setErro("Informe sigla e nome.");
    const { error } = await supabase.from("etapas_modelo").insert({ escritorio_id: esc.id, sigla: nova.sigla.trim().toUpperCase(), nome: nova.nome.trim(), ordem: etapas.length + 1 });
    if (error) return setErro(erroMsg(error));
    setNova({ sigla: "", nome: "" });
    carregar();
  }

  async function addTarefa(e: React.FormEvent, etapa: string) {
    e.preventDefault();
    if (!novaT.titulo.trim()) return;
    const { error } = await supabase.from("tarefas_modelo").insert({
      escritorio_id: esc.id, etapa_id: etapa, titulo: novaT.titulo.trim(), horas_previstas: Number(novaT.horas.replace(",", ".")) || 0,
      ordem: tfs.filter((t) => t.etapa_id === etapa).length + 1,
    });
    if (error) return setErro(erroMsg(error));
    setNovaT({ titulo: "", horas: "1" });
    carregar();
  }

  return (
    <>
      <p className="note" style={{ marginTop: 0, maxWidth: 720 }}>
        Este é o processo que entra em cada projeto novo. O peso define quanto cada etapa conta no progresso. Mudanças aqui valem para os próximos projetos; os existentes não mudam.
      </p>
      {erro && <p className="err" role="alert">{erro}</p>}
      <div className="lista">
        {etapas.map((e) => {
          const ts = tfs.filter((t) => t.etapa_id === e.id);
          const on = aberta === e.id;
          return (
            <div key={e.id} style={{ opacity: e.ativo ? 1 : 0.5 }}>
              <div className="item">
                <button type="button" className="linkbtn forte" style={{ minWidth: 44, textAlign: "left" }} onClick={() => setAberta(on ? null : e.id)} aria-expanded={on}>{e.sigla}</button>
                <input type="text" defaultValue={e.nome} onBlur={(x) => x.target.value.trim() && x.target.value !== e.nome && up("etapas_modelo", e.id, { nome: x.target.value.trim() })} aria-label={`Nome da etapa ${e.sigla}`} />
                <label className="row" style={{ gap: 6, flexWrap: "nowrap" }}><small className="note">Peso</small>
                  <input type="number" min={0} step={0.5} defaultValue={e.peso} style={{ width: 70 }} onBlur={(x) => Number(x.target.value) !== e.peso && up("etapas_modelo", e.id, { peso: Number(x.target.value) || 0 })} />
                </label>
                <label className="row" style={{ gap: 6, flexWrap: "nowrap" }}><small className="note">Ordem</small>
                  <input type="number" defaultValue={e.ordem} style={{ width: 64 }} onBlur={(x) => Number(x.target.value) !== e.ordem && up("etapas_modelo", e.id, { ordem: Number(x.target.value) || 0 })} />
                </label>
                <small className="note" style={{ whiteSpace: "nowrap" }}>{ts.length} tarefas · {ts.reduce((s, t) => s + Number(t.horas_previstas), 0)}h</small>
                <button className="btn small" type="button" onClick={() => up("etapas_modelo", e.id, { ativo: !e.ativo })}>{e.ativo ? "Desativar" : "Ativar"}</button>
              </div>
              {on && (
                <div style={{ padding: "4px 18px 16px 74px" }}>
                  {ts.map((t) => (
                    <div key={t.id} className="row" style={{ flexWrap: "nowrap", marginBottom: 6 }}>
                      <input type="text" defaultValue={t.titulo} onBlur={(x) => x.target.value.trim() && x.target.value !== t.titulo && up("tarefas_modelo", t.id, { titulo: x.target.value.trim() })} aria-label="Tarefa-modelo" />
                      <input type="number" min={0} step={0.5} defaultValue={t.horas_previstas} style={{ width: 80 }} aria-label="Horas previstas"
                        onBlur={(x) => Number(x.target.value) !== Number(t.horas_previstas) && up("tarefas_modelo", t.id, { horas_previstas: Number(x.target.value) || 0 })} />
                      <small className="note">h</small>
                      <button className="linkbtn" type="button" aria-label={`Remover ${t.titulo}`} onClick={async () => { await supabase.from("tarefas_modelo").delete().eq("id", t.id); carregar(); }}>×</button>
                    </div>
                  ))}
                  <form className="row" style={{ flexWrap: "nowrap", marginTop: 8 }} onSubmit={(x) => addTarefa(x, e.id)}>
                    <input type="text" value={novaT.titulo} onChange={(x) => setNovaT({ ...novaT, titulo: x.target.value })} placeholder="Nova tarefa-modelo" aria-label="Nova tarefa-modelo" />
                    <input type="text" inputMode="decimal" value={novaT.horas} onChange={(x) => setNovaT({ ...novaT, horas: x.target.value })} style={{ width: 80 }} aria-label="Horas" />
                    <button className="btn small" type="submit">Adicionar</button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <form className="row" style={{ marginTop: 14, flexWrap: "nowrap" }} onSubmit={addEtapa}>
        <input type="text" value={nova.sigla} onChange={(e) => setNova({ ...nova, sigla: e.target.value })} placeholder="Sigla" style={{ width: 90 }} maxLength={6} aria-label="Sigla" />
        <input type="text" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="Nome da etapa" aria-label="Nome da etapa" />
        <button className="btn small" type="submit">Adicionar etapa</button>
      </form>
    </>
  );
}

function Disciplinas() {
  const { esc } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [lista, setLista] = useState<Disc[]>([]);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    const { data } = await supabase.from("disciplinas").select("*").eq("escritorio_id", esc.id).order("ordem");
    setLista((data as Disc[]) ?? []);
  }, [supabase, esc.id]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    const { error } = await supabase.from("disciplinas").insert({ escritorio_id: esc.id, nome: nome.trim(), ordem: lista.length + 1 });
    if (error) return setErro(erroMsg(error));
    setNome("");
    carregar();
  }
  return (
    <>
      <p className="note" style={{ marginTop: 0 }}>Só disciplinas técnicas. Cidade e fase ficam no projeto.</p>
      <div className="row">
        {lista.map((d) => (
          <span key={d.id} className="pill" style={{ padding: "6px 8px 6px 12px" }}>
            {d.nome}
            <button className="linkbtn" type="button" aria-label={`Remover ${d.nome}`} onClick={async () => { await supabase.from("disciplinas").delete().eq("id", d.id); carregar(); }}>×</button>
          </span>
        ))}
      </div>
      <form className="row" style={{ marginTop: 14, flexWrap: "nowrap", maxWidth: 480 }} onSubmit={add}>
        <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nova disciplina" aria-label="Nova disciplina" />
        <button className="btn small" type="submit">Adicionar</button>
      </form>
      {erro && <p className="err" role="alert" style={{ marginTop: 8 }}>{erro}</p>}
    </>
  );
}

function Equipe() {
  const { esc } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [lista, setLista] = useState<Mem[]>([]);
  const [valores, setValores] = useState<Record<string, { valor: number; desde: string }>>({});
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const carregar = useCallback(async () => {
    const [{ data }, { data: vh }] = await Promise.all([
      supabase.from("membros").select("perfil_id,cargo,horas_semana,perfil:perfis(nome,foto_url)").eq("escritorio_id", esc.id).eq("ativo", true),
      supabase.from("valores_hora").select("perfil_id,valor,desde").eq("escritorio_id", esc.id).order("desde"),
    ]);
    setLista(((data as unknown as Mem[]) ?? []).sort((a, b) => (a.perfil?.nome || "").localeCompare(b.perfil?.nome || "")));
    const v: Record<string, { valor: number; desde: string }> = {};
    ((vh ?? []) as { perfil_id: string; valor: number; desde: string }[]).forEach((x) => (v[x.perfil_id] = { valor: Number(x.valor), desde: x.desde }));
    setValores(v);
  }, [supabase, esc.id]);

  async function novoValor(perfil: string, txt: string) {
    const valor = Number(txt.replace(/\./g, "").replace(",", "."));
    if (!txt.trim() || isNaN(valor) || valor === valores[perfil]?.valor) return;
    const desde = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("valores_hora").upsert({ escritorio_id: esc.id, perfil_id: perfil, valor, desde }, { onConflict: "escritorio_id,perfil_id,desde" });
    if (error) return setErro(erroMsg(error));
    carregar();
  }

  async function recalcular() {
    const ano = new Date().getFullYear();
    const { data, error } = await supabase.rpc("recalcular_custo", { esc: esc.id, de: "2000-01-01", ate: `${ano}-12-31` });
    if (error) return setErro(erroMsg(error));
    setOk(`${data} lançamentos recalculados.`);
  }
  useEffect(() => {
    carregar();
  }, [carregar]);
  const up = async (id: string, p: Partial<Mem>) => {
    const { error } = await supabase.from("membros").update(p).eq("escritorio_id", esc.id).eq("perfil_id", id);
    if (error) setErro(erroMsg(error));
  };
  return (
    <>
      <p className="note" style={{ marginTop: 0 }}>
        Cargo, horas por semana e valor/hora de cada pessoa. A capacidade alimenta a carga da equipe em Tarefas. O valor/hora é visto só por administradores;
        cada lançamento guarda o valor da data em que foi feito, então mudar o valor vale daqui para frente.
      </p>
      {erro && <p className="err" role="alert">{erro}</p>}
      {ok && <p className="ok" role="status">{ok}</p>}
      <div className="lista">
        {lista.map((m) => (
          <div key={m.perfil_id} className="item">
            <Avatar nome={m.perfil?.nome} foto={m.perfil?.foto_url} size={30} />
            <span className="item-t"><strong>{m.perfil?.nome}</strong></span>
            <input type="text" defaultValue={m.cargo ?? ""} placeholder="Cargo" style={{ width: 200 }} aria-label="Cargo" onBlur={(e) => e.target.value !== (m.cargo ?? "") && up(m.perfil_id, { cargo: e.target.value || null })} />
            <label className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
              <input type="number" min={0} max={80} defaultValue={m.horas_semana} style={{ width: 76 }} aria-label="Horas por semana" onBlur={(e) => Number(e.target.value) !== Number(m.horas_semana) && up(m.perfil_id, { horas_semana: Number(e.target.value) || 0 })} />
              <small className="note">h/sem</small>
            </label>
            <label className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
              <small className="note">R$</small>
              <input type="text" inputMode="decimal" key={valores[m.perfil_id]?.valor ?? "v"} defaultValue={valores[m.perfil_id] ? String(valores[m.perfil_id].valor).replace(".", ",") : ""}
                placeholder="0,00" style={{ width: 90 }} aria-label="Valor por hora" onBlur={(e) => novoValor(m.perfil_id, e.target.value)} />
              <small className="note">/h</small>
            </label>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn small" type="button" onClick={recalcular}>Recalcular o custo de todas as horas com os valores atuais</button>
        <small className="note">Use depois de cadastrar valores pela primeira vez.</small>
      </div>
    </>
  );
}
