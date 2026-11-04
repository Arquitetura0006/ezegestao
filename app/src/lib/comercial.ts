// Comercial: rótulos e utilidades das propostas.

export type StatusProp = "estudo" | "aberta" | "pendente" | "aprovada" | "recusada";
export const STATUS_PROP: Record<StatusProp, string> = {
  estudo: "Estudo de viabilidade",
  aberta: "Em elaboração",
  pendente: "Enviada · aguardando",
  aprovada: "Aprovada",
  recusada: "Recusada",
};
export const FUNIL: StatusProp[] = ["estudo", "aberta", "pendente", "aprovada", "recusada"];

export const MOTIVOS = [
  "Decisão adiada pelo cliente",
  "Cliente não respondeu",
  "Projeto cancelado pelo cliente",
  "Preço acima do esperado",
  "Fechou com outro escritório",
  "Cliente mudou o escopo do projeto",
  "Proposta duplicada",
];

export type TipoAtiv = "nota" | "ligacao" | "reuniao" | "email" | "whatsapp" | "visita" | "status";
export const TIPO_ATIV: Record<TipoAtiv, string> = {
  nota: "Nota",
  ligacao: "Ligação",
  reuniao: "Reunião",
  email: "E-mail",
  whatsapp: "WhatsApp",
  visita: "Visita",
  status: "Status",
};

export type Parcela = { descricao: string; percentual: number | null; valor: number | null; quando: string };

export type Proposta = {
  id: string;
  codigo: number | null;
  nome: string;
  tipologia: string | null;
  cliente_id: string | null;
  contato: string | null;
  cidade: string | null;
  endereco: string | null;
  area_m2: number | null;
  valor: number | null;
  status: StatusProp;
  probabilidade: number | null;
  motivo_perda: string | null;
  escopo: string | null;
  etapas: string[];
  prazo: string | null;
  validade: string | null;
  forma_pagamento: string | null;
  parcelas: Parcela[];
  observacoes: string | null;
  proxima_acao: string | null;
  proxima_data: string | null;
  responsavel_id: string | null;
  projeto_id: string | null;
  enviada_em: string | null;
  decidida_em: string | null;
  created_at: string;
  cliente?: { nome: string } | null;
};

export const CAMPOS_PROP =
  "id,codigo,nome,tipologia,cliente_id,contato,cidade,endereco,area_m2,valor,status,probabilidade,motivo_perda,escopo,etapas,prazo,validade,forma_pagamento,parcelas,observacoes,proxima_acao,proxima_data,responsavel_id,projeto_id,enviada_em,decidida_em,created_at,cliente:clientes(nome)";

export const codigoProp = (p: { codigo: number | null }) => (p.codigo ? `#${p.codigo}` : "");

// Valor ponderado pela probabilidade (previsão de fechamento)
export const ponderado = (p: Pick<Proposta, "valor" | "probabilidade" | "status">) =>
  p.status === "aprovada" ? Number(p.valor || 0) : p.status === "recusada" ? 0 : (Number(p.valor || 0) * Number(p.probabilidade ?? 30)) / 100;

// Distribui o valor nas parcelas quando só o percentual foi informado
export const valorParcela = (total: number | null, x: Parcela) =>
  x.valor != null && x.valor > 0 ? x.valor : x.percentual != null && total ? (total * x.percentual) / 100 : null;

export const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
