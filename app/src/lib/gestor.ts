// Gestor de projetos: tipos, rótulos e utilidades compartilhadas.

export type StatusProj = "pendente" | "andamento" | "pausado" | "finalizado" | "sem_contrato";
export const STATUS_PROJ: Record<StatusProj, string> = {
  pendente: "Pendente",
  andamento: "Em andamento",
  pausado: "Pausado",
  finalizado: "Finalizado",
  sem_contrato: "Sem contrato",
};

export type StatusTarefa = "backlog" | "pendente" | "andamento" | "revisao" | "concluida";
export const STATUS_TAREFA: Record<StatusTarefa, string> = {
  backlog: "Backlog",
  pendente: "A fazer",
  andamento: "Fazendo",
  revisao: "Em revisão",
  concluida: "Concluída",
};
export const ORDEM_STATUS: StatusTarefa[] = ["backlog", "pendente", "andamento", "revisao", "concluida"];

export type Prioridade = "baixa" | "media" | "alta" | "urgente";
export const PRIORIDADE: Record<Prioridade, string> = { baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente" };

export const TIPOLOGIAS = ["HOSP", "MULTI", "UNI", "INTERIORES", "COM"];

export type Tarefa = {
  id: string;
  projeto_id: string;
  etapa_id: string | null;
  pai_id: string | null;
  disciplina_id: string | null;
  titulo: string;
  descricao: string | null;
  responsavel_id: string | null;
  inicio: string | null;
  termino: string | null;
  horas_previstas: number;
  status: StatusTarefa;
  prioridade: Prioridade;
  ordem: number;
  concluida_em: string | null;
};

export type Etapa = { id: string; projeto_id: string; sigla: string | null; nome: string; ordem: number; peso: number; inicio: string | null; termino: string | null };
export type Pessoa = { id: string; nome: string | null; foto_url: string | null };
export type Cliente = { id: string; nome: string };

export const CAMPOS_TAREFA =
  "id,projeto_id,etapa_id,pai_id,disciplina_id,titulo,descricao,responsavel_id,inicio,termino,horas_previstas,status,prioridade,ordem,concluida_em";

export const hoje = () => new Date().toISOString().slice(0, 10);

export const atrasada = (t: Pick<Tarefa, "termino" | "status">) => !!t.termino && t.status !== "concluida" && t.termino < hoje();

// "2026-11-03" → "03/11"
export const dia = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");

export const horas = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
};

export const moeda = (v?: number | null) =>
  v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const nomeProjeto = (p: { codigo?: number | null; tipologia?: string | null; nome: string }) =>
  [p.codigo ? String(p.codigo).padStart(3, "0") : null, p.tipologia ? `[${p.tipologia}]` : null, p.nome].filter(Boolean).join(" ");

// Segunda-feira da semana de uma data (YYYY-MM-DD)
export function segunda(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const w = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - w);
  return x;
}
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const somaDias = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// Dias úteis entre duas datas (inclusive), para distribuir horas previstas na semana.
export function diasUteis(a: string, b: string): number {
  let n = 0;
  const x = new Date(a + "T12:00:00");
  const y = new Date(b + "T12:00:00");
  while (x <= y) {
    const w = x.getDay();
    if (w !== 0 && w !== 6) n++;
    x.setDate(x.getDate() + 1);
  }
  return n;
}
