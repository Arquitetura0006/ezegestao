"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sub() {
  const p = usePathname();
  const manual = p.startsWith("/padroes/manual");
  return (
    <nav className="tabs" style={{ marginBottom: 24 }} aria-label="Padrões">
      <Link href="/padroes" className={!manual ? "on" : ""} style={{ textDecoration: "none" }}>Trilhas</Link>
      <Link href="/padroes/manual" className={manual ? "on" : ""} style={{ textDecoration: "none" }}>Manual</Link>
    </nav>
  );
}
