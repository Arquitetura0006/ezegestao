import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServidor } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CAMADA_NOME, DOC_TIPO, ordenar, type Analise, type Analista, type Doc, type Item, type Parecer } from "@/lib/analistas";

// Pré-análise com IA. A tela chama esta rota, que responde na hora (202) e segue
// analisando em segundo plano; a tela acompanha pelo status da análise.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MODELO = process.env.ANALISE_MODELO || "claude-sonnet-5-5";
const LIMITE_TOTAL = 30 * 1048576; // a API aceita até 32 MB por pedido

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const sb = supabaseServidor();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Entre de novo no sistema." }, { status: 401 });

  const { data: a } = await sb.from("analises").select("*").eq("id", params.id).maybeSingle();
  if (!a) return NextResponse.json({ erro: "Análise não encontrada." }, { status: 404 });
  const an = a as Analise;
  const { data: editor } = await sb.rpc("pode", { esc: an.escritorio_id, modulo: "analistas", editar: true });
  if (an.enviado_por !== user.id && !editor) return NextResponse.json({ erro: "Só quem enviou pode pedir a análise." }, { status: 403 });
  const travada = an.status === "analisando" && an.iniciada_em && Date.now() - new Date(an.iniciada_em).getTime() < 6 * 60e3;
  if (travada) return NextResponse.json({ erro: "Esta análise já está rodando." }, { status: 409 });

  let adm: SupabaseClient;
  try {
    adm = supabaseAdmin();
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    await adm.from("analises").update({ status: "erro", erro: "Falta a variável ANTHROPIC_API_KEY na Vercel." }).eq("id", an.id);
    return NextResponse.json({ erro: "Falta a variável ANTHROPIC_API_KEY na Vercel." }, { status: 500 });
  }

  await adm.from("analises").update({ status: "analisando", iniciada_em: new Date().toISOString(), erro: null }).eq("id", an.id);
  waitUntil(
    rodar(adm, an).catch(async (e) => {
      await adm
        .from("analises")
        .update({ status: "erro", erro: String((e as Error)?.message || e).slice(0, 1000) })
        .eq("id", an.id);
    })
  );
  return NextResponse.json({ ok: true }, { status: 202 });
}

type Bloco = Record<string, unknown>;

async function baixar(adm: SupabaseClient, caminho: string): Promise<{ b64: string; bytes: number }> {
  const { data, error } = await adm.storage.from("analises").download(caminho);
  if (error || !data) throw new Error(`Não foi possível ler o arquivo ${caminho.split("/").pop()}.`);
  const buf = Buffer.from(await data.arrayBuffer());
  return { b64: buf.toString("base64"), bytes: buf.length };
}

function blocoArquivo(mime: string, b64: string, titulo: string, contexto?: string): Bloco {
  if (mime === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 }, title: titulo.slice(0, 200), ...(contexto ? { context: contexto.slice(0, 2000) } : {}) };
  }
  return { type: "image", source: { type: "base64", media_type: mime, data: b64 } };
}

const SISTEMA = `Você é a pré-análise de projetos do escritório EZE Arquitetura e Engenharia (Bombinhas, SC), especializado em edifícios residenciais multifamiliares com fachadas criativas.
Antes de o arquiteto responsável aprovar uma entrega, você confere o material enviado com as regras dos analistas cadastrados pelo escritório. Cada analista é uma camada: Base EZE (vale para todo projeto), Etapa (o que a etapa precisa conter), Município (legislação da cidade) e Estética (força criativa, com nota de 0 a 10 por critério).

Regras:
- Siga as orientações e o checklist de cada analista. Avalie cada item do checklist e cada critério de nota, usando o item_id informado.
- Baseie-se só no que está nos arquivos enviados. Se não der para verificar um item pelo material (falta prancha, cota ilegível, informação ausente), marque "verificar" e diga o que falta. Nunca invente medidas, índices ou artigos de lei.
- Ao citar legislação, use apenas o que está nos documentos do analista de município. Se a regra não estiver lá, diga que não foi verificada.
- Indique onde está cada problema (prancha, página, vista, ambiente) sempre que possível.
- Notas estéticas: 0 a 10, com justificativa curta e objetiva, comparando com as referências boas e ruins do analista quando houver.
- Seja direto e técnico, em português do Brasil. Não dê a decisão final: ela é sempre do arquiteto responsável.
- Responda chamando a ferramenta registrar_parecer uma única vez.`;

const FERRAMENTA = {
  name: "registrar_parecer",
  description: "Registra o parecer da pré-análise, separado por analista (camada).",
  input_schema: {
    type: "object",
    properties: {
      resumo: { type: "string", description: "Resumo geral em até 5 frases: estado da entrega e o que mais pesa." },
      camadas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            analista_id: { type: "string" },
            analista: { type: "string", description: "Nome do analista" },
            camada: { type: "string", enum: ["base", "etapa", "municipio", "estetica"] },
            resumo: { type: "string" },
            itens: {
              type: "array",
              description: "Um por item do checklist do analista",
              items: {
                type: "object",
                properties: {
                  item_id: { type: "string" },
                  texto: { type: "string", description: "O item avaliado" },
                  status: { type: "string", enum: ["conforme", "nao_conforme", "verificar", "nao_se_aplica"] },
                  comentario: { type: "string" },
                  onde: { type: "string", description: "Prancha, página ou vista" },
                },
                required: ["texto", "status"],
              },
            },
            notas: {
              type: "array",
              description: "Um por critério de nota (camada estética ou itens do tipo nota)",
              items: {
                type: "object",
                properties: {
                  item_id: { type: "string" },
                  criterio: { type: "string" },
                  nota: { type: "number", minimum: 0, maximum: 10 },
                  comentario: { type: "string" },
                },
                required: ["criterio", "nota"],
              },
            },
            observacoes: {
              type: "array",
              description: "Pontos que as orientações pedem e não estão no checklist",
              items: { type: "object", properties: { texto: { type: "string" }, onde: { type: "string" } }, required: ["texto"] },
            },
          },
          required: ["analista_id", "analista", "camada", "resumo"],
        },
      },
      correcoes_prioritarias: {
        type: "array",
        description: "As correções mais importantes, da mais grave para a menos grave",
        items: {
          type: "object",
          properties: { texto: { type: "string" }, onde: { type: "string" }, gravidade: { type: "string", enum: ["alta", "media", "baixa"] } },
          required: ["texto", "gravidade"],
        },
      },
      pontos_fortes: { type: "array", items: { type: "string" } },
      nao_verificado: { type: "array", description: "O que não deu para verificar e por quê", items: { type: "string" } },
    },
    required: ["resumo", "camadas"],
  },
};

async function rodar(adm: SupabaseClient, a: Analise) {
  if (!a.analistas_ids?.length) throw new Error("Nenhum analista escolhido para esta análise.");
  const ids = a.analistas_ids;
  const [{ data: ans }, { data: its }, { data: dcs }] = await Promise.all([
    adm.from("analistas").select("*").eq("escritorio_id", a.escritorio_id).in("id", ids).eq("ativo", true),
    adm.from("analista_itens").select("*").eq("escritorio_id", a.escritorio_id).in("analista_id", ids).eq("ativo", true).order("ordem"),
    adm.from("analista_docs").select("*").eq("escritorio_id", a.escritorio_id).in("analista_id", ids).eq("enviar", true).order("created_at"),
  ]);
  const itens = (its as Item[]) ?? [];
  const docs = (dcs as Doc[]) ?? [];
  const todos = ordenar((ans as Analista[]) ?? []);
  const comConteudo = todos.filter((x) => x.orientacoes.trim() || itens.some((i) => i.analista_id === x.id) || docs.some((d) => d.analista_id === x.id));
  const ignorados = todos.filter((x) => !comConteudo.includes(x)).map((x) => x.nome);
  if (!comConteudo.length) throw new Error("Nenhum dos analistas escolhidos tem orientações, checklist ou documentos. Alimente pelo menos um em Analistas.");
  if (!a.arquivos?.length) throw new Error("Envie pelo menos um PDF ou imagem para analisar.");

  // Contexto do projeto
  let projeto = "";
  if (a.projeto_id) {
    const { data: p } = await adm.from("projetos").select("nome,codigo,cidade,tipologia,area_m2,endereco").eq("id", a.projeto_id).maybeSingle();
    if (p) projeto = [p.codigo ? `${String(p.codigo).padStart(3, "0")} ${p.nome}` : p.nome, p.tipologia && `tipologia ${p.tipologia}`, p.area_m2 && `${p.area_m2} m²`, p.endereco].filter(Boolean).join(" · ");
  }
  let etapa = a.etapa_sigla || "";
  if (a.etapa_sigla) {
    const { data: e } = await adm.from("etapas_modelo").select("nome").eq("escritorio_id", a.escritorio_id).eq("sigla", a.etapa_sigla).maybeSingle();
    if (e?.nome) etapa = `${a.etapa_sigla} · ${e.nome}`;
  }

  // 1. Conhecimento dos analistas (fica em cache entre análises iguais)
  let total = 0;
  const conhecimento: Bloco[] = [{ type: "text", text: "CONHECIMENTO DOS ANALISTAS DO ESCRITÓRIO" }];
  for (const an of comConteudo) {
    const meus = itens.filter((i) => i.analista_id === an.id);
    const linhas = meus.map((i) => {
      const extra = [i.tipo === "nota" ? `nota 0 a 10, peso ${i.peso}` : null, i.critico ? "CRÍTICO" : null].filter(Boolean).join(", ");
      return `- [${i.id}]${i.grupo ? ` (${i.grupo})` : ""} ${i.texto}${i.como_verificar ? ` — como verificar: ${i.como_verificar}` : ""}${extra ? ` [${extra}]` : ""}`;
    });
    const textos = docs
      .filter((d) => d.analista_id === an.id && d.texto?.trim())
      .map((d) => `### ${DOC_TIPO[d.tipo]}: ${d.titulo}${d.comentario ? `\nComentário do escritório: ${d.comentario}` : ""}\n${d.texto}`);
    conhecimento.push({
      type: "text",
      text: [
        `<analista id="${an.id}" camada="${an.camada}" nome="${an.nome}">`,
        `Camada: ${CAMADA_NOME[an.camada]}${an.cidades.length ? ` · Cidade: ${an.cidades.join(", ")}` : ""}`,
        an.descricao ? `Descrição: ${an.descricao}` : "",
        an.orientacoes.trim() ? `## Orientações\n${an.orientacoes.trim()}` : "",
        linhas.length ? `## Checklist e critérios\n${linhas.join("\n")}` : "",
        textos.length ? `## Documentos (texto)\n${textos.join("\n\n")}` : "",
        `</analista>`,
      ].filter(Boolean).join("\n"),
    });
    for (const d of docs.filter((x) => x.analista_id === an.id && x.caminho && x.mime)) {
      const { b64, bytes } = await baixar(adm, d.caminho!);
      total += bytes;
      if (total > LIMITE_TOTAL) throw new Error("Os arquivos somam mais de 30 MB. Desmarque \"Enviar em toda análise\" em algum documento ou cole só os artigos necessários.");
      conhecimento.push({ type: "text", text: `Documento do analista "${an.nome}" — ${DOC_TIPO[d.tipo]}: ${d.titulo}${d.comentario ? `. Comentário: ${d.comentario}` : ""}` });
      conhecimento.push(blocoArquivo(d.mime!, b64, d.titulo, d.comentario || undefined));
    }
  }
  conhecimento[conhecimento.length - 1].cache_control = { type: "ephemeral" };

  // 2. Material enviado
  const material: Bloco[] = [{ type: "text", text: "MATERIAL ENVIADO PARA PRÉ-ANÁLISE" }];
  for (const f of a.arquivos) {
    const { b64, bytes } = await baixar(adm, f.caminho);
    total += bytes;
    if (total > LIMITE_TOTAL) throw new Error("Os arquivos somam mais de 30 MB. Envie as pranchas em PDF mais leve ou em partes.");
    material.push({ type: "text", text: `Arquivo: ${f.nome}` });
    material.push(blocoArquivo(f.mime, b64, f.nome));
  }

  // 3. Pedido
  const pedido = [
    "Faça a pré-análise desta entrega.",
    `Título: ${a.titulo}`,
    projeto && `Projeto: ${projeto}`,
    etapa && `Etapa: ${etapa}`,
    a.cidade && `Cidade: ${a.cidade}`,
    a.obs && `O arquiteto pede atenção a: ${a.obs}`,
    `Analistas desta análise (avalie todos, na ordem): ${comConteudo.map((x) => `${x.nome} [${x.id}]`).join("; ")}.`,
  ].filter(Boolean).join("\n");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 16000,
      system: SISTEMA,
      tools: [FERRAMENTA],
      tool_choice: { type: "tool", name: "registrar_parecer" },
      messages: [{ role: "user", content: [...conhecimento, ...material, { type: "text", text: pedido }] }],
    }),
    signal: AbortSignal.timeout(285e3),
  });
  const j = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = j?.error?.message || `Erro ${resp.status} na API da IA.`;
    throw new Error(resp.status === 401 ? "Chave da API inválida (ANTHROPIC_API_KEY)." : msg);
  }
  const uso = j?.usage
    ? { entrada: j.usage.input_tokens, saida: j.usage.output_tokens, cache_lida: j.usage.cache_read_input_tokens ?? 0, cache_criada: j.usage.cache_creation_input_tokens ?? 0 }
    : null;
  if (j?.stop_reason === "max_tokens") throw new Error("O parecer ficou longo demais e foi cortado. Envie menos pranchas por vez.");
  const tool = (j?.content as { type: string; name?: string; input?: Parecer }[] | undefined)?.find((c) => c.type === "tool_use" && c.name === "registrar_parecer");
  if (!tool?.input) throw new Error("A IA não devolveu o parecer no formato esperado. Tente de novo.");
  const parecer: Parecer = { ...tool.input, ignorados: ignorados.length ? ignorados : undefined };

  // Nota estética ponderada pelos pesos dos critérios
  const pesos = new Map(itens.map((i) => [i.id, Number(i.peso) || 1]));
  let soma = 0;
  let peso = 0;
  for (const c of parecer.camadas ?? []) {
    if (c.camada !== "estetica") continue;
    for (const n of c.notas ?? []) {
      const w = (n.item_id && pesos.get(n.item_id)) || 1;
      soma += Math.max(0, Math.min(10, Number(n.nota) || 0)) * w;
      peso += w;
    }
  }
  const nota = peso ? Math.round((soma / peso) * 10) / 10 : null;

  const { error } = await adm
    .from("analises")
    .update({ status: "concluida", resultado: parecer, nota, modelo: j?.model || MODELO, uso, erro: null, concluida_em: new Date().toISOString() })
    .eq("id", a.id);
  if (error) throw new Error(error.message);
}
