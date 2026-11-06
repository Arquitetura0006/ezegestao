// Permissões por módulo (espelha a função pode() do banco, migração 0009).
import type { Papel } from "./util";

export type Nivel = "ver" | "editar";
export type Permissoes = Partial<Record<Modulo, Nivel>>;

export type Modulo = "equipe" | "comercial" | "projetos" | "planejamento" | "horas" | "financeiro" | "padroes" | "analistas" | "sensiveis";

export const MODULOS: { id: Exclude<Modulo, "sensiveis">; nome: string; desc: string; soEditar?: boolean }[] = [
  { id: "equipe", nome: "Equipe", desc: "Página das outras pessoas; editar = convidar, cadastro e documentos" },
  { id: "comercial", nome: "Comercial", desc: "Clientes, propostas e funil comercial" },
  { id: "projetos", nome: "Projetos", desc: "Todos os projetos, etapas, equipe e recados" },
  { id: "planejamento", nome: "Planejamento", desc: "Tarefas, quadro e carga de todos os projetos" },
  { id: "horas", nome: "Horas", desc: "Horas lançadas por toda a equipe" },
  { id: "financeiro", nome: "Financeiro", desc: "Contas a pagar, receber, caixas e relatórios" },
  { id: "padroes", nome: "Padrões", desc: "Trilhas, aulas e manual. Todos já visualizam", soEditar: true },
  { id: "analistas", nome: "Analistas IA", desc: "Ver = todas as pré-análises; editar = cadastrar analistas e dar a decisão final" },
];

// Modelos para "Aplicar cargo…"
export const CARGOS: { nome: string; p: Permissoes }[] = [
  { nome: "Partner (só os próprios projetos)", p: {} },
  { nome: "Coordenador de projetos", p: { equipe: "ver", projetos: "editar", planejamento: "editar", horas: "ver" } },
  { nome: "Atendimento e comercial", p: { comercial: "editar", projetos: "ver" } },
  { nome: "Financeiro", p: { financeiro: "editar", comercial: "ver", projetos: "ver", sensiveis: "ver" } },
  { nome: "Gestor (tudo, menos financeiro)", p: { equipe: "editar", comercial: "editar", projetos: "editar", planejamento: "editar", horas: "editar", padroes: "editar", sensiveis: "ver" } },
];

export function podeCom(papel: Papel, acessoFin: boolean, perm: Permissoes, m: Modulo, editar = false): boolean {
  if (papel === "dono") return true;
  if (papel === "admin" && m !== "financeiro") return true;
  if (m === "financeiro" && acessoFin) return true;
  const n = perm[m];
  return n === "editar" || (!editar && n === "ver");
}
