import Link from "next/link";

export type Secao = { t: string; p: string[] };

// Página de texto simples (privacidade, termos), no mesmo visual claro do sistema.
export default function Documento({ titulo, atualizado, secoes }: { titulo: string; atualizado: string; secoes: Secao[] }) {
  return (
    <main className="wrap" style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
        <Link href="/" className="mono" style={{ textDecoration: "none" }}>EZE · Arquitetura e Gestão</Link>
        <Link href="/" className="note">Voltar</Link>
      </div>
      <h1 className="h-l">{titulo}</h1>
      <p className="note" style={{ marginTop: 8 }}>Atualizado em {atualizado}</p>
      <div className="box" style={{ marginTop: 28 }}>
        {secoes.map((s, i) => (
          <section key={i} style={{ marginTop: i ? 24 : 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>{s.t}</h2>
            {s.p.map((p, j) => (
              <p key={j} style={{ margin: "0 0 8px", lineHeight: 1.6 }}>{p}</p>
            ))}
          </section>
        ))}
      </div>
      <p className="note" style={{ marginTop: 24 }}>
        <Link href="/privacidade">Privacidade</Link> · <Link href="/termos">Termos de uso</Link>
      </p>
    </main>
  );
}
