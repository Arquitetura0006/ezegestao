// Briefing do projeto: campos, rótulos e tipos (tela da equipe, link do cliente e pré-análise IA).

export type Prioridade = "essencial" | "importante" | "desejavel";
export const PRIORIDADE: Record<Prioridade, string> = { essencial: "Essencial", importante: "Importante", desejavel: "Desejável" };
export const PESO_PRIORIDADE: Record<Prioridade, number> = { essencial: 3, importante: 2, desejavel: 1 };

export type RefTipo = "gosta" | "nao_gosta" | "referencia";
export const REF_TIPO: Record<RefTipo, string> = { gosta: "Gosta", nao_gosta: "Não gosta", referencia: "Referência" };

export type CamposCliente = Partial<Record<"objetivos" | "programa" | "gosta" | "nao_gosta" | "publico" | "prazo" | "orcamento" | "outros", string>>;
export type CamposResp = Partial<Record<"leitura" | "restricoes" | "conceito" | "outros", string>>;

export const CAMPOS_CLIENTE: { k: keyof CamposCliente; t: string; dica: string; curto?: boolean }[] = [
  { k: "objetivos", t: "Objetivos", dica: "O que você quer alcançar com este projeto? O que não pode deixar de ter? Um objetivo por linha." },
  { k: "programa", t: "Programa de necessidades", dica: "Ambientes, quantidades, áreas, usos. Para incorporação: número e tipos de unidades, vagas, lazer, comércio." },
  { k: "gosta", t: "O que você gosta", dica: "Estilos, materiais, cores, sensações, projetos que admira." },
  { k: "nao_gosta", t: "O que você não gosta", dica: "O que deve ser evitado: estilos, materiais, soluções que já viu e não quer." },
  { k: "publico", t: "Para quem é", dica: "Quem vai morar ou comprar: perfil, idade, renda, estilo de vida." },
  { k: "prazo", t: "Prazo", dica: "Datas importantes: lançamento, aprovação, início de obra.", curto: true },
  { k: "orcamento", t: "Orçamento e ticket", dica: "Custo de obra pretendido, valor de venda por m² ou por unidade.", curto: true },
  { k: "outros", t: "Mais alguma coisa", dica: "Tudo o que achar importante e não coube acima." },
];

export const CAMPOS_RESP: { k: keyof CamposResp; t: string; dica: string }[] = [
  { k: "leitura", t: "Leitura da reunião", dica: "O que o cliente quis dizer além do que falou: anseios, receios, o que brilhou nos olhos dele." },
  { k: "restricoes", t: "Restrições e riscos", dica: "Terreno, legislação, orçamento, prazos, decisões que já vêm tomadas." },
  { k: "conceito", t: "Conceito proposto", dica: "A ideia que vai guiar o projeto e como ela responde aos objetivos." },
  { k: "outros", t: "Observações", dica: "Combinados com o cliente, pontos para a equipe ficar atenta." },
];

export type Objetivo = { id: string; projeto_id: string; ordem: number; texto: string; prioridade: Prioridade; origem: "cliente" | "responsavel"; ativo: boolean };

export type Ref = {
  id: string;
  projeto_id?: string;
  origem?: "cliente" | "responsavel";
  tipo: RefTipo;
  titulo: string | null;
  comentario: string | null;
  caminho: string | null;
  mime: string | null;
  tamanho?: number | null;
  link: string | null;
  enviar?: boolean;
  created_at?: string;
};

export type Briefing = {
  projeto_id: string;
  escritorio_id: string;
  cliente: CamposCliente;
  responsavel: CamposResp;
  link_token: string;
  link_ativo: boolean;
  cliente_nome: string | null;
  cliente_enviado_em: string | null;
  versao: number;
  updated_at: string;
};

export const ACEITOS_REF = "image/png,image/jpeg,image/webp,image/gif,application/pdf";
export const refAceita = (m: string) => m === "application/pdf" || /^image\/(png|jpeg|webp|gif)$/.test(m);
export const LIMITE_REF = 25 * 1048576;
