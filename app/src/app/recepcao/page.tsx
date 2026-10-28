"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";

type Visita = {
  id: string;
  nome: string;
  assunto: string | null;
  status: "aguardando" | "chamando" | "atendido" | "reuniao" | "encerrada";
  ambiente: string | null;
  link: string | null;
  chamados: { nome: string; foto: string | null }[];
};

const iniciais = (n: string) =>
  n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function Tile({ nome, sub, foto, ring }: { nome: string; sub: string; foto?: string | null; ring?: boolean }) {
  return (
    <div className={`tile ${ring ? "ring" : ""}`}>
      <span className="av">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {foto ? <img src={foto} alt="" /> : iniciais(nome)}
      </span>
      <p style={{ margin: "14px 0 0", fontWeight: 600 }}>{nome}</p>
      <p style={{ margin: "2px 0 0", fontSize: 13, color: "#B9BCC2" }}>{sub}</p>
    </div>
  );
}

function Recepcao() {
  const params = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [token, setToken] = useState<string | null>(null);
  const [v, setV] = useState<Visita | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let t = params.get("t");
    try {
      if (!t) t = sessionStorage.getItem("eze-visita");
    } catch {}
    if (!t) router.replace("/");
    else setToken(t);
  }, [params, router]);

  const carregar = useCallback(async () => {
    if (!token) return;
    const { data, error } = await supabase.rpc("ver_visita", { p_token: token });
    if (error) setErro("Não foi possível falar com a recepção agora.");
    else setV(Array.isArray(data) && data[0] ? (data[0] as Visita) : null);
  }, [supabase, token]);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 3000);
    return () => clearInterval(t);
  }, [carregar]);

  async function acao(a: "chamar" | "cancelar" | "sair") {
    if (!token) return;
    await supabase.rpc("visita_acao", { p_token: token, p_acao: a });
    if (a === "sair") {
      try {
        sessionStorage.removeItem("eze-visita");
      } catch {}
      router.replace("/");
      return;
    }
    carregar();
  }

  const primeiro = v?.nome.split(" ")[0] ?? "";
  return (
    <main className="wrap" style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <span className="mono">EZE · Arquitetura e Gestão</span>
        <button className="btn" type="button" onClick={() => acao("sair")}>Sair</button>
      </div>
      {erro && <p className="err" role="alert">{erro}</p>}
      {!v && !erro && <p className="note">Carregando a recepção…</p>}
      {v && (
        <>
          <p className="mono" style={{ marginBottom: 10 }}>{v.status === "reuniao" ? "Sala de reunião" : "Recepção"}</p>
          {v.status === "aguardando" && (
            <>
              <h1 className="h-l" style={{ marginBottom: 24 }}>Bem-vindo(a), {primeiro}.</h1>
              <div className="call" style={{ maxWidth: 420 }}><Tile nome="Recepção" sub="Disponível" /></div>
              <button className="btn dark" type="button" style={{ marginTop: 20, minHeight: 52 }} onClick={() => acao("chamar")}>Chamar a recepção</button>
            </>
          )}
          {v.status === "chamando" && (
            <>
              <h1 className="h-l" style={{ marginBottom: 24 }}>Chamando a recepção…</h1>
              <div className="call" style={{ maxWidth: 420 }}><Tile nome="Recepção" sub="Chamando…" ring /></div>
              <button className="btn" type="button" style={{ marginTop: 20 }} onClick={() => acao("cancelar")}>Cancelar</button>
            </>
          )}
          {v.status === "atendido" && (
            <>
              <h1 className="h-l" style={{ marginBottom: 24 }}>A recepção atendeu.</h1>
              <div className="call"><Tile nome="Recepção" sub="EZE Arquitetura e Gestão" /><Tile nome={v.nome} sub="Você" /></div>
              <p style={{ marginTop: 16 }}>Você será levado(a) para a sala de reunião em instantes.</p>
              {v.link && (
                <a className="btn dark" href={v.link} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>Entrar na chamada de vídeo</a>
              )}
            </>
          )}
          {v.status === "reuniao" && (
            <>
              <h1 className="h-l" style={{ marginBottom: 8 }}>{v.ambiente ?? "Sala de reunião"}</h1>
              <p className="note" style={{ marginBottom: 20 }}>{v.chamados.length ? "Com " + v.chamados.map((c) => c.nome).join(", ") : "Aguardando a equipe entrar"}</p>
              <div className="call">
                {v.chamados.map((c, i) => <Tile key={i} nome={c.nome} sub="EZE Arquitetura e Gestão" foto={c.foto} />)}
                <Tile nome={v.nome} sub="Você" />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                {v.link && (
                  <a className="btn dark" href={v.link} target="_blank" rel="noreferrer" style={{ minHeight: 52 }}>Entrar na chamada de vídeo</a>
                )}
                <button className="btn" type="button" onClick={() => acao("sair")}>Sair da reunião</button>
              </div>
            </>
          )}
          {v.status === "encerrada" && (
            <>
              <h1 className="h-l">Obrigado pela visita.</h1>
              <button className="btn dark" type="button" style={{ marginTop: 20 }} onClick={() => acao("sair")}>Voltar ao início</button>
            </>
          )}
        </>
      )}
    </main>
  );
}

export default function Pagina() {
  return (
    <Suspense fallback={<main className="wrap"><p className="note">Carregando a recepção…</p></main>}>
      <Recepcao />
    </Suspense>
  );
}
