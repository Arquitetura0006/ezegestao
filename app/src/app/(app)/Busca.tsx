"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp, usePode } from "./ctx";
import { Avatar } from "./ui";
import { nomeProjeto } from "@/lib/gestor";

type R = { tipo: string; t: string; s?: string; href: string; foto?: string | null; pessoa?: boolean };

// Busca geral (Ctrl/⌘ + K): pessoas, projetos e propostas.
export default function Busca() {
  const { esc } = useApp();
  const comercial = usePode("comercial");
  const supabase = useMemo(() => supabaseNavegador(), []);
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<R[]>([]);
  const [sel, setSel] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta(true);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  useEffect(() => {
    if (aberta) setTimeout(() => inp.current?.focus(), 10);
    else {
      setQ("");
      setRes([]);
    }
  }, [aberta]);

  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 2) return setRes([]);
    const t = setTimeout(async () => {
      const like = `%${termo.replace(/[%_]/g, "")}%`;
      const num = /^\d+$/.test(termo) ? Number(termo) : null;
      const [pe, pr, po] = await Promise.all([
        supabase.from("membros").select("perfil_id,cargo,perfil:perfis!inner(nome,email,foto_url)").eq("escritorio_id", esc.id).eq("ativo", true).ilike("perfil.nome", like).limit(5),
        supabase.from("projetos").select("id,codigo,tipologia,nome,cidade").eq("escritorio_id", esc.id)
          .or(num !== null ? `codigo.eq.${num},nome.ilike.${like}` : `nome.ilike.${like}`).order("codigo", { ascending: false }).limit(8),
        comercial
          ? supabase.from("propostas").select("id,codigo,nome,status").eq("escritorio_id", esc.id).ilike("nome", like).order("codigo", { ascending: false }).limit(5)
          : Promise.resolve({ data: [] }),
      ]);
      const out: R[] = [];
      ((pe.data ?? []) as unknown as { perfil_id: string; cargo: string | null; perfil: { nome: string | null; email: string | null; foto_url: string | null } }[]).forEach((m) =>
        out.push({ tipo: "Pessoas", t: m.perfil.nome || m.perfil.email || "", s: m.cargo || m.perfil.email || "", href: `/equipe/${m.perfil_id}`, foto: m.perfil.foto_url, pessoa: true }));
      ((pr.data ?? []) as { id: string; codigo: number | null; tipologia: string | null; nome: string; cidade: string | null }[]).forEach((p) =>
        out.push({ tipo: "Projetos", t: nomeProjeto(p), s: p.cidade || "", href: `/projetos/${p.id}` }));
      ((po.data ?? []) as { id: string; codigo: number | null; nome: string; status: string }[]).forEach((p) =>
        out.push({ tipo: "Propostas", t: `${p.codigo ? `P${String(p.codigo).padStart(3, "0")} ` : ""}${p.nome}`, s: p.status, href: `/comercial/${p.id}` }));
      setRes(out);
      setSel(0);
    }, 180);
    return () => clearTimeout(t);
  }, [q, supabase, esc.id, comercial]);

  function ir(r?: R) {
    if (!r) return;
    setAberta(false);
    router.push(r.href);
  }

  return (
    <>
      <button type="button" className="busca" onClick={() => setAberta(true)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <span>Pesquisar</span>
        <kbd>{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      {aberta && (
        <div className="busca-fundo" onClick={() => setAberta(false)}>
          <div className="busca-m" role="dialog" aria-label="Pesquisar" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inp}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pessoas, projetos (nome ou código), propostas…"
              onKeyDown={(e) => {
                if (e.key === "Escape") setAberta(false);
                if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, res.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
                if (e.key === "Enter") ir(res[sel]);
              }}
            />
            <div className="busca-l">
              {q.trim().length >= 2 && res.length === 0 && <p className="note" style={{ padding: "12px 16px", margin: 0 }}>Nada encontrado.</p>}
              {res.map((r, i) => (
                <div key={r.href}>
                  {(i === 0 || res[i - 1].tipo !== r.tipo) && <p className="busca-g">{r.tipo}</p>}
                  <button type="button" className={`busca-i${i === sel ? " on" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => ir(r)}>
                    {r.pessoa && <Avatar nome={r.t} foto={r.foto} size={24} />}
                    <strong>{r.t}</strong>
                    {r.s && <small>{r.s}</small>}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
