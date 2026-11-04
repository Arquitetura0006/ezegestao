// Financeiro: tipos, rótulos e utilidades.
import type { SupabaseClient } from "@supabase/supabase-js";

export type TipoLanc = "receita" | "despesa" | "transferencia";
export type Caixa = { id: string; nome: string; tipo: string; banco: string | null; saldo_inicial: number; saldo_inicial_em: string; ativo: boolean; ordem: number };
export type Categoria = { id: string; tipo: "receita" | "despesa"; grupo: string; nome: string; dre: string; ativo: boolean; ordem: number };
export type Fornecedor = { id: string; nome: string; tipo: string; documento: string | null; email: string | null; telefone: string | null; pix: string | null; obs: string | null; ativo: boolean };
export type Lanc = {
  id: string;
  tipo: TipoLanc;
  descricao: string;
  valor: number;
  vencimento: string;
  pago_em: string | null;
  caixa_id: string | null;
  caixa_destino_id: string | null;
  categoria_id: string | null;
  projeto_id: string | null;
  cliente_id: string | null;
  fornecedor_id: string | null;
  grupo_id: string | null;
  parcela: number | null;
  parcelas: number | null;
  recorrente: boolean;
  documento: string | null;
  observacao: string | null;
  anexo_url: string | null;
  origem: string;
};

export const CAMPOS_LANC =
  "id,tipo,descricao,valor,vencimento,pago_em,caixa_id,caixa_destino_id,categoria_id,projeto_id,cliente_id,fornecedor_id,grupo_id,parcela,parcelas,recorrente,documento,observacao,anexo_url,origem";

export const TIPO_LANC: Record<TipoLanc, string> = { receita: "Recebimento", despesa: "Pagamento", transferencia: "Transferência" };
export const TIPO_FORN: Record<string, string> = { fornecedor: "Fornecedor", partner: "Partner", colaborador: "Colaborador", governo: "Governo", banco: "Banco", outro: "Outro" };
export const LINHA_DRE: [string, string][] = [
  ["receita", "Receita bruta de honorários"],
  ["deducao", "(−) Impostos sobre faturamento"],
  ["custo", "(−) Custos dos projetos"],
  ["pessoal", "(−) Pessoal"],
  ["administrativa", "(−) Despesas administrativas"],
  ["comercial", "(−) Despesas comerciais"],
  ["financeira", "Resultado financeiro"],
  ["nao_operacional", "Não operacional (empréstimos, investimentos, rateios)"],
];

export type Status = "pago" | "aberto" | "atrasado";
export const status = (l: Pick<Lanc, "pago_em" | "vencimento">, hoje: string): Status => (l.pago_em ? "pago" : l.vencimento < hoje ? "atrasado" : "aberto");
export const STATUS_LANC: Record<Status, string> = { pago: "Pago", aberto: "Em aberto", atrasado: "Atrasado" };

export const brl = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export const parseValor = (s: string) => {
  const t = s.trim().replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return isNaN(n) ? null : n;
};

export const dataBR = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "");

export const mesNome = (m: string) => {
  const [a, mm] = m.split("-").map(Number);
  return new Date(a, mm - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};
export const fimMes = (m: string) => {
  const [a, mm] = m.split("-").map(Number);
  const d = new Date(a, mm, 0);
  return `${m}-${String(d.getDate()).padStart(2, "0")}`;
};
export const somaMes = (m: string, n: number) => {
  const [a, mm] = m.split("-").map(Number);
  const d = new Date(a, mm - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
// Soma n meses a uma data, segurando o fim do mês (31/01 + 1 → 28/02)
export const somaMesesData = (d: string, n: number) => {
  const [a, m, dd] = d.split("-").map(Number);
  const ult = new Date(a, m - 1 + n + 1, 0).getDate();
  const x = new Date(a, m - 1 + n, Math.min(dd, ult));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

// Busca paginada (a API devolve no máximo 1000 linhas por vez)
export async function buscarTudo<T>(fazer: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < 50; i++) {
    const { data, error } = await fazer(i * 1000, i * 1000 + 999);
    if (error) throw error;
    const rows = (data as T[]) ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function carregarBase(sb: SupabaseClient, esc: string) {
  const [cx, cat, forn, proj, cli] = await Promise.all([
    sb.from("caixas").select("*").eq("escritorio_id", esc).order("ordem"),
    sb.from("fin_categorias").select("*").eq("escritorio_id", esc).order("ordem"),
    sb.from("fornecedores").select("*").eq("escritorio_id", esc).order("nome"),
    sb.from("projetos").select("id,codigo,tipologia,nome,valor,status,ativo").eq("escritorio_id", esc).order("codigo", { ascending: false }),
    sb.from("clientes").select("id,nome").eq("escritorio_id", esc).order("nome"),
  ]);
  return {
    caixas: (cx.data as Caixa[]) ?? [],
    categorias: (cat.data as Categoria[]) ?? [],
    fornecedores: (forn.data as Fornecedor[]) ?? [],
    projetos: (proj.data as { id: string; codigo: number | null; tipologia: string | null; nome: string; valor: number | null; status: string; ativo: boolean }[]) ?? [],
    clientes: (cli.data as { id: string; nome: string }[]) ?? [],
  };
}
export type Base = Awaited<ReturnType<typeof carregarBase>>;

export function baixarCSV(nome: string, linhas: (string | number | null)[][]) {
  const csv = "﻿" + linhas.map((l) => l.map((c) => {
    const v = typeof c === "number" ? c.toFixed(2).replace(".", ",") : c ?? "";
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = nome;
  a.click();
}
