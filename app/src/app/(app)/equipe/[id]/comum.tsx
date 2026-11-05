"use client";

import type { Papel } from "@/lib/util";
import type { Permissoes } from "@/lib/permissoes";
import type { Tarefa } from "@/lib/gestor";

export type MembroP = {
  perfil_id: string;
  papel: Papel;
  ativo: boolean;
  cargo: string | null;
  horas_semana: number | null;
  acesso_financeiro: boolean;
  permissoes: Permissoes | null;
  created_at: string;
  perfil: { nome: string | null; email: string | null; foto_url: string | null; cidade: string | null } | null;
};

export type TP = Tarefa & {
  projeto: { codigo: number | null; tipologia: string | null; nome: string; ativo: boolean } | null;
  etapa: { sigla: string | null; nome: string } | null;
};

export const SEL_TAREFA = "projeto:projetos(codigo,tipologia,nome,ativo),etapa:projeto_etapas(sigla,nome)";

// Ícones das abas (traço fino, preto e branco)
export const IC: Record<string, React.ReactNode> = {
  lista: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  metricas: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  timesheet: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />,
  calendario: <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />,
  quadro: <path d="M4 4h6v16H4zM14 4h6v9h-6z" />,
  timeline: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  custos: <path d="M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3 5 1.3 5 3.3-2.2 3-5 3-5-1.1-5-3" />,
  documentos: <path d="M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6" />,
  permissoes: <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6zM9 12l2 2 4-4" />,
  equipe: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c2 .6 3.2 2.3 3.5 5.2" />,
  comercial: <path d="M3 7h18v12H3zM8 7V5h8v2M3 12h18" />,
  projetos: <path d="M3 7h7l2 2h9v11H3z" />,
  planejamento: <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h3M8 17h6" />,
  horas: <path d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2.5M9.5 2.5h5" />,
  financeiro: <path d="M3 6h18v12H3zM3 10h18M7 15h3" />,
  padroes: <path d="M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z" />,
  admin: <path d="M4 18h16M5 18l-1-10 5 4 3-6 3 6 5-4-1 10" />,
  sensiveis: <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  recepcao: <path d="M4 20h16M6 20v-6h12v6M9 14V9a3 3 0 0 1 6 0v5" />,
};

export function Ico({ k, size = 16 }: { k: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {IC[k]}
    </svg>
  );
}

export function Sw({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <span className="sw">
      <input type="checkbox" role="switch" checked={on} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <i />
    </span>
  );
}
