// Coordenação de projetos: tipos e utilidades compartilhadas (migração 0010).

export type StatusItem = "aberto" | "em_correcao" | "respondido" | "validado";
export const STATUS_ITEM: Record<StatusItem, string> = {
  aberto: "Aberto",
  em_correcao: "Em correção",
  respondido: "Respondido",
  validado: "Validado",
};
export const ORDEM_STATUS: StatusItem[] = ["aberto", "em_correcao", "respondido", "validado"];

export type Prioridade = "baixa" | "media" | "alta" | "critica";
export const PRIORIDADE: Record<Prioridade, string> = { baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica" };

export type Funcao = "cliente" | "eng_cliente" | "projetista" | "outro";
export const FUNCAO: Record<Funcao, string> = {
  cliente: "Cliente",
  eng_cliente: "Engenharia do cliente",
  projetista: "Projetista",
  outro: "Outro",
};

export type ProjetoCoord = {
  id: string; codigo: number | null; nome: string; escritorio_id: string; escritorio: string; cliente: string | null;
  coordena: boolean; equipe: boolean; convidado: boolean;
};

export type Modelo = { id: string; projeto_id: string; disciplina_id: string | null; nome: string; ordem: number };
export type Revisao = {
  id: string; modelo_id: string; numero: number; arquivo: string; ifc_caminho: string; frag_caminho: string | null;
  tamanho: number | null; nota: string | null; created_at: string;
};
export type Convidado = {
  id: string; projeto_id: string; email: string; nome: string | null; empresa: string | null; funcao: Funcao;
  modelos: string[]; perfil_id: string | null; ativo: boolean; created_at: string;
};
export type Camera = { p: [number, number, number]; t: [number, number, number] };
export type Elemento = { modelo: string; localId: number; nome?: string | null; categoria?: string | null; guid?: string | null };
export type Item = {
  id: string; projeto_id: string; numero: number; titulo: string; descricao: string | null; modelo_id: string | null;
  revisao_id: string | null; etapa: string | null; tipo: string | null; prioridade: Prioridade; prazo: string | null;
  status: StatusItem; interno: boolean; camera: Camera | null; ponto: [number, number, number] | null;
  elemento: Elemento | null; print_caminho: string | null; visiveis: string[]; criado_por: string | null;
  created_at: string; updated_at: string; fechado_em: string | null;
  coord_responsaveis?: { perfil_id: string | null; convidado_id: string | null }[];
};
export type Mensagem = {
  id: string; item_id: string; autor_id: string | null; tipo: "msg" | "status" | "decisao"; texto: string;
  anexo_caminho: string | null; anexo_nome: string | null; created_at: string;
};
export type Pessoa = {
  perfil_id: string | null; convidado_id: string | null; nome: string; foto: string | null; email: string | null;
  empresa: string | null; grupo: string;
};

export const CAMPOS_ITEM =
  "id,projeto_id,numero,titulo,descricao,modelo_id,revisao_id,etapa,tipo,prioridade,prazo,status,interno,camera,ponto,elemento,print_caminho,visiveis,criado_por,created_at,updated_at,fechado_em,coord_responsaveis(perfil_id,convidado_id)";

export const BUCKET = "coordenacao";

// Chave única de uma pessoa (equipe pelo perfil, convidado pelo convite)
export const chavePessoa = (p: { perfil_id: string | null; convidado_id: string | null }) =>
  p.convidado_id ? `c:${p.convidado_id}` : `p:${p.perfil_id}`;

export const vencido = (i: Pick<Item, "prazo" | "status">) =>
  !!i.prazo && i.status !== "validado" && i.status !== "respondido" && i.prazo < new Date().toISOString().slice(0, 10);

export const num = (n: number) => `#${String(n).padStart(3, "0")}`;
export const rev = (n: number) => `R${String(n).padStart(2, "0")}`;

export const tamanho = (b?: number | null) =>
  !b ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

// Nome de arquivo seguro para o Storage
export const nomeSeguro = (n: string) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-90);

export const LINK_SISTEMA = "https://www.ezegestao.com.br";

export function textoConvite(c: { nome?: string | null; email: string }, projeto: string, escritorio: string) {
  const nome = (c.nome || "").trim().split(/\s+/)[0];
  return `${nome ? `Olá, ${nome}. ` : "Olá. "}A ${escritorio} convidou você para a coordenação do projeto ${projeto}.

Acesse ${LINK_SISTEMA} e entre com o e-mail ${c.email} (Google ou link por e-mail). Lá você vê os modelos 3D, os apontamentos atribuídos a você e conversa direto com a coordenação.`;
}
