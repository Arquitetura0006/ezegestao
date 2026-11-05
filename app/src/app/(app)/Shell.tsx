"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { Contexto, type Ctx } from "./ctx";
import { Avatar } from "./ui";
import Chamadas from "./Chamadas";
import Cronometro from "./Cronometro";
import { OnlineProvider } from "./Online";
import { MODELO_URL, PAPEL } from "@/lib/util";
import { podeCom, type Modulo } from "@/lib/permissoes";
import Busca from "./Busca";

export const I = {
  inicio: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  padroes: <path d="M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z" />,
  sala: <path d="M3 4h18v16H3zM3 12h8M11 4v16M15 12v8" />,
  projetos: <path d="M3 7h7l2 2h9v11H3z" />,
  equipe: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c2 .6 3.2 2.3 3.5 5.2" />,
  config: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />,
  tarefas: <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />,
  horas: <path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2.5M9.5 2.5h5" />,
  comercial: <path d="M3 7h18v12H3zM8 7V5h8v2M3 12h18" />,
  financeiro: <path d="M3 6h18v12H3zM3 10h18M7 15h3" />,
  cadastros: <path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />,
  modelo: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
};

export function Ic({ d }: { d: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}

export default function Shell({ ctx, children }: { ctx: Ctx; children: React.ReactNode }) {
  const path = usePathname();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [naoLidas, setNaoLidas] = useState(0);
  const naSala = path === "/sala";

  // Mensagens novas da conversa da equipe enquanto você está em outra tela.
  useEffect(() => {
    if (naSala) {
      setNaoLidas(0);
      return;
    }
    let desde = new Date(Date.now() - 864e5).toISOString();
    try {
      desde = localStorage.getItem(`ezeg-lido-${ctx.esc.id}`) || desde;
    } catch {}
    supabase
      .from("mensagens")
      .select("*", { count: "exact", head: true })
      .eq("escritorio_id", ctx.esc.id)
      .neq("autor_id", ctx.eu.id)
      .gt("created_at", desde)
      .then(({ count }) => setNaoLidas(count ?? 0));
    const canal = supabase
      .channel(`badge-${ctx.esc.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens", filter: `escritorio_id=eq.${ctx.esc.id}` }, (m) => {
        if ((m.new as { autor_id: string }).autor_id !== ctx.eu.id) setNaoLidas((n) => n + 1);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, naSala, ctx.esc.id, ctx.eu.id]);
  const pode = (m: Modulo) => podeCom(ctx.papel, ctx.acessoFin, ctx.perm, m);
  const itens = [
    { href: "/inicio", t: "Início", ic: I.inicio },
    { href: "/sala", t: "Sala", ic: I.sala },
    { href: "/equipe", t: "Equipe", ic: I.equipe },
    ...(pode("comercial") ? [{ href: "/comercial", t: "Comercial", ic: I.comercial }] : []),
    { href: "/projetos", t: "Projetos", ic: I.projetos },
    { href: "/tarefas", t: "Planejamento", ic: I.tarefas },
    { href: "/horas", t: "Horas", ic: I.horas },
    ...(pode("financeiro") ? [{ href: "/financeiro", t: "Financeiro", ic: I.financeiro }] : []),
    { href: "/padroes", t: "Padrões", ic: I.padroes },
    ...(ctx.admin ? [{ href: "/cadastros", t: "Cadastros", ic: I.cadastros }, { href: "/config", t: "Configurações", ic: I.config }] : []),
  ];
  const celular = ["/inicio", "/sala", "/projetos", "/tarefas", "/equipe"].map((h) => itens.find((i) => i.href === h)!);
  const on = (h: string) => path === h || path.startsWith(h + "/");

  return (
    <Contexto.Provider value={ctx}>
      <header className="topo">
        <Link href="/inicio" className="marca" aria-label="EZE, início">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="" />
          <span>Gestão</span>
        </Link>
        <Busca />
        <div className="topo-d">
          <a className="topo-ic" href={MODELO_URL} target="_blank" rel="noreferrer" title="Ver modelo" aria-label="Ver modelo">
            <Ic d={I.modelo} />
          </a>
          <Link href="/perfil" className="topo-eu" title={`${ctx.eu.nome} · ${PAPEL[ctx.papel]}`} aria-label="Meu perfil">
            <Avatar nome={ctx.eu.nome} foto={ctx.eu.foto} size={32} />
          </Link>
        </div>
      </header>

      <nav className="lado" aria-label="Principal">
        {itens.map((i) => (
          <Link key={i.href} href={i.href} className={on(i.href) ? "on" : ""} aria-current={on(i.href) ? "page" : undefined}>
            <Ic d={i.ic} />
            <span>{i.t}</span>
            {i.href === "/sala" && naoLidas > 0 && <b className="badge" aria-label={`${naoLidas} mensagens novas`}>{naoLidas > 99 ? "99+" : naoLidas}</b>}
          </Link>
        ))}
        <Link href={`/equipe/${ctx.eu.id}`} className={`lado-eu${path === `/equipe/${ctx.eu.id}` ? " on" : ""}`}>
          <Avatar nome={ctx.eu.nome} foto={ctx.eu.foto} size={26} />
          <span>
            <strong>{ctx.eu.nome}</strong>
            <small>{PAPEL[ctx.papel]}</small>
          </span>
        </Link>
      </nav>

      <OnlineProvider>
        <main className="wrap app">{children}</main>
      </OnlineProvider>

      <nav className="tabbar" aria-label="Principal">
        {celular.map((i) => (
          <Link key={i.href} href={i.href} className={on(i.href) ? "on" : ""} aria-current={on(i.href) ? "page" : undefined}>
            <Ic d={i.ic} />
            <span>{i.t}</span>
            {i.href === "/sala" && naoLidas > 0 && <b className="badge" aria-label={`${naoLidas} mensagens novas`}>{naoLidas > 99 ? "99+" : naoLidas}</b>}
          </Link>
        ))}
      </nav>

      <Chamadas />
      <Cronometro />
    </Contexto.Provider>
  );
}
