"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DECISAO_NOME, ITEM_STATUS, STATUS_NOME, type Decisao, type ItemStatus, type Status } from "@/lib/analistas";

// Abas do módulo: análises enviadas e cadastro dos analistas.
export function AbasAnalise() {
  const p = usePathname();
  const on = (h: string) => (h === "/analises" ? p === "/analises" || (p.startsWith("/analises/") && !p.startsWith("/analistas")) : p.startsWith(h));
  return (
    <div className="tabs" role="tablist" style={{ marginBottom: 20 }}>
      <Link href="/analises" className={on("/analises") ? "on" : ""}>Análises</Link>
      <Link href="/analistas" className={on("/analistas") ? "on" : ""}>Analistas</Link>
    </div>
  );
}

// Selos em preto e branco: cheio, contorno, tracejado, cinza
export function SeloStatus({ s }: { s: Status }) {
  const c = s === "concluida" ? "pill" : s === "erro" ? "pill inv" : "pill dash";
  return <span className={c}>{s === "analisando" && <i className="ia-giro" aria-hidden="true" />}{STATUS_NOME[s]}</span>;
}

export function SeloDecisao({ d }: { d: Decisao | null }) {
  if (!d) return <span className="pill dash">Aguardando decisão</span>;
  return <span className={d === "aprovado" ? "pill inv" : d === "reprovado" ? "pill ia-contorno" : "pill"}>{DECISAO_NOME[d]}</span>;
}

export function SeloItem({ s }: { s: ItemStatus }) {
  const c = s === "nao_conforme" ? "pill inv" : s === "verificar" ? "pill dash" : s === "conforme" ? "pill ia-contorno" : "pill";
  return <span className={c}>{ITEM_STATUS[s] ?? s}</span>;
}

export function Nota({ v, grande }: { v: number | null | undefined; grande?: boolean }) {
  if (v === null || v === undefined) return <span className="note">—</span>;
  return (
    <span className={`ia-nota${grande ? " g" : ""}`}>
      <b>{v.toFixed(1).replace(".", ",")}</b>
      <span className="barra" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(10, v)) * 10}%` }} /></span>
    </span>
  );
}
