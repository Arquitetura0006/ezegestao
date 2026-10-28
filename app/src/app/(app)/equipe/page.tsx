"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { Avatar, Cabeca, Vazio } from "../ui";
import { PAPEL, type Papel, dataCurta, erroMsg } from "@/lib/util";

type Membro = { perfil_id: string; papel: Papel; ativo: boolean; created_at: string; perfil: { nome: string | null; email: string | null; foto_url: string | null; cidade: string | null } | null };
type Convite = { id: string; email: string; papel: Papel; created_at: string };

const SITE = "https://www.ezegestao.com.br";

export default function Equipe() {
  const { eu, esc, papel: meuPapel, admin } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [membros, setMembros] = useState<Membro[] | null>(null);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [cred, setCred] = useState<Record<string, number>>({});
  const [totalTrilhas, setTotalTrilhas] = useState(0);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("partner");
  const [msg, setMsg] = useState<{ t: "ok" | "err"; s: string } | null>(null);
  const [copiado, setCopiado] = useState("");
  const [inativos, setInativos] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from("membros")
      .select("perfil_id,papel,ativo,created_at,perfil:perfis(nome,email,foto_url,cidade)")
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

  async function mudarPapel(m: Membro, p: Papel) {
    if (p === "dono" && meuPapel !== "dono") return;
    const { error } = await supabase.from("membros").update({ papel: p }).eq("escritorio_id", esc.id).eq("perfil_id", m.perfil_id);
    if (error) setMsg({ t: "err", s: erroMsg(error) });
    carregar();
  }

  async function alternar(m: Membro) {
    if (m.ativo && !confirm(`Remover ${m.perfil?.nome || "esta pessoa"} do escritório? O acesso é bloqueado na hora; dá para reativar depois.`)) return;
    await supabase.from("membros").update({ ativo: !m.ativo }).eq("escritorio_id", esc.id).eq("perfil_id", m.perfil_id);
    carregar();
  }

  const ativos = (membros ?? []).filter((m) => m.ativo);
  const fora = (membros ?? []).filter((m) => !m.ativo);
  const papeis: Papel[] = meuPapel === "dono" ? ["partner", "recepcao", "admin", "dono"] : ["partner", "recepcao", "admin"];

  return (
    <>
      <Cabeca kicker={esc.nome} titulo="Equipe" />

      {admin && (
        <section className="box" style={{ marginBottom: 24 }}>
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
            A pessoa entra em ezegestao.com.br com este mesmo e-mail e já cai no escritório. Partner vê treinamento, sala e os próprios projetos;
            Recepção atende visitantes; Administrador gerencia tudo.
          </p>
          {msg && <p className={msg.t} role={msg.t === "err" ? "alert" : "status"} style={{ marginTop: 10 }}>{msg.s}</p>}
        </section>
      )}

      {admin && convites.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 className="sec-t">Convites aguardando ({convites.length})</h2>
          <div className="lista">
            {convites.map((c) => (
              <div key={c.id} className="item" style={{ flexWrap: "wrap" }}>
                <span className="avt" style={{ width: 36, height: 36, fontSize: 13 }}>@</span>
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
        </section>
      )}

      <h2 className="sec-t">No escritório ({ativos.length})</h2>
      {membros === null ? (
        <p className="note">Carregando…</p>
      ) : ativos.length <= 1 && !admin ? (
        <Vazio titulo="Só você por enquanto" />
      ) : (
        <div className="lista">
          {ativos.map((m) => {
            const souEu = m.perfil_id === eu.id;
            const podeEditar = admin && !souEu && !(m.papel === "dono" && meuPapel !== "dono");
            return (
              <div key={m.perfil_id} className="item" style={{ flexWrap: "wrap" }}>
                <Avatar nome={m.perfil?.nome} foto={m.perfil?.foto_url} size={38} eu={souEu} />
                <div className="item-t">
                  <strong>{m.perfil?.nome || m.perfil?.email}{souEu ? " (você)" : ""}</strong>
                  <small>
                    {[admin ? m.perfil?.email : null, m.perfil?.cidade].filter(Boolean).join(" · ")}
                    {admin && totalTrilhas > 0 ? ` · ${cred[m.perfil_id] || 0}/${totalTrilhas} trilhas` : ""}
                  </small>
                </div>
                {podeEditar ? (
                  <div className="row">
                    <select className="f" style={{ width: "auto" }} value={m.papel} onChange={(e) => mudarPapel(m, e.target.value as Papel)} aria-label={`Papel de ${m.perfil?.nome}`}>
                      {papeis.map((p) => (
                        <option key={p} value={p}>{PAPEL[p]}</option>
                      ))}
                    </select>
                    <button className="btn small ghost" type="button" onClick={() => alternar(m)}>Remover</button>
                  </div>
                ) : (
                  <span className="pill">{PAPEL[m.papel]}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {admin && fora.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button className="linkbtn note" type="button" onClick={() => setInativos(!inativos)}>
            {inativos ? "Esconder" : "Mostrar"} pessoas removidas ({fora.length})
          </button>
          {inativos && (
            <div className="lista" style={{ marginTop: 10 }}>
              {fora.map((m) => (
                <div key={m.perfil_id} className="item">
                  <Avatar nome={m.perfil?.nome} foto={m.perfil?.foto_url} size={34} />
                  <div className="item-t">
                    <strong>{m.perfil?.nome || m.perfil?.email}</strong>
                    <small>{m.perfil?.email}</small>
                  </div>
                  <button className="btn small" type="button" onClick={() => alternar(m)}>Reativar</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
