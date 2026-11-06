// Analistas IA: tipos, rótulos e a regra de quais analistas entram numa análise.
// Usado nas telas e na rota do servidor (app/api/analises/[id]/rodar).

export type Camada = "base" | "etapa" | "municipio" | "estetica";

export const CAMADAS: { id: Camada; nome: string; desc: string }[] = [
  { id: "base", nome: "Base EZE", desc: "Vale para todo projeto: pranchas, carimbo, nomenclatura, premissas" },
  { id: "etapa", nome: "Etapa", desc: "Checklist de uma etapa do processo" },
  { id: "municipio", nome: "Município", desc: "Legislação de uma cidade, nas etapas marcadas" },
  { id: "estetica", nome: "Estética", desc: "Força criativa, com nota por critério" },
];
export const CAMADA_NOME: Record<Camada, string> = { base: "Base EZE", etapa: "Etapa", municipio: "Município", estetica: "Estética" };

export type Analista = {
  id: string;
  escritorio_id: string;
  nome: string;
  camada: Camada;
  etapas: string[];
  cidades: string[];
  descricao: string | null;
  orientacoes: string;
  ativo: boolean;
  ordem: number;
  updated_at: string;
};

export type Item = {
  id: string;
  analista_id: string;
  ordem: number;
  grupo: string | null;
  texto: string;
  como_verificar: string | null;
  tipo: "checklist" | "nota";
  peso: number;
  critico: boolean;
  ativo: boolean;
};

export type DocTipo = "norma" | "ref_boa" | "ref_ruim" | "apoio";
export const DOC_TIPO: Record<DocTipo, string> = {
  norma: "Lei ou norma",
  ref_boa: "Referência boa",
  ref_ruim: "Referência ruim",
  apoio: "Material de apoio",
};

export type Doc = {
  id: string;
  analista_id: string;
  tipo: DocTipo;
  titulo: string;
  caminho: string | null;
  mime: string | null;
  tamanho: number | null;
  texto: string | null;
  comentario: string | null;
  enviar: boolean;
  created_at: string;
};

export type Arquivo = { nome: string; caminho: string; mime: string; tamanho: number };

export type Status = "enviada" | "analisando" | "concluida" | "erro";
export const STATUS_NOME: Record<Status, string> = { enviada: "Na fila", analisando: "Analisando", concluida: "Concluída", erro: "Erro" };

export type Decisao = "aprovado" | "correcoes" | "reprovado";
export const DECISAO_NOME: Record<Decisao, string> = { aprovado: "Aprovado", correcoes: "Aprovado com correções", reprovado: "Refazer" };

// Parecer devolvido pela IA (ferramenta registrar_parecer)
export type ItemStatus = "conforme" | "nao_conforme" | "verificar" | "nao_se_aplica";
export const ITEM_STATUS: Record<ItemStatus, string> = { conforme: "Conforme", nao_conforme: "Não conforme", verificar: "Verificar", nao_se_aplica: "Não se aplica" };

export type StatusObjetivo = "atendido" | "parcial" | "nao_atendido" | "nao_avaliavel";
export const STATUS_OBJETIVO: Record<StatusObjetivo, string> = { atendido: "Atendido", parcial: "Parcial", nao_atendido: "Não atendido", nao_avaliavel: "Não avaliável" };
export type Causa = "legislacao" | "tecnica" | "projeto" | "informacao";
export const CAUSA: Record<Causa, string> = { legislacao: "Limite da legislação", tecnica: "Limite técnico", projeto: "Escolha de projeto", informacao: "Falta informação" };

export type ParecerCliente = {
  resumo: string;
  objetivos: {
    objetivo_id?: string;
    objetivo: string;
    prioridade?: "essencial" | "importante" | "desejavel";
    status: StatusObjetivo;
    nota: number;
    justificativa: string;
    causa?: Causa;
    sugestao?: string;
    onde?: string;
  }[];
  gosta?: string;
  alertas_nao_gosta?: string[];
};

export type Parecer = {
  resumo: string;
  cliente?: ParecerCliente;
  sem_briefing?: boolean;
  camadas: {
    analista_id: string;
    analista: string;
    camada: Camada;
    resumo: string;
    itens?: { item_id?: string; texto: string; status: ItemStatus; comentario?: string; onde?: string }[];
    notas?: { item_id?: string; criterio: string; nota: number; comentario?: string }[];
    observacoes?: { texto: string; onde?: string }[];
  }[];
  correcoes_prioritarias?: { texto: string; onde?: string; gravidade: "alta" | "media" | "baixa" }[];
  pontos_fortes?: string[];
  nao_verificado?: string[];
  ignorados?: string[]; // analistas sem conteúdo, que não entraram
};

export type Analise = {
  id: string;
  escritorio_id: string;
  projeto_id: string | null;
  etapa_sigla: string | null;
  cidade: string | null;
  titulo: string;
  obs: string | null;
  arquivos: Arquivo[];
  analistas_ids: string[];
  enviado_por: string | null;
  status: Status;
  resultado: Parecer | null;
  nota: number | null;
  nota_cliente: number | null;
  briefing: { versao: number } | null;
  modelo: string | null;
  uso: { entrada?: number; saida?: number; cache_lida?: number; cache_criada?: number } | null;
  erro: string | null;
  decisao: Decisao | null;
  parecer_final: string | null;
  revisado_por: string | null;
  revisado_em: string | null;
  iniciada_em: string | null;
  concluida_em: string | null;
  created_at: string;
};

export const norm = (s?: string | null) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// Um analista entra quando: está ativo, a etapa está na lista dele (vazia = todas)
// e, se for de município, a cidade do projeto é uma das dele.
export function aplica(a: Pick<Analista, "ativo" | "camada" | "etapas" | "cidades">, etapa: string | null, cidade: string | null): boolean {
  if (!a.ativo) return false;
  if (a.etapas.length > 0 && (!etapa || !a.etapas.includes(etapa))) return false;
  if (a.camada === "municipio") {
    const c = norm(cidade);
    if (!c || !a.cidades.some((x) => norm(x) === c)) return false;
  }
  return true;
}

const ORDEM_CAMADA: Record<Camada, number> = { base: 0, etapa: 1, municipio: 2, estetica: 3 };
export const ordenar = <T extends Pick<Analista, "camada" | "ordem" | "nome">>(l: T[]) =>
  [...l].sort((a, b) => ORDEM_CAMADA[a.camada] - ORDEM_CAMADA[b.camada] || a.ordem - b.ordem || a.nome.localeCompare(b.nome));

export const tamanho = (b: number | null) =>
  !b ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

export const nomeArquivo = (n: string) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_");

// Tipos que a IA lê: PDF e imagens. DWG, RVT e SKP não são lidos direto.
export const ACEITOS = "application/pdf,image/png,image/jpeg,image/webp,image/gif";
export const aceito = (mime: string) => mime === "application/pdf" || /^image\/(png|jpeg|webp|gif)$/.test(mime);
export const LIMITE_ARQ = 32 * 1048576;
