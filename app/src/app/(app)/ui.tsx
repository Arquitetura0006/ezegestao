"use client";

import { iniciais } from "@/lib/util";

export function Avatar({ nome, foto, size = 36, eu }: { nome?: string | null; foto?: string | null; size?: number; eu?: boolean }) {
  return (
    <span className={`avt${eu ? " eu" : ""}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {foto ? <img src={foto} alt="" referrerPolicy="no-referrer" /> : iniciais(nome)}
    </span>
  );
}

export function Vazio({ titulo, texto, children }: { titulo: string; texto?: string; children?: React.ReactNode }) {
  return (
    <div className="vazio">
      <p className="vazio-t">{titulo}</p>
      {texto && <p className="note" style={{ margin: "4px 0 0" }}>{texto}</p>}
      {children && <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>{children}</div>}
    </div>
  );
}

export function Cabeca({ kicker, titulo, children }: { kicker?: string; titulo: string; children?: React.ReactNode }) {
  return (
    <div className="cabeca">
      <div>
        {kicker && <p className="mono" style={{ marginBottom: 8 }}>{kicker}</p>}
        <h1 className="h-l">{titulo}</h1>
      </div>
      {children && <div className="cabeca-acoes">{children}</div>}
    </div>
  );
}
