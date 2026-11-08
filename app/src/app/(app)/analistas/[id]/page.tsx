"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp, usePode } from "../../ctx";
import { Cabeca, Vazio } from "../../ui";
import { erroMsg } from "@/lib/util";
import { ACEITOS, CAMADAS, CAMADA_NOME, DOC_TIPO, aceito, nomeArquivo, tamanho, type Analista, type Camada, type Doc, type DocTipo, type Item } from "@/lib/analistas";
import { AbasAnalise } from "../../analises/comum";

type Et = { sigla: string; nome: string };

const DICA: Record<Camada, string> = {
  base: "Escreva como você confere qualquer entrega da EZE: carimbo, legenda, escalas, nomenclatura dos arquivos, padrão das pranchas, premissas que nunca podem faltar.",
  etapa: "Escreva o que esta etapa precisa entregar e como você confere. O que é obrigatório, o que costuma faltar, os erros mais comuns da equipe.",
  municipio: "Escreva o que você confere na legislação desta cidade: zoneamento, taxa de ocupação, coeficiente, gabarito, recuos, afastamentos, vagas, áreas permeáveis, exigências da prefeitura. Cole os artigos em Documentos (texto) ou envie o PDF da lei.",
  estetica: "Escreva o conceito EZE e como você avalia a força criativa: o que é ousado, o que é volumetria forte, como deve ser a composição de cor e a materialidade, o que torna uma fachada EZE. Envie referências boas e ruins em Documentos, com o porquê.",
};

export default function AnalistaPg({ params }: { params: { id: string } }) {
  const { esc, eu } = useApp();
  const editor = usePode("analistas", true);
  const router = useRouter();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [a, setA] = useState<Analista | null | undefined>(undefined);
  const [ed, setEd] = useState<Analista | null>(null);
  const [etapas, setEtapas] = useState<Et[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const carregar = useCallback(async () => {
    const [r, e, i, d] = await Promise.all([
      supabase.from("analistas").select("*").eq("id", params.id).maybeSingle(),
      supabase.from("etapas_modelo").select("sigla,nome").eq("escritorio_id", esc.id).eq("ativo", true).order("ordem"),
      supabase.from("analista_itens").select("*").eq("analista_id", params.id).order("ordem").order("created_at"),
      supabase.from("analista_docs").select("*").eq("analista_id", params.id).order("created_at"),
    ]);
    setA((r.data as Analista) ?? null);
    setEd((x) => x ?? ((r.data as Analista) || null));
    setEtapas((e.data as Et[]) ?? []);
    setItens((i.data as Item[]) ?? []);
    setDocs((d.data as Doc[]) ?? []);
  }, [supabase, params.id, esc.id]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ed) return;
    setErro("");
    setOk("");
    if (!ed.nome.trim()) return setErro("Dê um nome ao analista.");
    if (ed.camada === "etapa" && !ed.etapas.length) return setErro("Marque a etapa deste analista.");
    if (ed.camada === "municipio" && !ed.cidades.length) return setErro("Informe a cidade.");
    const { error } = await supabase
      .from("analistas")
      .update({
        nome: ed.nome.trim(),
        camada: ed.camada,
        etapas: ed.etapas,
        cidades: ed.camada === "municipio" ? ed.cidades : [],
        descricao: ed.descricao?.trim() || null,
        orientacoes: ed.orientacoes,
        ativo: ed.ativo,
        updated_at: new Date().toISOString(),
        atualizado_por: eu.id,
      })
      .eq("id", ed.id);
    if (error) return setErro(erroMsg(error));
    setOk("Salvo.");
    setA({ ...a!, ...ed, descricao: ed.descricao?.trim() || null, cidades: ed.camada === "municipio" ? ed.cidades : [] });
    setEd({ ...ed, descricao: ed.descricao?.trim() || null, cidades: ed.camada === "municipio" ? ed.cidades : [] });
  }

  async function apagar() {
    if (!a || !confirm(`Apagar o analista "${a.nome}" com o checklist e os documentos?`)) return;
    const arqs = docs.filter((d) => d.caminho).map((d) => d.caminho!);
    if (arqs.length) await supabase.storage.from("analises").remove(arqs);
    const { error } = await supabase.from("analistas").delete().eq("id", a.id);
    if (error) return setErro(erroMsg(error));
    router.push("/analistas");
  }

  if (a === undefined) return <p className="note">Carregando…</p>;
  if (a === null || !ed) return <Vazio titulo="Analista não encontrado" />;
  const campos = (x: Analista) => JSON.stringify([x.nome, x.camada, x.etapas, x.cidades, x.descricao ?? "", x.orientacoes, x.ativo]);
  const mudou = campos(ed) !== campos(a);

  return (
    <>
      <Cabeca kicker={`Analista · ${CAMADA_NOME[a.camada]}`} titulo={a.nome}>
        <Link className="btn small" href="/analistas">Voltar</Link>
        {editor && <button className="btn small ghost" type="button" onClick={apagar}>Apagar</button>}
      </Cabeca>
      <AbasAnalise />

      <form className="box stack" onSubmit={salvar} style={{ marginBottom: 16 }}>
        <div className="grid2" style={{ gap: 12 }}>
          <label className="form-l">
            <span>Nome</span>
            <input type="text" value={ed.nome} disabled={!editor} onChange={(e) => setEd({ ...ed, nome: e.target.value })} />
          </label>
          <label className="form-l">
            <span>Camada</span>
            <select className="f" value={ed.camada} disabled={!editor} onChange={(e) => setEd({ ...ed, camada: e.target.value as Camada })}>
              {CAMADAS.map((c) => <option key={c.id} value={c.id}>{c.nome} · {c.desc}</option>)}
            </select>
          </label>
        </div>
        <div className="form-l">
          <span>Entra nas etapas {ed.camada !== "etapa" && <small className="note">(nenhuma marcada = todas)</small>}</span>
          <div className="row" style={{ gap: 6 }}>
            {etapas.map((x) => {
              const on = ed.etapas.includes(x.sigla);
              return (
                <button
                  key={x.sigla}
                  type="button"
                  disabled={!editor}
                  className={`ia-chip${on ? " on" : ""}`}
                  aria-pressed={on}
                  title={x.nome}
                  onClick={() => setEd({ ...ed, etapas: on ? ed.etapas.filter((s) => s !== x.sigla) : [...ed.etapas, x.sigla] })}
                >
                  {x.sigla} · {x.nome}
                </button>
              );
            })}
          </div>
        </div>
        {ed.camada === "municipio" && (
          <label className="form-l">
            <span>Cidade (mais de uma: separe por vírgula)</span>
            <input
              type="text"
              disabled={!editor}
              defaultValue={ed.cidades.join(", ")}
              onChange={(e) => setEd({ ...ed, cidades: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              placeholder="Bombinhas"
            />
          </label>
        )}
        <label className="form-l">
          <span>Descrição curta</span>
          <input type="text" value={ed.descricao ?? ""} disabled={!editor} onChange={(e) => setEd({ ...ed, descricao: e.target.value })} />
        </label>
        <label className="form-l">
          <span>Orientações · como este analista deve pensar</span>
          <textarea className="ia-orient" value={ed.orientacoes} disabled={!editor} onChange={(e) => setEd({ ...ed, orientacoes: e.target.value })} placeholder={DICA[ed.camada]} />
        </label>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={ed.ativo} disabled={!editor} onChange={(e) => setEd({ ...ed, ativo: e.target.checked })} /> Ativo
        </label>
        {erro && <p className="err" role="alert">{erro}</p>}
        {ok && !mudou && <p className="ok" role="status">{ok}</p>}
        {editor && (
          <div className="row">
            <button className="btn dark small" type="submit" disabled={!mudou}>Salvar</button>
            {mudou && <button className="btn small" type="button" onClick={() => setEd(a)}>Desfazer</button>}
          </div>
        )}
      </form>

      <Itens analista={a} itens={itens} editor={editor} recarregar={carregar} />
      <Documentos analista={a} docs={docs} editor={editor} recarregar={carregar} />
    </>
  );
}

// ===================== Checklist e critérios =====================
const ITEM_VAZIO = { grupo: "", texto: "", como_verificar: "", tipo: "checklist" as Item["tipo"], peso: 1, critico: false };

function Itens({ analista, itens, editor, recarregar }: { analista: Analista; itens: Item[]; editor: boolean; recarregar: () => void }) {
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [novo, setNovo] = useState({ ...ITEM_VAZIO, tipo: (analista.camada === "estetica" ? "nota" : "checklist") as Item["tipo"] });
  const [aberto, setAberto] = useState<string | null>(null);
  const [colar, setColar] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const prox = (itens.at(-1)?.ordem ?? 0) + 1;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!novo.texto.trim()) return setErro("Escreva o item.");
    const { error } = await supabase.from("analista_itens").insert({
      escritorio_id: analista.escritorio_id,
      analista_id: analista.id,
      ordem: prox,
      grupo: novo.grupo.trim() || null,
      texto: novo.texto.trim(),
      como_verificar: novo.como_verificar.trim() || null,
      tipo: novo.tipo,
      peso: Number(novo.peso) || 1,
      critico: novo.critico,
    });
    if (error) return setErro(erroMsg(error));
    setNovo({ ...novo, texto: "", como_verificar: "", critico: false });
    recarregar();
  }

  // Uma linha por item. "Grupo: item" vira grupo. "Item | como verificar" separa a verificação.
  async function importar() {
    if (!colar?.trim()) return;
    setErro("");
    const linhas = colar.split("\n").map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
    const regs = linhas.map((l, i) => {
      const [antes, verif] = l.split("|").map((s) => s.trim());
      const m = antes.match(/^([^:]{2,40}):\s*(.+)$/);
      return {
        escritorio_id: analista.escritorio_id,
        analista_id: analista.id,
        ordem: prox + i,
        grupo: m ? m[1].trim() : null,
        texto: m ? m[2].trim() : antes,
        como_verificar: verif || null,
        tipo: analista.camada === "estetica" ? "nota" : "checklist",
        peso: 1,
      };
    });
    const { error } = await supabase.from("analista_itens").insert(regs);
    if (error) return setErro(erroMsg(error));
    setColar(null);
    recarregar();
  }

  async function up(id: string, p: Partial<Item>) {
    const { error } = await supabase.from("analista_itens").update(p).eq("id", id);
    if (error) setErro(erroMsg(error));
    recarregar();
  }
  async function mover(i: number, d: -1 | 1) {
    const x = itens[i];
    const y = itens[i + d];
    if (!x || !y) return;
    await Promise.all([
      supabase.from("analista_itens").update({ ordem: y.ordem }).eq("id", x.id),
      supabase.from("analista_itens").update({ ordem: x.ordem === y.ordem ? x.ordem + d : x.ordem }).eq("id", y.id),
    ]);
    recarregar();
  }
  async function tirar(it: Item) {
    if (!confirm(`Apagar o item "${it.texto}"?`)) return;
    await supabase.from("analista_itens").delete().eq("id", it.id);
    recarregar();
  }

  return (
    <section className="box stack" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="sec-t" style={{ margin: 0 }}>{analista.camada === "estetica" ? "Critérios de nota" : "Checklist"}</p>
          <p className="note" style={{ margin: "2px 0 0" }}>
            {analista.camada === "estetica"
              ? "Cada critério recebe nota de 0 a 10. O peso define quanto conta na nota estética."
              : "A IA marca cada item como conforme, não conforme, verificar ou não se aplica. Crítico = não pode seguir se estiver errado."}
          </p>
        </div>
        {editor && colar === null && <button className="btn small" type="button" onClick={() => setColar("")}>Colar lista</button>}
      </div>

      {colar !== null && (
        <div className="stack" style={{ gap: 8 }}>
          <textarea
            value={colar}
            onChange={(e) => setColar(e.target.value)}
            style={{ minHeight: 180 }}
            placeholder={"Um item por linha. Exemplos:\nImplantação: recuo frontal de 4 m | conferir na planta de situação\nQuadro de áreas completo e somando certo\nFachadas: cotas de nível em todas as fachadas"}
          />
          <div className="row">
            <button className="btn dark small" type="button" onClick={importar}>Adicionar {colar.split("\n").filter((l) => l.trim()).length || ""} itens</button>
            <button className="btn small" type="button" onClick={() => setColar(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {itens.length === 0 ? (
        <p className="note" style={{ margin: 0 }}>Nenhum item ainda.</p>
      ) : (
        <div className="lista">
          {itens.map((it, i) => (
            <div key={it.id} style={{ opacity: it.ativo ? 1 : 0.5 }}>
              <div className="item">
                <span className="ia-n">{i + 1}</span>
                <button type="button" className="item-t linkbtn" style={{ textDecoration: "none", textAlign: "left" }} onClick={() => setAberto(aberto === it.id ? null : it.id)}>
                  <strong style={{ whiteSpace: "normal" }}>{it.grupo && <span className="note">{it.grupo} · </span>}{it.texto}</strong>
                  {it.como_verificar && <small>{it.como_verificar}</small>}
                </button>
                {it.tipo === "nota" && <span className="pill">Nota · peso {String(it.peso).replace(".", ",")}</span>}
                {it.critico && <span className="pill inv">Crítico</span>}
                {editor && (
                  <span className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
                    <button className="btn small ghost" type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>↑</button>
                    <button className="btn small ghost" type="button" aria-label="Descer" disabled={i === itens.length - 1} onClick={() => mover(i, 1)}>↓</button>
                  </span>
                )}
              </div>
              {aberto === it.id && editor && <EditItem it={it} salvar={(p) => { up(it.id, p); setAberto(null); }} tirar={() => tirar(it)} />}
            </div>
          ))}
        </div>
      )}

      {editor && (
        <form className="ia-novo" onSubmit={add}>
          <input type="text" value={novo.grupo} onChange={(e) => setNovo({ ...novo, grupo: e.target.value })} placeholder="Grupo (opcional)" aria-label="Grupo" />
          <input type="text" value={novo.texto} onChange={(e) => setNovo({ ...novo, texto: e.target.value })} placeholder={analista.camada === "estetica" ? "Critério" : "O que verificar"} aria-label="Item" />
          <input type="text" value={novo.como_verificar} onChange={(e) => setNovo({ ...novo, como_verificar: e.target.value })} placeholder="Como verificar (opcional)" aria-label="Como verificar" />
          <select className="f" value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as Item["tipo"] })} aria-label="Tipo">
            <option value="checklist">Checklist</option>
            <option value="nota">Nota 0–10</option>
          </select>
          <button className="btn dark small" type="submit">Adicionar</button>
        </form>
      )}
      {erro && <p className="err" role="alert">{erro}</p>}
    </section>
  );
}

function EditItem({ it, salvar, tirar }: { it: Item; salvar: (p: Partial<Item>) => void; tirar: () => void }) {
  const [f, setF] = useState({ grupo: it.grupo ?? "", texto: it.texto, como_verificar: it.como_verificar ?? "", tipo: it.tipo, peso: it.peso, critico: it.critico, ativo: it.ativo });
  return (
    <div className="stack ia-edit">
      <div className="grid2" style={{ gap: 10 }}>
        <label className="form-l"><span>Grupo</span><input type="text" value={f.grupo} onChange={(e) => setF({ ...f, grupo: e.target.value })} /></label>
        <label className="form-l"><span>Tipo</span>
          <select className="f" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as Item["tipo"] })}>
            <option value="checklist">Checklist</option>
            <option value="nota">Nota 0–10</option>
          </select>
        </label>
      </div>
      <label className="form-l"><span>Item</span><textarea style={{ minHeight: 60 }} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} /></label>
      <label className="form-l"><span>Como verificar</span><textarea style={{ minHeight: 60 }} value={f.como_verificar} onChange={(e) => setF({ ...f, como_verificar: e.target.value })} placeholder="Onde olhar, limite, artigo da lei" /></label>
      <div className="row">
        {f.tipo === "nota" && (
          <label className="row" style={{ gap: 6 }}>Peso <input type="number" min={0.1} step={0.5} value={f.peso} style={{ width: 80 }} onChange={(e) => setF({ ...f, peso: Number(e.target.value) })} /></label>
        )}
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={f.critico} onChange={(e) => setF({ ...f, critico: e.target.checked })} /> Crítico</label>
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativo</label>
      </div>
      <div className="row">
        <button className="btn dark small" type="button" onClick={() => f.texto.trim() && salvar({ ...f, grupo: f.grupo.trim() || null, texto: f.texto.trim(), como_verificar: f.como_verificar.trim() || null, peso: Number(f.peso) || 1 })}>Salvar item</button>
        <button className="btn small ghost" type="button" onClick={tirar}>Apagar</button>
      </div>
    </div>
  );
}

// ===================== Documentos =====================
function Documentos({ analista, docs, editor, recarregar }: { analista: Analista; docs: Doc[]; editor: boolean; recarregar: () => void }) {
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [tipo, setTipo] = useState<DocTipo>(analista.camada === "estetica" ? "ref_boa" : "norma");
  const [comentario, setComentario] = useState("");
  const [texto, setTexto] = useState<{ titulo: string; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const arq = useRef<HTMLInputElement>(null);

  async function enviar(files: FileList | null) {
    if (!files?.length) return;
    setErro("");
    setEnviando(true);
    for (const f of Array.from(files)) {
      if (!aceito(f.type)) {
        setErro(`${f.name}: a IA lê PDF e imagens (PNG, JPG, WEBP).`);
        continue;
      }
      if (f.size > 32 * 1048576) {
        setErro(`${f.name}: limite de 32 MB.`);
        continue;
      }
      const caminho = `${analista.escritorio_id}/analistas/${analista.id}/${Date.now()}-${nomeArquivo(f.name)}`;
      const up = await supabase.storage.from("analises").upload(caminho, f, { contentType: f.type });
      if (up.error) {
        setErro(erroMsg(up.error));
        continue;
      }
      const { error } = await supabase.from("analista_docs").insert({
        escritorio_id: analista.escritorio_id,
        analista_id: analista.id,
        tipo,
        titulo: f.name.replace(/\.[^.]+$/, ""),
        caminho,
        mime: f.type,
        tamanho: f.size,
        comentario: comentario.trim() || null,
      });
      if (error) {
        await supabase.storage.from("analises").remove([caminho]);
        setErro(erroMsg(error));
      }
    }
    setEnviando(false);
    setComentario("");
    if (arq.current) arq.current.value = "";
    recarregar();
  }

  async function salvarTexto(e: React.FormEvent) {
    e.preventDefault();
    if (!texto?.titulo.trim() || !texto.texto.trim()) return setErro("Preencha o título e o texto.");
    const { error } = await supabase.from("analista_docs").insert({
      escritorio_id: analista.escritorio_id,
      analista_id: analista.id,
      tipo,
      titulo: texto.titulo.trim(),
      texto: texto.texto.trim(),
      comentario: comentario.trim() || null,
    });
    if (error) return setErro(erroMsg(error));
    setTexto(null);
    setComentario("");
    recarregar();
  }

  async function abrir(d: Doc) {
    if (!d.caminho) return;
    const w = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("analises").createSignedUrl(d.caminho, 300);
    if (error || !data) {
      w?.close();
      return setErro(erroMsg(error));
    }
    if (w) w.location.href = data.signedUrl;
  }

  async function up(id: string, p: Partial<Doc>) {
    const { error } = await supabase.from("analista_docs").update(p).eq("id", id);
    if (error) setErro(erroMsg(error));
    recarregar();
  }

  async function tirar(d: Doc) {
    if (!confirm(`Apagar "${d.titulo}"?`)) return;
    if (d.caminho) await supabase.storage.from("analises").remove([d.caminho]);
    await supabase.from("analista_docs").delete().eq("id", d.id);
    recarregar();
  }

  const pesoTotal = docs.filter((d) => d.enviar && d.tamanho).reduce((s, d) => s + (d.tamanho || 0), 0);

  return (
    <section className="box stack">
      <div>
        <p className="sec-t" style={{ margin: 0 }}>Documentos e referências</p>
        <p className="note" style={{ margin: "2px 0 0" }}>
          Leis, códigos, projetos de referência (bons e ruins, com o porquê). Os marcados vão junto em toda análise. Para leis longas, prefira colar só os artigos que importam: a análise fica mais barata e mais precisa (limite de 100 páginas de PDF por análise).
        </p>
      </div>

      {docs.length > 0 && (
        <div className="tabela-w" style={{ boxShadow: "none" }}>
          <table className="tabela">
            <thead><tr><th>Documento</th><th>Tipo</th><th>Comentário</th><th>Em toda análise</th>{editor && <th />}</tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="doc-l">
                      <span className="doc-ic">{d.caminho ? (d.mime === "application/pdf" ? "PDF" : "IMG") : "TXT"}</span>
                      {d.caminho ? (
                        <button type="button" className="linkbtn" onClick={() => abrir(d)}>{d.titulo}</button>
                      ) : (
                        <details><summary style={{ cursor: "pointer" }}>{d.titulo}</summary><p className="note" style={{ whiteSpace: "pre-wrap", margin: "6px 0 0", maxHeight: 240, overflow: "auto" }}>{d.texto}</p></details>
                      )}
                    </span>
                    {d.tamanho ? <small className="note"> {tamanho(d.tamanho)}</small> : d.texto ? <small className="note"> {d.texto.length.toLocaleString("pt-BR")} caracteres</small> : null}
                  </td>
                  <td>{DOC_TIPO[d.tipo]}</td>
                  <td className="note">{d.comentario}</td>
                  <td><input type="checkbox" checked={d.enviar} disabled={!editor} aria-label="Enviar em toda análise" onChange={(e) => up(d.id, { enviar: e.target.checked })} /></td>
                  {editor && <td style={{ textAlign: "right" }}><button className="btn small ghost" type="button" onClick={() => tirar(d)}>Apagar</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pesoTotal > 20 * 1048576 && <p className="note" style={{ margin: 0 }}>Os arquivos marcados somam {tamanho(pesoTotal)}. Acima de 30 MB por análise (com as pranchas) a análise não roda.</p>}

      {editor && (
        <div className="stack ia-edit" style={{ gap: 10 }}>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="form-l" style={{ flex: "0 1 200px" }}>
              <span>Tipo</span>
              <select className="f" value={tipo} onChange={(e) => setTipo(e.target.value as DocTipo)}>
                {(Object.keys(DOC_TIPO) as DocTipo[]).map((k) => <option key={k} value={k}>{DOC_TIPO[k]}</option>)}
              </select>
            </label>
            <label className="form-l" style={{ flex: "1 1 300px" }}>
              <span>Comentário (por que é boa ou ruim, o que observar)</span>
              <input type="text" value={comentario} onChange={(e) => setComentario(e.target.value)} />
            </label>
          </div>
          {texto ? (
            <form className="stack" style={{ gap: 8 }} onSubmit={salvarTexto}>
              <input type="text" value={texto.titulo} onChange={(e) => setTexto({ ...texto, titulo: e.target.value })} placeholder="Título (ex.: Plano Diretor de Bombinhas, arts. 40 a 62)" aria-label="Título" />
              <textarea style={{ minHeight: 200 }} value={texto.texto} onChange={(e) => setTexto({ ...texto, texto: e.target.value })} placeholder="Cole aqui os artigos, tabelas ou anotações" aria-label="Texto" />
              <div className="row">
                <button className="btn dark small" type="submit">Salvar texto</button>
                <button className="btn small" type="button" onClick={() => setTexto(null)}>Cancelar</button>
              </div>
            </form>
          ) : (
            <div className="row">
              <input ref={arq} type="file" multiple hidden accept={ACEITOS} onChange={(e) => enviar(e.target.files)} />
              <button className="btn dark small" type="button" disabled={enviando} onClick={() => arq.current?.click()}>{enviando ? "Enviando…" : "Enviar PDF ou imagem"}</button>
              <button className="btn small" type="button" onClick={() => setTexto({ titulo: "", texto: "" })}>Colar texto</button>
            </div>
          )}
        </div>
      )}
      {erro && <p className="err" role="alert">{erro}</p>}
    </section>
  );
}
