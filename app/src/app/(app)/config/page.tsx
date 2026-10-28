"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { Cabeca, Vazio } from "../ui";
import { erroMsg } from "@/lib/util";

type Amb = { id: string; nome: string; tipo: string; link_chamada: string | null; ordem: number };
const TIPO: Record<string, string> = { sala: "Trabalho", reuniao: "Reunião", recepcao: "Recepção", jardim: "Jardim", projetos: "Projetos", fora: "Fora do escritório" };

export default function Config() {
  const { esc, admin } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [nome, setNome] = useState(esc.nome);
  const [ambs, setAmbs] = useState<Amb[] | null>(null);
  const [orig, setOrig] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ t: "ok" | "err"; s: string } | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("ambientes").select("id,nome,tipo,link_chamada,ordem").eq("escritorio_id", esc.id).order("ordem");
    const a = (data as Amb[]) ?? [];
    setAmbs(a);
    setOrig(Object.fromEntries(a.map((x) => [x.id, `${x.nome}|${x.link_chamada ?? ""}`])));
  }, [supabase, esc.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!admin) return <Vazio titulo="Só administradores acessam as configurações." />;

  async function salvarNome(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("escritorios").update({ nome: nome.trim() || esc.nome }).eq("id", esc.id);
    setMsg(error ? { t: "err", s: erroMsg(error) } : { t: "ok", s: "Nome salvo. Recarregue a página para ver em todo o sistema." });
  }

  async function salvarAmbs() {
    if (!ambs) return;
    setMsg(null);
    const mud = ambs.filter((a) => orig[a.id] !== `${a.nome}|${a.link_chamada ?? ""}`);
    for (const a of mud) {
      const link = (a.link_chamada || "").trim();
      if (link && !/^https?:\/\//.test(link)) return setMsg({ t: "err", s: `O link de ${a.nome} precisa começar com https://` });
      const { error } = await supabase.from("ambientes").update({ nome: a.nome.trim() || "Sem nome", link_chamada: link || null }).eq("id", a.id);
      if (error) return setMsg({ t: "err", s: erroMsg(error) });
    }
    setMsg({ t: "ok", s: mud.length ? `${mud.length} ambiente(s) salvo(s).` : "Nada mudou." });
    carregar();
  }

  const editaveis = (ambs ?? []).filter((a) => a.tipo !== "jardim" && a.tipo !== "projetos");

  return (
    <>
      <Cabeca kicker={esc.nome} titulo="Configurações" />

      <form className="box row" style={{ marginBottom: 24, alignItems: "flex-end" }} onSubmit={salvarNome}>
        <label className="form-l" style={{ flex: "1 1 260px" }}>
          <span>Nome do escritório</span>
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
        </label>
        <button className="btn" type="submit">Salvar nome</button>
      </form>

      <section className="box">
        <h2 className="sec-t">Links de chamada dos ambientes</h2>
        <p className="note" style={{ marginTop: -4 }}>
          Crie uma reunião fixa no Google Meet para cada ambiente (em meet.google.com, “Criar uma reunião para depois”) e cole o link aqui.
          Quem entra no ambiente vê o botão “Entrar na conversa”. As salas de reunião e a recepção são as mais importantes.
        </p>
        {ambs === null ? (
          <p className="note">Carregando…</p>
        ) : (
          <div className="stack" style={{ marginTop: 12 }}>
            {editaveis.map((a, i) => (
              <div key={a.id} className="grid2" style={{ gap: 10, alignItems: "end", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr)" }}>
                <label className="form-l">
                  <span>{TIPO[a.tipo] ?? a.tipo}</span>
                  <input type="text" value={a.nome} onChange={(e) => setAmbs(ambs.map((x) => (x.id === a.id ? { ...x, nome: e.target.value } : x)))} aria-label={`Nome do ambiente ${i + 1}`} />
                </label>
                <label className="form-l">
                  <span className="note" style={{ fontWeight: 500 }}>Link do Meet</span>
                  <input type="url" value={a.link_chamada ?? ""} placeholder="https://meet.google.com/…" onChange={(e) => setAmbs(ambs.map((x) => (x.id === a.id ? { ...x, link_chamada: e.target.value } : x)))} />
                </label>
              </div>
            ))}
            <div className="row">
              <button className="btn dark" type="button" onClick={salvarAmbs}>Salvar ambientes</button>
            </div>
          </div>
        )}
      </section>
      {msg && <p className={msg.t} role={msg.t === "err" ? "alert" : "status"} style={{ marginTop: 12 }}>{msg.s}</p>}
    </>
  );
}
