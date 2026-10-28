"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { useOnline } from "../Online";
import { Avatar, Cabeca } from "../ui";
import Conversa from "./Conversa";
import { STATUS, type Status, dataHora, erroMsg, primeiroNome } from "@/lib/util";

type Amb = { id: string; chave: string; nome: string; tipo: string; link_chamada: string | null; grade: string | null; ordem: number };
type Pessoa = { id: string; nome: string; foto: string | null; cidade: string | null };
type Pres = { perfil_id: string; ambiente_id: string | null; status: Status; atualizado_em: string };
type Visita = { id: string; nome: string; assunto: string | null; status: string; ambiente_id: string | null; atendente_id: string | null; chamados: string[]; created_at: string };

const FORA_IC: Record<string, React.ReactNode> = {
  transito: <><path d="M4 28h56v-6l-8-3-8-9H20l-8 9-8 2z" /><path d="M20 10l-6 9h40" /><path d="M32 10v9" /><circle cx="16" cy="29" r="5" fill="#fff" /><circle cx="48" cy="29" r="5" fill="#fff" /></>,
  viagem: <path d="M6 22l10-1 8 7h5l-5-8 14-1 9 10h4l-4-11 9-1c3 0 3-4 0-4l-9-1 4-11h-4L38 11l-14-1 5-8h-5l-8 7-10-1z" />,
  obra: <><path d="M12 30a20 18 0 0 1 40 0z" /><path d="M8 30h48v5H8z" /><path d="M32 12v10M25 14l2 8M39 14l-2 8" /></>,
};
const FORA_SUB: Record<string, string> = {
  transito: "Atende áudio. Sem vídeo nem tela.",
  viagem: "Responde recados. Entra em reunião quando tiver conexão.",
  obra: "Atende ligação rápida.",
};

export default function Sala() {
  const { eu, esc } = useApp();
  const online = useOnline();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const router = useRouter();
  const [ambs, setAmbs] = useState<Amb[]>([]);
  const [gente, setGente] = useState<Record<string, Pessoa>>({});
  const [pres, setPres] = useState<Record<string, Pres>>({});
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [sel, setSel] = useState<string | null>(null); // pessoa selecionada
  const [destino, setDestino] = useState("");
  const [toast, setToast] = useState("");
  const [levar, setLevar] = useState<{ v: string; amb: string; quem: string[] } | null>(null);

  const aviso = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(""), 4000);
  };

  const carregar = useCallback(async () => {
    const [{ data: a }, { data: m }, { data: p }, { data: v }] = await Promise.all([
      supabase.from("ambientes").select("id,chave,nome,tipo,link_chamada,grade,ordem").eq("escritorio_id", esc.id).order("ordem"),
      supabase.from("membros").select("perfil_id, perfil:perfis(id,nome,foto_url,cidade)").eq("escritorio_id", esc.id).eq("ativo", true),
      supabase.from("presenca").select("perfil_id,ambiente_id,status,atualizado_em").eq("escritorio_id", esc.id),
      supabase
        .from("visitas")
        .select("id,nome,assunto,status,ambiente_id,atendente_id,chamados,created_at")
        .eq("escritorio_id", esc.id)
        .neq("status", "encerrada")
        .gt("created_at", new Date(Date.now() - 12 * 3600 * 1000).toISOString())
        .order("created_at"),
    ]);
    setAmbs((a as Amb[]) ?? []);
    const g: Record<string, Pessoa> = {};
    ((m ?? []) as unknown as { perfil: { id: string; nome: string | null; foto_url: string | null; cidade: string | null } | null }[]).forEach((x) => {
      if (x.perfil) g[x.perfil.id] = { id: x.perfil.id, nome: x.perfil.nome || "Sem nome", foto: x.perfil.foto_url, cidade: x.perfil.cidade };
    });
    setGente(g);
    const pr: Record<string, Pres> = {};
    ((p as Pres[]) ?? []).forEach((x) => (pr[x.perfil_id] = x));
    setPres(pr);
    setVisitas((v as Visita[]) ?? []);
    return { ambs: (a as Amb[]) ?? [], pr };
  }, [supabase, esc.id]);

  // Primeira entrada: senta no primeiro ambiente de trabalho.
  useEffect(() => {
    carregar().then(({ ambs, pr }) => {
      if (!pr[eu.id]?.ambiente_id) {
        const primeiro = ambs.find((x) => x.tipo === "sala");
        if (primeiro) mover(primeiro.id, pr[eu.id]?.status ?? "disp");
      }
    });
    const canal = supabase
      .channel(`sala-${esc.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "presenca", filter: `escritorio_id=eq.${esc.id}` }, (m) => {
        const x = (m.new as Pres) ?? null;
        if (x?.perfil_id) setPres((p) => ({ ...p, [x.perfil_id]: x }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "visitas", filter: `escritorio_id=eq.${esc.id}` }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, esc.id, eu.id]);

  useEffect(() => {
    if (window.location.hash === "#recepcao") document.getElementById("recepcao")?.scrollIntoView({ behavior: "smooth" });
  }, [visitas.length]);

  async function mover(ambiente_id: string, status?: Status) {
    const novo: Pres = { perfil_id: eu.id, ambiente_id, status: status ?? pres[eu.id]?.status ?? "disp", atualizado_em: new Date().toISOString() };
    setPres((p) => ({ ...p, [eu.id]: novo }));
    const { error } = await supabase.from("presenca").upsert({ ...novo, escritorio_id: esc.id });
    if (error) aviso(erroMsg(error));
  }

  async function mudarStatus(s: Status) {
    const atual = pres[eu.id];
    await mover(atual?.ambiente_id ?? ambs.find((x) => x.tipo === "sala")?.id ?? "", s);
  }

  function clicarAmb(a: Amb) {
    if (a.tipo === "jardim") return;
    if (a.tipo === "projetos") return router.push("/projetos");
    setSel(null);
    if (pres[eu.id]?.ambiente_id !== a.id) mover(a.id);
  }

  async function chamar(pessoa: Pessoa) {
    const amb = ambs.find((x) => x.id === destino);
    if (!amb) return aviso("Escolha a sala.");
    const { error } = await supabase.from("chamados").insert({ escritorio_id: esc.id, de: eu.id, para: pessoa.id, ambiente_id: amb.id });
    if (error) return aviso(erroMsg(error));
    await mover(amb.id, "reun");
    if (amb.link_chamada) window.open(amb.link_chamada, "_blank", "noopener");
    aviso(`Chamando ${primeiroNome(pessoa.nome)} para ${amb.nome}.`);
    setSel(null);
  }

  // Recepção
  async function atender(v: Visita) {
    const rec = ambs.find((x) => x.tipo === "recepcao");
    await supabase.from("visitas").update({ status: "atendido", atendente_id: eu.id, ambiente_id: rec?.id ?? null, atualizada_em: new Date().toISOString() }).eq("id", v.id);
    if (rec) await mover(rec.id, "reun");
    if (rec?.link_chamada) window.open(rec.link_chamada, "_blank", "noopener");
    carregar();
  }
  async function confirmarLevar() {
    if (!levar) return;
    const amb = ambs.find((x) => x.id === levar.amb);
    if (!amb) return aviso("Escolha a sala de reunião.");
    const chamados = Array.from(new Set([eu.id, ...levar.quem]));
    const { error } = await supabase
      .from("visitas")
      .update({ status: "reuniao", ambiente_id: amb.id, chamados, atendente_id: eu.id, atualizada_em: new Date().toISOString() })
      .eq("id", levar.v);
    if (error) return aviso(erroMsg(error));
    if (levar.quem.length) {
      await supabase.from("chamados").insert(levar.quem.filter((q) => q !== eu.id).map((para) => ({ escritorio_id: esc.id, de: eu.id, para, ambiente_id: amb.id })));
    }
    await mover(amb.id, "reun");
    if (amb.link_chamada) window.open(amb.link_chamada, "_blank", "noopener");
    else aviso(`${amb.nome} está sem link de chamada. Configure em Configurações.`);
    setLevar(null);
    carregar();
  }
  async function encerrar(v: Visita) {
    await supabase.from("visitas").update({ status: "encerrada", atualizada_em: new Date().toISOString() }).eq("id", v.id);
    carregar();
  }

  const meu = pres[eu.id];
  const meuAmb = ambs.find((a) => a.id === meu?.ambiente_id);
  const naPlanta = ambs.filter((a) => a.grade && a.tipo !== "fora");
  const fora = ambs.filter((a) => a.tipo === "fora");
  const reunioes = ambs.filter((a) => a.tipo === "reuniao");
  const quemEm = (id: string) => Object.values(pres).filter((p) => p.ambiente_id === id && gente[p.perfil_id] && online.has(p.perfil_id) && p.status !== "ausente");
  const ausentes = Object.values(gente).filter((g) => !online.has(g.id) || pres[g.id]?.status === "ausente");
  const pessoaSel = sel ? gente[sel] : null;

  function Seat({ p }: { p: Pres }) {
    const g = gente[p.perfil_id];
    const souEu = p.perfil_id === eu.id;
    return (
      <span
        className="seat"
        role="button"
        tabIndex={0}
        title={`${g.nome} · ${STATUS[p.status]}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!souEu) {
            setSel(p.perfil_id);
            setDestino(reunioes[0]?.id ?? "");
          }
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !souEu) {
            e.preventDefault();
            e.stopPropagation();
            setSel(p.perfil_id);
            setDestino(reunioes[0]?.id ?? "");
          }
        }}
      >
        <Avatar nome={g.nome} foto={g.foto} size={34} eu={souEu} />
        <span className={`st st-${p.status}`} aria-hidden="true" />
        <span className="nm">{souEu ? "Você" : primeiroNome(g.nome)}</span>
      </span>
    );
  }

  return (
    <>
      <Cabeca kicker={esc.nome} titulo="Sala">
        <label className="row" style={{ gap: 8 }}>
          <span className="note">Meu status</span>
          <select className="f" style={{ width: "auto" }} value={meu?.status ?? "disp"} onChange={(e) => mudarStatus(e.target.value as Status)}>
            {(Object.keys(STATUS) as Status[]).map((s) => (
              <option key={s} value={s}>{STATUS[s]}</option>
            ))}
          </select>
        </label>
      </Cabeca>

      <div className="sala-grid">
      <div className="sala-main">
      <div className="planta" role="group" aria-label="Planta do escritório">
        {naPlanta.map((a) => {
          const [r1, c1, r2, c2] = (a.grade || "").split("/").map((s) => s.trim());
          const aqui = meu?.ambiente_id === a.id;
          const pessoas = quemEm(a.id);
          const espera = a.tipo === "recepcao" ? visitas.filter((v) => v.status === "aguardando" || v.status === "chamando").length : 0;
          return (
            <button
              key={a.id}
              type="button"
              className={`amb ${a.tipo === "jardim" ? "jardim" : ""} ${aqui ? "aqui" : ""}`}
              style={{ gridRow: `${r1} / ${r2}`, gridColumn: `${c1} / ${c2}` }}
              onClick={() => clicarAmb(a)}
              aria-pressed={aqui}
              aria-label={a.tipo === "jardim" ? "Jardim" : `${a.nome}${aqui ? ", você está aqui" : ""}`}
              tabIndex={a.tipo === "jardim" ? -1 : 0}
            >
              {a.tipo === "jardim" ? (
                <p className="jt">{a.nome}</p>
              ) : (
                <>
                  <h3>
                    {a.nome}
                    {espera > 0 && <span className="pill inv" style={{ marginLeft: 6 }}>{espera}</span>}
                  </h3>
                  {a.tipo === "projetos" ? (
                    <span className="note" style={{ fontSize: 12 }}>Abrir projetos →</span>
                  ) : (
                    pessoas.length > 0 && <div className="seats">{pessoas.map((p) => <Seat key={p.perfil_id} p={p} />)}</div>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {fora.length > 0 && (
        <div className="fora-grid" role="group" aria-label="Fora do escritório">
          {fora.map((a) => {
            const aqui = meu?.ambiente_id === a.id;
            const pessoas = quemEm(a.id);
            return (
              <button key={a.id} type="button" className={`fora-z ${aqui ? "aqui" : ""}`} onClick={() => mover(a.id)} title={FORA_SUB[a.chave] || ""} aria-pressed={aqui}>
                <svg className="fora-ic" viewBox="0 0 64 40" aria-hidden="true">{FORA_IC[a.chave]}</svg>
                <h3 style={{ flex: 1 }}>{a.nome}</h3>
                {pessoas.length > 0 && <div className="seats">{pessoas.map((p) => <Seat key={p.perfil_id} p={p} />)}</div>}
              </button>
            );
          })}
        </div>
      )}

      {/* Painel do meu lugar / pessoa selecionada */}
      <div className="painel" style={{ marginTop: 16 }}>
        {pessoaSel ? (
          <div className="box row" style={{ padding: 16 }}>
            <Avatar nome={pessoaSel.nome} foto={pessoaSel.foto} size={44} />
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <strong>{pessoaSel.nome}</strong>
              <div className="note">
                {STATUS[pres[pessoaSel.id]?.status ?? "disp"]} · {ambs.find((a) => a.id === pres[pessoaSel.id]?.ambiente_id)?.nome ?? "—"}
                {pessoaSel.cidade ? ` · ${pessoaSel.cidade}` : ""}
              </div>
            </div>
            {pres[pessoaSel.id]?.status === "foco" ? (
              <span className="note">Em foco: deixe um recado no projeto.</span>
            ) : (
              <span className="row">
                <select className="f" style={{ width: "auto" }} value={destino} onChange={(e) => setDestino(e.target.value)} aria-label="Sala para a conversa">
                  {reunioes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
                <button className="btn small dark" type="button" onClick={() => chamar(pessoaSel)}>Chamar</button>
              </span>
            )}
            <button className="btn small ghost" type="button" onClick={() => setSel(null)}>Fechar</button>
          </div>
        ) : (
          meuAmb && (
            <div className="box row" style={{ padding: 16, justifyContent: "space-between" }}>
              <span>
                <span className="note">Você está em </span>
                <strong>{meuAmb.nome}</strong>
                <span className="note"> · {STATUS[meu?.status ?? "disp"]}</span>
              </span>
              {meuAmb.link_chamada ? (
                <a className="btn small dark" href={meuAmb.link_chamada} target="_blank" rel="noreferrer">Entrar na conversa</a>
              ) : (
                <span className="note">Sem link de chamada neste ambiente</span>
              )}
            </div>
          )
        )}
      </div>

      <p className="note" style={{ marginTop: 10 }}>
        Clique num ambiente para sentar lá. Clique em alguém para chamar para uma sala de reunião. Áudio e vídeo abrem no link do ambiente; o microfone começa fechado.
      </p>

      {ausentes.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <p className="mono" style={{ marginBottom: 8 }}>Fora da sala agora ({ausentes.length})</p>
          <div className="row" style={{ gap: 12 }}>
            {ausentes.map((g) => (
              <span key={g.id} className="row" style={{ gap: 6, opacity: 0.7 }}>
                <Avatar nome={g.nome} foto={g.foto} size={26} />
                <small>{primeiroNome(g.nome)}</small>
              </span>
            ))}
          </div>
        </section>
      )}

      </div>
      <Conversa gente={gente} />
      </div>

      <section id="recepcao" style={{ marginTop: 32, scrollMarginTop: 24 }}>
        <h2 className="sec-t">Recepção</h2>
        {visitas.length === 0 ? (
          <p className="note">Nenhum visitante agora. Clientes entram pela aba “Sou cliente” na página inicial do site.</p>
        ) : (
          <div className="lista">
            {visitas.map((v) => (
              <div key={v.id} className="item" style={{ flexWrap: "wrap" }}>
                <span className="avt" style={{ width: 38, height: 38, fontSize: 14 }}>{v.nome.trim()[0]?.toUpperCase()}</span>
                <div className="item-t">
                  <strong>{v.nome}</strong>
                  <small>
                    {v.assunto || "Sem assunto"} · {dataHora(v.created_at)} ·{" "}
                    {v.status === "chamando" ? "chamando agora" : v.status === "aguardando" ? "aguardando" : v.status === "atendido" ? `atendido por ${primeiroNome(gente[v.atendente_id || ""]?.nome)}` : `em ${ambs.find((a) => a.id === v.ambiente_id)?.nome ?? "reunião"}`}
                  </small>
                </div>
                <span className="row">
                  {(v.status === "aguardando" || v.status === "chamando") && (
                    <button className={`btn small ${v.status === "chamando" ? "dark" : ""}`} type="button" onClick={() => atender(v)}>Atender</button>
                  )}
                  {v.status !== "reuniao" && (
                    <button className="btn small" type="button" onClick={() => setLevar({ v: v.id, amb: reunioes[0]?.id ?? "", quem: [] })}>Levar para reunião</button>
                  )}
                  <button className="btn small ghost" type="button" onClick={() => encerrar(v)}>Encerrar</button>
                </span>
                {levar?.v === v.id && (
                  <div className="bloco-ed" style={{ width: "100%" }}>
                    <label className="form-l">
                      <span>Sala</span>
                      <select className="f" value={levar.amb} onChange={(e) => setLevar({ ...levar, amb: e.target.value })}>
                        {reunioes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                      </select>
                    </label>
                    <div className="form-l">
                      <span>Chamar também</span>
                      <div className="row">
                        {Object.values(gente).filter((g) => g.id !== eu.id).map((g) => {
                          const on = levar.quem.includes(g.id);
                          return (
                            <button key={g.id} type="button" className={`pill ${on ? "inv" : ""}`} style={{ border: 0, cursor: "pointer" }} aria-pressed={on}
                              onClick={() => setLevar({ ...levar, quem: on ? levar.quem.filter((x) => x !== g.id) : [...levar.quem, g.id] })}>
                              {primeiroNome(g.nome)}{online.has(g.id) ? "" : " (fora)"}
                            </button>
                          );
                        })}
                        {Object.keys(gente).length <= 1 && <span className="note">Ninguém mais na equipe ainda.</span>}
                      </div>
                    </div>
                    <div className="row">
                      <button className="btn small dark" type="button" onClick={confirmarLevar}>Levar e entrar</button>
                      <button className="btn small" type="button" onClick={() => setLevar(null)}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
