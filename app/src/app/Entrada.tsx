"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";

export type Capa = {
  nome: string;
  tempo: number;
  aleatorio: boolean;
  pb: boolean;
  imagens: { url: string; mobile: string; x: number; xm: number }[];
};

function horaBombinhas() {
  try {
    return new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function Entrada({ capa, escritorio }: { capa: Capa; escritorio: string }) {
  const router = useRouter();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const n = capa.imagens.length;
  const [idx, setIdx] = useState(0);
  const [carregadas, setCarregadas] = useState<number[]>([0]);
  const [hora, setHora] = useState("");
  const [aba, setAba] = useState<"equipe" | "cliente">("equipe");
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [assunto, setAssunto] = useState("");
  const [msg, setMsg] = useState<{ tipo: "err" | "ok"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const inicio = capa.aleatorio ? Math.floor(Math.random() * n) : 0;
    setIdx(inicio);
    setCarregadas([inicio]);
    const mq = window.matchMedia("(max-width:860px)");
    setMobile(mq.matches);
    setHora(horaBombinhas());
    const relogio = setInterval(() => setHora(horaBombinhas()), 30000);
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let troca: ReturnType<typeof setInterval> | undefined;
    if (!reduz && capa.tempo > 0 && n > 1) {
      troca = setInterval(() => setIdx((i) => (i + 1) % n), capa.tempo * 1000);
    }
    return () => {
      clearInterval(relogio);
      if (troca) clearInterval(troca);
    };
  }, [capa.aleatorio, capa.tempo, n]);

  useEffect(() => {
    setCarregadas((c) => (c.includes(idx) ? c : [...c, idx]));
  }, [idx]);

  async function entrarGoogle() {
    setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setMsg({ tipo: "err", texto: "O login com Google ainda não está ativo. Use o link por e-mail." });
  }

  async function entrarEmail(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setMsg({ tipo: "err", texto: "Informe um e-mail válido." });
      return;
    }
    setEnviando(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setEnviando(false);
    if (error) setMsg({ tipo: "err", texto: "Não foi possível enviar o link agora. Tente de novo em alguns minutos." });
    else setMsg({ tipo: "ok", texto: `Enviamos um link de acesso para ${email.trim()}. Abra o e-mail neste aparelho.` });
  }

  async function visitar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!nome.trim()) {
      setMsg({ tipo: "err", texto: "Informe o seu nome." });
      return;
    }
    setEnviando(true);
    const { data, error } = await supabase.rpc("criar_visita", { esc_slug: escritorio, p_nome: nome, p_assunto: assunto });
    setEnviando(false);
    const v = Array.isArray(data) ? data[0] : null;
    if (error || !v) {
      setMsg({ tipo: "err", texto: "A recepção não está disponível agora. Tente de novo em instantes." });
      return;
    }
    try {
      sessionStorage.setItem("eze-visita", v.token);
    } catch {}
    router.push(`/recepcao?t=${v.token}`);
  }

  return (
    <main className="capa">
      <section className={`capa-hero ${capa.pb ? "pb" : ""}`} aria-label="Capa">
        <div className="capa-img">
          {capa.imagens.map((im, i) =>
            carregadas.includes(i) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                className={i === idx ? "on" : ""}
                src={mobile ? im.mobile : im.url}
                alt="Imagem de projeto da EZE Arquitetura"
                style={{ objectPosition: `${mobile ? im.xm : im.x}% 50%` }}
                decoding="async"
              />
            ) : null
          )}
        </div>
        <div className="capa-scrim" aria-hidden="true" />
        <div className="capa-head">
          <span className="capa-kicker">EZE · Arquitetura e Gestão</span>
        </div>
        <h1 className="capa-title">
          Escritório
          <br />
          virtual
        </h1>
        <div className="capa-cap">
          <span className="chip">Bombinhas, SC · {hora || "--:--"}</span>
          {n > 1 && (
            <span className="dots" role="group" aria-label="Imagens da capa">
              {capa.imagens.map((_, i) => (
                <button key={i} type="button" className={`dot ${i === idx ? "on" : ""}`} aria-label={`Imagem ${i + 1}`} onClick={() => setIdx(i)} />
              ))}
            </span>
          )}
        </div>
      </section>

      <section className="capa-side">
        <div>
          <p className="mono" style={{ marginBottom: 10 }}>Escritório virtual EZE</p>
          <h2>Entre no escritório</h2>
          <p className="note" style={{ margin: "6px 0 0", fontSize: 14 }}>
            Partners entram para trabalhar. Clientes são recebidos na recepção.
          </p>
        </div>
        <div className="tabs" role="tablist" aria-label="Tipo de acesso">
          <button type="button" role="tab" aria-selected={aba === "equipe"} className={aba === "equipe" ? "on" : ""} onClick={() => { setAba("equipe"); setMsg(null); }}>
            Partners e equipe
          </button>
          <button type="button" role="tab" aria-selected={aba === "cliente"} className={aba === "cliente" ? "on" : ""} onClick={() => { setAba("cliente"); setMsg(null); }}>
            Sou cliente
          </button>
        </div>

        {aba === "equipe" ? (
          <div className="form">
            <button type="button" className="btn full" onClick={entrarGoogle}>Entrar com Google</button>
            <div className="sep">ou receba um link por e-mail</div>
            <form className="form" onSubmit={entrarEmail} noValidate>
              <div>
                <label className="l" htmlFor="email">E-mail</label>
                <input id="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <button className="btn dark full" type="submit" disabled={enviando}>{enviando ? "Enviando…" : "Enviar link de acesso"}</button>
            </form>
            <p className="note" style={{ margin: 0 }}>Sem senha: você entra pelo link que chega no seu e-mail.</p>
          </div>
        ) : (
          <form className="form" onSubmit={visitar} noValidate>
            <p style={{ margin: 0, color: "var(--muted)" }}>Visite a EZE como se estivesse aqui: entre na recepção e fale com a nossa equipe por chamada.</p>
            <div>
              <label className="l" htmlFor="nome">Seu nome</label>
              <input id="nome" type="text" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <label className="l" htmlFor="assunto">Empresa ou projeto</label>
              <input id="assunto" type="text" placeholder="Ex.: Residência Costa" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
            </div>
            <button className="btn dark full" type="submit" disabled={enviando}>{enviando ? "Entrando…" : "Entrar na recepção"}</button>
          </form>
        )}
        {msg && <p className={msg.tipo} role={msg.tipo === "err" ? "alert" : "status"}>{msg.texto}</p>}
        <p className="note" style={{ margin: "4px 0 0" }}>{capa.nome} · Bombinhas, SC</p>
      </section>
    </main>
  );
}
