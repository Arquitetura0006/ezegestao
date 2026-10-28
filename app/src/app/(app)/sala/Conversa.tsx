"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { Avatar } from "../ui";
import { primeiroNome } from "@/lib/util";

type Msg = { id: string; autor_id: string; texto: string; created_at: string };
type Pessoa = { nome: string; foto: string | null };

const hora = (d: string) => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dia = (d: string) => {
  const x = new Date(d);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 864e5);
  if (x.toDateString() === hoje.toDateString()) return "Hoje";
  if (x.toDateString() === ontem.toDateString()) return "Ontem";
  return x.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
};

// Links clicáveis e @menções destacadas.
function Texto({ t, meu }: { t: string; meu: string }) {
  const partes = t.split(/(https?:\/\/[^\s]+|@[\p{L}]+)/gu);
  return (
    <>
      {partes.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>{p}</a>
        ) : p.startsWith("@") && p.length > 1 ? (
          <strong key={i} className={p.slice(1).toLowerCase() === meu.toLowerCase() ? "mencao eu" : "mencao"}>{p}</strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

export default function Conversa({ gente }: { gente: Record<string, Pessoa> }) {
  const { eu, esc, admin } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [sug, setSug] = useState<string[]>([]);
  const fim = useRef<HTMLDivElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const perto = useRef(true);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("mensagens")
      .select("id,autor_id,texto,created_at")
      .eq("escritorio_id", esc.id)
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) setErro("Conversa indisponível agora.");
    setMsgs(((data as Msg[]) ?? []).reverse());
  }, [supabase, esc.id]);

  useEffect(() => {
    carregar();
    try {
      localStorage.setItem(`ezeg-lido-${esc.id}`, new Date().toISOString());
    } catch {}
    const canal = supabase
      .channel(`conversa-${esc.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens", filter: `escritorio_id=eq.${esc.id}` }, (m) => {
        const n = m.new as Msg;
        setMsgs((l) => (l && !l.some((x) => x.id === n.id) ? [...l, n] : l));
        try {
          localStorage.setItem(`ezeg-lido-${esc.id}`, new Date().toISOString());
        } catch {}
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "mensagens" }, (m) => {
        const id = (m.old as { id?: string }).id;
        if (id) setMsgs((l) => l?.filter((x) => x.id !== id) ?? l);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, esc.id, carregar]);

  useEffect(() => {
    if (perto.current) fim.current?.scrollIntoView({ block: "end" });
  }, [msgs?.length]);

  function rolou() {
    const c = caixa.current;
    if (c) perto.current = c.scrollHeight - c.scrollTop - c.clientHeight < 80;
  }

  async function enviar() {
    const t = texto.trim();
    if (!t) return;
    setErro("");
    setTexto("");
    setSug([]);
    perto.current = true;
    const { data, error } = await supabase.from("mensagens").insert({ escritorio_id: esc.id, autor_id: eu.id, texto: t.slice(0, 2000) }).select("id,autor_id,texto,created_at").single();
    if (error) {
      setTexto(t);
      return setErro("Não foi enviada. Tente de novo.");
    }
    setMsgs((l) => (l && !l.some((x) => x.id === data.id) ? [...l, data as Msg] : l));
  }

  async function apagar(id: string) {
    if (!confirm("Apagar esta mensagem?")) return;
    await supabase.from("mensagens").delete().eq("id", id);
    setMsgs((l) => l?.filter((x) => x.id !== id) ?? l);
  }

  // Sugestão de @menção enquanto digita
  function digitar(v: string) {
    setTexto(v);
    const m = v.match(/@([\p{L}]*)$/u);
    if (!m) return setSug([]);
    const q = m[1].toLowerCase();
    setSug(
      Array.from(new Set(Object.entries(gente).filter(([id]) => id !== eu.id).map(([, p]) => primeiroNome(p.nome))))
        .filter((n) => n.toLowerCase().startsWith(q))
        .slice(0, 6)
    );
  }
  function escolher(n: string) {
    setTexto((v) => v.replace(/@([\p{L}]*)$/u, `@${n} `));
    setSug([]);
    campo.current?.focus();
  }

  const meuNome = primeiroNome(eu.nome);

  return (
    <section className="conversa" aria-label="Conversa da equipe">
      <header className="conversa-h">
        <strong>Conversa da equipe</strong>
        <span className="note">Todos do escritório veem</span>
      </header>

      <div className="conversa-l" ref={caixa} onScroll={rolou} aria-live="polite">
        {msgs === null ? (
          <p className="note" style={{ padding: 16 }}>Carregando…</p>
        ) : msgs.length === 0 ? (
          <p className="note" style={{ padding: 16, textAlign: "center" }}>
            Nenhuma mensagem ainda. Use para assuntos rápidos: “alguém revisa a prancha 3?”. Escreva @nome para chamar a atenção de alguém.
          </p>
        ) : (
          msgs.map((m, i) => {
            const ant = msgs[i - 1];
            const novoDia = !ant || dia(ant.created_at) !== dia(m.created_at);
            const junto = !novoDia && ant && ant.autor_id === m.autor_id && new Date(m.created_at).getTime() - new Date(ant.created_at).getTime() < 5 * 60 * 1000;
            const p = gente[m.autor_id] ?? { nome: "Ex-membro", foto: null };
            const souEu = m.autor_id === eu.id;
            return (
              <div key={m.id}>
                {novoDia && <p className="conversa-dia">{dia(m.created_at)}</p>}
                <div className={`msg${junto ? " junto" : ""}`}>
                  <span className="msg-av">{!junto && <Avatar nome={p.nome} foto={p.foto} size={30} />}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {!junto && (
                      <div className="row" style={{ gap: 8 }}>
                        <strong style={{ fontSize: 13.5 }}>{souEu ? "Você" : p.nome}</strong>
                        <small className="note" style={{ fontSize: 11.5 }}>{hora(m.created_at)}</small>
                      </div>
                    )}
                    <p className="msg-t">
                      <Texto t={m.texto} meu={meuNome} />
                    </p>
                  </div>
                  {(souEu || admin) && (
                    <button className="msg-x" type="button" onClick={() => apagar(m.id)} aria-label="Apagar mensagem" title="Apagar">×</button>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={fim} />
      </div>

      <form
        className="conversa-f"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        {sug.length > 0 && (
          <div className="sug" role="listbox" aria-label="Mencionar">
            {sug.map((n) => (
              <button key={n} type="button" className="pill" style={{ border: 0, cursor: "pointer" }} onClick={() => escolher(n)}>@{n}</button>
            ))}
          </div>
        )}
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => digitar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              enviar();
            }
          }}
          placeholder="Mensagem para a equipe"
          rows={1}
          maxLength={2000}
          aria-label="Mensagem para a equipe"
        />
        <button className="btn dark small" type="submit" disabled={!texto.trim()}>Enviar</button>
      </form>
      {erro && <p className="err" role="alert" style={{ padding: "0 12px 10px", fontSize: 13 }}>{erro}</p>}
    </section>
  );
}
