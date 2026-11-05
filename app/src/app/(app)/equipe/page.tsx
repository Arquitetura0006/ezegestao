"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp, usePode } from "../ctx";
import { Avatar, Cabeca, Vazio } from "../ui";
import { PAPEL, type Papel, dataCurta, erroMsg } from "@/lib/util";

type Membro = { perfil_id: string; papel: Papel; ativo: boolean; created_at: string; cargo: string | null; horas_semana: number | null; perfil: { nome: string | null; email: string | null; foto_url: string | null; cidade: string | null } | null };
type Convite = { id: string; email: string; papel: Papel; created_at: string };

const SITE = "https://www.ezegestao.com.br";

export default function Equipe() {
  const { eu, esc, papel: meuPapel, admin: souAdmin } = useApp();
  const admin = usePode("equipe", true);
  const verOutros = usePode("equipe");
  const router = useRouter();
  const [aba, setAba] = useState<"pessoas" | "convites" | "removidas">("pessoas");
  const [busca, setBusca] = useState("");
  const [convidando, setConvidando] = useState(false);
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [membros, setMembros] = useState<Membro[] | null>(null);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [cred, setCred] = useState<Record<string, number>>({});
  const [totalTrilhas, setTotalTrilhas] = useState(0);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("partner");
  const [msg, setMsg] = useState<{ t: "ok" | "err"; s: string } | null>(null);
  const [copiado, setCopiado] = useState("");

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from("membros")
      .select("perfil_id,papel,ativo,created_at,cargo,horas_semana,perfil:perfis(nome,email,foto_url,cidade)")
      .eq("escritorio_id", esc.id)
      .order("created_at");
    setMembros((data as unknown as Membro[]) ?? []);
    if (admin) {
      const [{ data: c }, { data: cr }, { count }] = await Promise.all([
        supabase.from("convites").select("id,email,papel,created_at").eq("escritorio_id", esc.id).is("aceito_em", null).order("created_at", { ascending: false }),
        supabase.from("credenciamentos").select("perfil_id").eq("escritorio_id", esc.id),
        supabase.from("trilhas").select("*", { count: "exact", head: true }).eq("escritorio_id", esc.id).eq("publicada", true),
      ]);
      setConvites((c as Convite[]) ?? []);
      const m: Record<string, number> = {};
      (cr ?? []).forEach((x: { perfil_id: string }) => (m[x.perfil_id] = (m[x.perfil_id] || 0) + 1));
      setCred(m);
      setTotalTrilhas(count ?? 0);
    }
  }, [supabase, esc.id, admin]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const textoConvite = (p: Papel) =>
    `Olá! Você foi convidado(a) para o escritório virtual da ${esc.nome} como ${PAPEL[p]}.\n\nEntre em ${SITE} usando este e-mail: clique em "Entrar com Google" (se for uma conta Google) ou peça o link de acesso por e-mail.`;

  async function convidar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return setMsg({ t: "err", s: "Confira o e-mail." });
    if (papel === "dono" && meuPapel !== "dono") return setMsg({ t: "err", s: "Só o dono pode convidar outro dono." });
    if (papel === "admin" && !souAdmin) return setMsg({ t: "err", s: "Só Dono ou Administrador convida administradores." });
    if (membros?.some((m) => m.perfil?.email?.toLowerCase() === em && m.ativo)) return setMsg({ t: "err", s: "Essa pessoa já está na equipe." });
    const { error } = await supabase.from("convites").upsert({ escritorio_id: esc.id, email: em, papel, aceito_em: null }, { onConflict: "escritorio_id,email" });
    if (error) return setMsg({ t: "err", s: erroMsg(error) });
    setEmail("");
    setMsg({ t: "ok", s: `Convite criado para ${em}. Envie a mensagem abaixo para a pessoa.` });
    carregar();
  }

  async function copiar(id: string, p: Papel) {
    try {
      await navigator.clipboard.writeText(textoConvite(p));
      setCopiado(id);
      setTimeout(() => setCopiado(""), 2500);
    } catch {
      setMsg({ t: "err", s: "Não consegui copiar. Selecione o texto e copie manualmente." });
    }
  }

  async function cancelar(id: string) {
    await supabase.from("convites").delete().eq("id", id);
    carregar();
  }

  async function alternar(m: Membro) {
    if (m.ativo && !confirm(`Remover ${m.perfil?.nome || "esta pessoa"} do escritório? O acesso é bloqueado na hora; dá para reativar depois.`)) return;
    await supabase.from("membros").update({ ativo: !m.ativo }).eq("escritorio_id", esc.id).eq("perfil_id", m.perfil_id);
    carregar();
  }

  const ativos = (membros ?? []).filter((m) => m.ativo);
  const fora = (membros ?? []).filter((m) => !m.ativo);
  const papeis: Papel[] = meuPapel === "dono" ? ["partner", "recepcao", "admin", "dono"] : souAdmin ? ["partner", "recepcao", "admin"] : ["partner", "recepcao"];

  const termo = busca.trim().toLowerCase();
  const filtra = (l: Membro[]) => (termo ? l.filter((m) => `${m.perfil?.nome} ${m.perfil?.email} ${m.cargo}`.toLowerCase().includes(termo)) : l);
  const abrir = (m: Membro) => (verOutros || m.perfil_id === eu.id) && router.push(`/equipe/${m.perfil_id}`);

  return (
    <>
      <Cabeca kicker={esc.nome} titulo="Equipe">
        {admin && <button className="btn dark" type="button" onClick={() => setConvidando(!convidando)}>+ Convidar</button>}
      </Cabeca>

      {admin && convidando && (
        <section className="box" style={{ marginBottom: 20 }}>
          <h2 className="sec-t">Convidar pessoa</h2>
          <form className="row" style={{ alignItems: "flex-end" }} onSubmit={convidar}>
            <label className="form-l" style={{ flex: "1 1 260px" }}>
              <span>E-mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com" autoComplete="off" />
            </label>
            <label className="form-l" style={{ flex: "0 1 180px" }}>
              <span>Papel</span>
              <select className="f" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
                {papeis.map((p) => (
                  <option key={p} value={p}>{PAPEL[p]}</option>
                ))}
              </select>
            </label>
            <button className="btn dark" type="submit">Convidar</button>
          </form>
          <p className="note" style={{ margin: "10px 0 0" }}>
            A pessoa entra em ezegestao.com.br com este mesmo e-mail e já cai no escritório. As permissões de cada módulo são ajustadas depois, na página da pessoa › Permissões.
          </p>
        </section>
      )}
      {msg && <p className={msg.t} role={msg.t === "err" ? "alert" : "status"} style={{ marginBottom: 12 }}>{msg.s}</p>}

      <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
        <button type="button" className={aba === "pessoas" ? "on" : ""} onClick={() => setAba("pessoas")}>Colaboradores <span className="pill">{ativos.length}</span></button>
        {admin && <button type="button" className={aba === "convites" ? "on" : ""} onClick={() => setAba("convites")}>Convites <span className="pill">{convites.length}</span></button>}
        {admin && fora.length > 0 && <button type="button" className={aba === "removidas" ? "on" : ""} onClick={() => setAba("removidas")}>Removidos <span className="pill">{fora.length}</span></button>}
      </div>

      {aba !== "convites" && (
        <div className="barra-f">
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa, e-mail ou cargo…" aria-label="Buscar" />
        </div>
      )}

      {aba === "pessoas" && (membros === null ? (
        <p className="note">Carregando…</p>
      ) : (
        <div className="tabela-w">
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cargo</th>
                <th>Papel</th>
                <th>Cidade</th>
                {admin && <th style={{ textAlign: "right" }}>Horas/semana</th>}
                {souAdmin && totalTrilhas > 0 && <th style={{ textAlign: "right" }}>Trilhas</th>}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtra(ativos).map((m) => {
                const souEu = m.perfil_id === eu.id;
                return (
                  <tr key={m.perfil_id} className={verOutros || souEu ? "clicavel" : ""} onClick={() => abrir(m)}>
                    <td>
                      <span className="row" style={{ flexWrap: "nowrap", gap: 12 }}>
                        <Avatar nome={m.perfil?.nome} foto={m.perfil?.foto_url} size={32} eu={souEu} />
                        <span style={{ minWidth: 0 }}>
                          <strong style={{ fontWeight: 500, display: "block" }}>{m.perfil?.nome || m.perfil?.email}{souEu ? " (você)" : ""}</strong>
                          {(admin || souEu) && <small className="note">{m.perfil?.email}</small>}
                        </span>
                      </span>
                    </td>
                    <td>{m.cargo || <span className="note">—</span>}</td>
                    <td><span className="st-pill">{PAPEL[m.papel]}</span></td>
                    <td>{m.perfil?.cidade || <span className="note">—</span>}</td>
                    {admin && <td style={{ textAlign: "right" }} className="valor-n">{m.horas_semana ?? 40} h</td>}
                    {souAdmin && totalTrilhas > 0 && <td style={{ textAlign: "right" }} className="valor-n">{cred[m.perfil_id] || 0}/{totalTrilhas}</td>}
                    <td><span className="st-pill cheio">Ativo</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ativos.length <= 1 && <div style={{ padding: 16 }}><Vazio titulo="Só você por enquanto" texto={admin ? "Use Convidar para trazer a equipe." : undefined} /></div>}
        </div>
      ))}

      {aba === "convites" && admin && (convites.length === 0 ? (
        <Vazio titulo="Nenhum convite aguardando" />
      ) : (
        <div className="lista">
          {convites.map((c) => (
            <div key={c.id} className="item" style={{ flexWrap: "wrap" }}>
              <span className="avt" style={{ width: 32, height: 32, fontSize: 12 }}>@</span>
              <div className="item-t">
                <strong>{c.email}</strong>
                <small>{PAPEL[c.papel]} · convidado em {dataCurta(c.created_at)}</small>
              </div>
              <div className="row">
                <button className="btn small" type="button" onClick={() => copiar(c.id, c.papel)}>{copiado === c.id ? "Copiado" : "Copiar convite"}</button>
                <a className="btn small" href={`mailto:${c.email}?subject=${encodeURIComponent(`Convite: escritório virtual ${esc.nome}`)}&body=${encodeURIComponent(textoConvite(c.papel))}`}>E-mail</a>
                <a className="btn small" href={`https://wa.me/?text=${encodeURIComponent(textoConvite(c.papel))}`} target="_blank" rel="noreferrer">WhatsApp</a>
                <button className="btn small ghost" type="button" onClick={() => cancelar(c.id)}>Cancelar</button>
              </div>
            </div>
          ))}
        </div>
      ))}

      {aba === "removidas" && admin && (
        <div className="lista">
          {filtra(fora).map((m) => (
            <div key={m.perfil_id} className="item">
              <Avatar nome={m.perfil?.nome} foto={m.perfil?.foto_url} size={32} />
              <div className="item-t">
                <strong>{m.perfil?.nome || m.perfil?.email}</strong>
                <small>{m.perfil?.email}</small>
              </div>
              <button className="btn small" type="button" onClick={() => alternar(m)}>Reativar</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
