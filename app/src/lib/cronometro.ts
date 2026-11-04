// Cronômetro de horas: um por pessoa. Parar grava o apontamento (função no banco).
import type { SupabaseClient } from "@supabase/supabase-js";

export type Cron = {
  perfil_id: string;
  projeto_id: string | null;
  tarefa_id: string | null;
  nota: string | null;
  inicio: string;
  projeto?: { codigo: number | null; tipologia: string | null; nome: string } | null;
  tarefa?: { titulo: string } | null;
};

export const EVENTO = "ezeg-cronometro";
const avisar = () => window.dispatchEvent(new Event(EVENTO));

export async function cronAtual(sb: SupabaseClient, eu: string): Promise<Cron | null> {
  const { data } = await sb
    .from("cronometros")
    .select("perfil_id,projeto_id,tarefa_id,nota,inicio,projeto:projetos(codigo,tipologia,nome),tarefa:tarefas(titulo)")
    .eq("perfil_id", eu)
    .maybeSingle();
  return (data as unknown as Cron) ?? null;
}

export async function iniciar(sb: SupabaseClient, esc: string, p: { projeto_id: string | null; tarefa_id?: string | null; nota?: string | null }) {
  // Se já houver um rodando, grava o tempo dele antes de começar o novo
  await sb.rpc("parar_cronometro");
  const { error } = await sb.from("cronometros").insert({ escritorio_id: esc, projeto_id: p.projeto_id, tarefa_id: p.tarefa_id ?? null, nota: p.nota ?? null });
  avisar();
  return error;
}

export async function parar(sb: SupabaseClient) {
  const { data, error } = await sb.rpc("parar_cronometro");
  avisar();
  return { minutos: (data as number) ?? 0, error };
}

export const decorrido = (inicio: string, agora = Date.now()) => {
  const s = Math.max(0, Math.floor((agora - new Date(inicio).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};
