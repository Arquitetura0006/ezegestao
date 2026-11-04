"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "./ctx";
import { EVENTO, cronAtual, decorrido, parar, type Cron } from "@/lib/cronometro";
import { horas, nomeProjeto } from "@/lib/gestor";

// Faixa fixa com o cronômetro em andamento, visível em todas as telas.
export default function Cronometro() {
  const { eu } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [c, setC] = useState<Cron | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => setC(await cronAtual(supabase, eu.id)), [supabase, eu.id]);

  useEffect(() => {
    carregar();
    const f = () => carregar();
    window.addEventListener(EVENTO, f);
    const canal = supabase
      .channel(`cron-${eu.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cronometros", filter: `perfil_id=eq.${eu.id}` }, () => carregar())
      .subscribe();
    return () => {
      window.removeEventListener(EVENTO, f);
      supabase.removeChannel(canal);
    };
  }, [supabase, eu.id, carregar]);

  useEffect(() => {
    if (!c) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [c]);

  useEffect(() => {
    if (!c) return;
    document.title = `${decorrido(c.inicio, agora)} · EZE Gestão`;
    return () => {
      document.title = "EZE Gestão";
    };
  }, [c, agora]);

  async function pararAgora() {
    const r = await parar(supabase);
    setC(null);
    setAviso(r.error ? "Não foi possível gravar. Tente de novo." : `${horas(r.minutos)} gravadas`);
    setTimeout(() => setAviso(""), 4000);
  }

  if (!c) return aviso ? <div className="cron cron-ok" role="status">{aviso}</div> : null;

  return (
    <div className="cron" role="status" aria-live="polite">
      <span className="cron-dot" aria-hidden="true" />
      <strong className="cron-t">{decorrido(c.inicio, agora)}</strong>
      <span className="cron-o">
        {c.tarefa?.titulo ?? "Sem tarefa"}
        {c.projeto && (
          <Link href={`/projetos/${c.projeto_id}`}> · {nomeProjeto(c.projeto)}</Link>
        )}
      </span>
      <button className="btn small" type="button" onClick={pararAgora}>Parar</button>
    </div>
  );
}
