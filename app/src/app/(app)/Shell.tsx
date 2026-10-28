"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Contexto, type Ctx } from "./ctx";
import { Avatar } from "./ui";
import Chamadas from "./Chamadas";
import { OnlineProvider } from "./Online";
import { MODELO_URL, PAPEL } from "@/lib/util";

const I = {
  inicio: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  padroes: <path d="M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z" />,
  sala: <path d="M3 4h18v16H3zM3 12h8M11 4v16M15 12v8" />,
  projetos: <path d="M3 7h7l2 2h9v11H3z" />,
  equipe: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c2 .6 3.2 2.3 3.5 5.2" />,
  config: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />,
  modelo: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
};

function Ic({ d }: { d: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}

export default function Shell({ ctx, children }: { ctx: Ctx; children: React.ReactNode }) {
  const path = usePathname();
  const itens = [
    { href: "/inicio", t: "Início", ic: I.inicio },
    { href: "/padroes", t: "Padrões", ic: I.padroes },
    { href: "/sala", t: "Sala", ic: I.sala },
    { href: "/projetos", t: "Projetos", ic: I.projetos },
    { href: "/equipe", t: "Equipe", ic: I.equipe },
  ];
  if (ctx.admin) itens.push({ href: "/config", t: "Configurações", ic: I.config });
  const on = (h: string) => path === h || path.startsWith(h + "/");

  return (
    <Contexto.Provider value={ctx}>
      <header className="lado">
        <div className="lado-in">
          <Link href="/inicio" className="marca" aria-label="EZE, início">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" />
          </Link>
          <nav className="nav" aria-label="Principal">
            {itens.map((i) => (
              <Link key={i.href} href={i.href} className={on(i.href) ? "on" : ""} aria-current={on(i.href) ? "page" : undefined}>
                <Ic d={i.ic} />
                <span>{i.t}</span>
              </Link>
            ))}
          </nav>
          <a className="modelo" href={MODELO_URL} target="_blank" rel="noreferrer">
            <Ic d={I.modelo} />
            <span>Ver modelo</span>
          </a>
          <Link href="/perfil" className={`eu${on("/perfil") ? " on" : ""}`}>
            <Avatar nome={ctx.eu.nome} foto={ctx.eu.foto} size={34} />
            <span className="eu-t">
              <strong>{ctx.eu.nome}</strong>
              <small>{PAPEL[ctx.papel]}</small>
            </span>
          </Link>
        </div>
      </header>

      <OnlineProvider>
        <main className="wrap app">{children}</main>
      </OnlineProvider>

      <nav className="tabbar" aria-label="Principal">
        {itens.slice(0, 5).map((i) => (
          <Link key={i.href} href={i.href} className={on(i.href) ? "on" : ""} aria-current={on(i.href) ? "page" : undefined}>
            <Ic d={i.ic} />
            <span>{i.t}</span>
          </Link>
        ))}
      </nav>

      <Chamadas />
    </Contexto.Provider>
  );
}
