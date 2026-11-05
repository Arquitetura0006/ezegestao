// Organograma do projeto (migração 0011): tipos, modelos prontos e ligação com a coordenação.

export type Forma = "reto" | "arredondado" | "redondo";
export type Papel = "coordenacao" | "disciplina" | "cliente" | "outro";
export type TipoNo = "pessoa" | "funcao" | "empresa" | "nota";
export type TipoVinculo = "subordinacao" | "apoio" | "interface";

export type DadosNo = {
  nome: string;
  sub?: string;                 // cargo, e-mail, observação curta
  perfil_id?: string | null;    // pessoa da equipe
  convidado_id?: string | null; // convidado da coordenação
  papel?: Papel;                // só função
  disciplina?: string;          // só função: liga com a disciplina da coordenação (ex.: Estrutura)
  forma?: Forma;
  destaque?: boolean;           // borda grossa
  escuro?: boolean;             // preenchido em preto
  [k: string]: unknown;
};
export type DadosVinculo = { tipo: TipoVinculo; rotulo?: string; [k: string]: unknown };

export type NoSalvo = { id: string; type: TipoNo; position: { x: number; y: number }; data: DadosNo; width?: number; height?: number };
export type VinculoSalvo = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; data: DadosVinculo };

export const TIPO_NO: Record<TipoNo, string> = { pessoa: "Pessoa", funcao: "Função", empresa: "Empresa", nota: "Nota" };
export const PAPEL: Record<Papel, string> = { coordenacao: "Coordenação do projeto", disciplina: "Disciplina", cliente: "Cliente", outro: "Outra" };
export const FORMA: Record<Forma, string> = { reto: "Quadrado", arredondado: "Arredondado", redondo: "Redondo" };
export const VINCULO: Record<TipoVinculo, { nome: string; desc: string }> = {
  subordinacao: { nome: "Responde a", desc: "Linha cheia com seta" },
  apoio: { nome: "Apoio / consulta", desc: "Linha tracejada" },
  interface: { nome: "Interface técnica", desc: "Seta nos dois lados" },
};

export const norm = (s?: string | null) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

let seq = 0;
export const novoId = (p = "n") => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

// ---------- Modelos prontos ----------
type Esboco = { k: string; type: TipoNo; x: number; y: number; data: DadosNo };
function montar(nos: Esboco[], liga: [string, string, TipoVinculo, string?][]) {
  const ids: Record<string, string> = {};
  const n: NoSalvo[] = nos.map((e) => {
    ids[e.k] = novoId();
    return { id: ids[e.k], type: e.type, position: { x: e.x, y: e.y }, data: e.data };
  });
  const pos: Record<string, Esboco> = Object.fromEntries(nos.map((e) => [e.k, e]));
  const v: VinculoSalvo[] = liga.map(([a, b, tipo, rotulo]) => {
    const lado = Math.abs(pos[a].y - pos[b].y) < 40;
    return { id: novoId("e"), source: ids[a], target: ids[b], sourceHandle: lado ? "r" : "b", targetHandle: lado ? "l" : "t", data: { tipo, rotulo } };
  });
  return { nos: n, arestas: v };
}

const fn = (k: string, x: number, y: number, nome: string, papel: Papel, disciplina?: string, extra: Partial<DadosNo> = {}): Esboco =>
  ({ k, type: "funcao", x, y, data: { nome, papel, disciplina, forma: "arredondado", ...extra } });
const vaga = (k: string, x: number, y: number, sub: string): Esboco =>
  ({ k, type: "pessoa", x, y, data: { nome: "A definir", sub, forma: "redondo" } });

export const MODELOS: { id: string; nome: string; desc: string; criar: () => { nos: NoSalvo[]; arestas: VinculoSalvo[] } }[] = [
  {
    id: "multifamiliar",
    nome: "Multifamiliar",
    desc: "Cliente e engenharia do cliente, coordenação EZE, criação e as disciplinas complementares",
    criar: () =>
      montar(
        [
          { k: "cli", type: "empresa", x: 400, y: 0, data: { nome: "Cliente / Incorporadora", forma: "reto", escuro: true } },
          fn("eng", 800, 0, "Engenharia do cliente", "cliente"),
          fn("coo", 400, 160, "Coordenação de projetos", "coordenacao", undefined, { destaque: true }),
          fn("arq", 0, 330, "Criação · Arquitetura", "disciplina", "Arquitetura"),
          fn("est", 260, 330, "Estrutural", "disciplina", "Estrutura"),
          fn("ele", 520, 330, "Elétrico", "disciplina", "Elétrico"),
          fn("hid", 780, 330, "Hidrossanitário", "disciplina", "Hidrossanitário"),
          fn("ppi", 1040, 330, "Preventivo de incêndio", "disciplina", "Incêndio"),
          vaga("parq", 30, 480, "Arquiteto(a)"),
          vaga("pest", 290, 480, "Engenheiro(a) estrutural"),
          vaga("pele", 550, 480, "Projetista elétrico"),
          vaga("phid", 810, 480, "Projetista hidrossanitário"),
          vaga("pppi", 1070, 480, "Projetista PPCI"),
        ],
        [
          ["cli", "coo", "subordinacao", "contrata"],
          ["eng", "coo", "interface", "aprova"],
          ["coo", "arq", "subordinacao"],
          ["coo", "est", "subordinacao"],
          ["coo", "ele", "subordinacao"],
          ["coo", "hid", "subordinacao"],
          ["coo", "ppi", "subordinacao"],
          ["arq", "parq", "subordinacao"],
          ["est", "pest", "subordinacao"],
          ["ele", "pele", "subordinacao"],
          ["hid", "phid", "subordinacao"],
          ["ppi", "pppi", "subordinacao"],
        ]
      ),
  },
  {
    id: "unifamiliar",
    nome: "Residência unifamiliar",
    desc: "Cliente, coordenação, arquitetura e complementares enxutos",
    criar: () =>
      montar(
        [
          { k: "cli", type: "empresa", x: 280, y: 0, data: { nome: "Cliente", forma: "reto", escuro: true } },
          fn("coo", 280, 150, "Coordenação e criação", "coordenacao", undefined, { destaque: true }),
          fn("arq", 0, 310, "Arquitetura", "disciplina", "Arquitetura"),
          fn("est", 280, 310, "Estrutural", "disciplina", "Estrutura"),
          fn("com", 560, 310, "Elétrico e hidrossanitário", "disciplina", "Elétrico"),
          vaga("parq", 30, 460, "Arquiteto(a)"),
          vaga("pest", 310, 460, "Engenheiro(a) estrutural"),
          vaga("pcom", 590, 460, "Projetista complementar"),
        ],
        [
          ["cli", "coo", "subordinacao"],
          ["coo", "arq", "subordinacao"],
          ["coo", "est", "subordinacao"],
          ["coo", "com", "subordinacao"],
          ["arq", "parq", "subordinacao"],
          ["est", "pest", "subordinacao"],
          ["com", "pcom", "subordinacao"],
          ["arq", "est", "interface", "compatibiliza"],
        ]
      ),
  },
  { id: "vazio", nome: "Em branco", desc: "Começar do zero", criar: () => ({ nos: [], arestas: [] }) },
];

// Tira as pessoas e deixa as vagas (para copiar a estrutura de outro projeto)
export function soEstrutura(nos: NoSalvo[]): NoSalvo[] {
  return nos.map((n) =>
    n.type === "pessoa" ? { ...n, data: { ...n.data, nome: "A definir", perfil_id: null, convidado_id: null } } : n
  );
}

// ---------- Ligação com a coordenação ----------
// Pessoas ligadas a cada função de disciplina. Retorna disciplina normalizada → chaves "p:<perfil>" / "c:<convite>".
export function responsaveisPorDisciplina(nos: NoSalvo[], arestas: VinculoSalvo[]): Record<string, string[]> {
  const porId = new Map(nos.map((n) => [n.id, n]));
  const out: Record<string, string[]> = {};
  nos.forEach((f) => {
    if (f.type !== "funcao" || !f.data.disciplina) return;
    const chave = norm(f.data.disciplina);
    arestas.forEach((a) => {
      const outro = a.source === f.id ? a.target : a.target === f.id ? a.source : null;
      const p = outro ? porId.get(outro) : undefined;
      if (!p || p.type !== "pessoa") return;
      const k = p.data.convidado_id ? `c:${p.data.convidado_id}` : p.data.perfil_id ? `p:${p.data.perfil_id}` : null;
      if (k) out[chave] = [...new Set([...(out[chave] ?? []), k])];
    });
  });
  return out;
}
