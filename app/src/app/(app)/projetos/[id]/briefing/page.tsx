"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../../../ctx";
import { Cabeca, Vazio } from "../../../ui";
import { nomeProjeto } from "@/lib/gestor";
import { dataHora, erroMsg } from "@/lib/util";
import { nomeArquivo } from "@/lib/analistas";
import {
  CAMPOS_CLIENTE, CAMPOS_RESP, LIMITE_REF, PRIORIDADE, refAceita,
  type Briefing, type CamposCliente, type CamposResp, type Objetivo, type Prioridade, type Ref,
} from "@/lib/briefing";
import Refs, { NovaRef } from "../../../../briefing/Refs";

type Proj = { id: string; nome: string; codigo: number | null; tipologia: string | null; escritorio_id: string };

// Briefing do projeto: cliente (pelo link ou pela equipe), responsável e objetivos com prioridade.
// Os objetivos são a régua da camada "Cliente" na pré-análise IA.
export default function BriefingPg({ params }: { params: { id: string } }) {
  const { eu } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [proj, setProj] = useState<Proj | null | undefined>(undefined);
  const [b, setB] = useState<Briefing | null>(null);
  const [cli, setCli] = useState<CamposCliente>({});
  const [resp, setResp] = useState<CamposResp>({});
  const [objs, setObjs] = useState<Objetivo[]>([]);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);
  const [novoObj, setNovoObj] = useState({ texto: "", prioridade: "importante" as Prioridade });
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async (inicial = false) => {
    const [p, br, o, r, ed] = await Promise.all([
      supabase.from("projetos").select("id,nome,codigo,tipologia,escritorio_id").eq("id", params.id).maybeSingle(),
      supabase.from("projeto_briefings").select("*").eq("projeto_id", params.id).maybeSingle(),
      supabase.from("briefing_objetivos").select("*").eq("projeto_id", params.id).order("ordem").order("created_at"),
      supabase.from("briefing_refs").select("*").eq("projeto_id", params.id).order("created_at"),
      supabase.rpc("briefing_edita", { proj: params.id }),
    ]);
    if (br.error) setErro(br.error.message.includes("projeto_briefings") ? "Rode a migração 0013 no Supabase para ativar o briefing." : erroMsg(br.error));
    setProj((p.data as Proj) ?? null);
    setB((br.data as Briefing) ?? null);
    setObjs((o.data as Objetivo[]) ?? []);
    setRefs((r.data as Ref[]) ?? []);
    setPodeEditar(!!ed.data);
    if (inicial && br.data) {
      setCli((br.data as Briefing).cliente || {});
      setResp((br.data as Briefing).responsavel || {});
    }
  }, [supabase, params.id]);
  useEffect(() => {
    carregar(true);
  }, [carregar]);

  // Cria o briefing na primeira vez que alguém mexe
  async function garantir(): Promise<Briefing | null> {
    if (b) return b;
    if (!proj) return null;
    const { data, error } = await supabase.from("projeto_briefings").insert({ projeto_id: proj.id, escritorio_id: proj.escritorio_id, atualizado_por: eu.id }).select("*").single();
    if (error) {
      setErro(erroMsg(error));
      return null;
    }
    setB(data as Briefing);
    return data as Briefing;
  }

  async function salvar() {
    setErro("");
    setOk("");
    const x = await garantir();
    if (!x) return;
    // Só grava a parte do cliente se a equipe mexeu nela (o cliente pode estar preenchendo pelo link)
    const mudouCli = JSON.stringify(cli) !== JSON.stringify(x.cliente ?? {});
    const { error } = await supabase
      .from("projeto_briefings")
      .update({ ...(mudouCli ? { cliente: cli } : {}), responsavel: resp, atualizado_por: eu.id })
      .eq("projeto_id", x.projeto_id);
    if (error) return setErro(erroMsg(error));
    setOk("Briefing salvo.");
    carregar();
  }

  async function link(ativo: boolean) {
    setErro("");
    const x = await garantir();
    if (!x) return;
    const { error } = await supabase.from("projeto_briefings").update({ link_ativo: ativo }).eq("projeto_id", x.projeto_id);
    if (error) return setErro(erroMsg(error));
    carregar();
  }
  const url = b ? `${typeof window !== "undefined" ? window.location.origin : ""}/briefing/${b.link_token}` : "";
  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {}
  }

  // Objetivos
  async function addObj(e: React.FormEvent) {
    e.preventDefault();
    if (!novoObj.texto.trim() || !proj) return;
    const { error } = await supabase.from("briefing_objetivos").insert({
      escritorio_id: proj.escritorio_id, projeto_id: proj.id, texto: novoObj.texto.trim(), prioridade: novoObj.prioridade,
      ordem: (objs.at(-1)?.ordem ?? 0) + 1, origem: "responsavel",
    });
    if (error) return setErro(erroMsg(error));
    setNovoObj({ ...novoObj, texto: "" });
    carregar();
  }
  async function importarObjetivos() {
    if (!proj) return;
    const linhas = (cli.objetivos || "").split("\n").map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
    const ja = new Set(objs.map((o) => o.texto.toLowerCase()));
    const novos = linhas.filter((l) => !ja.has(l.toLowerCase()));
    if (!novos.length) return setOk("Nenhum objetivo novo no texto do cliente.");
    const { error } = await supabase.from("briefing_objetivos").insert(
      novos.map((t, i) => ({ escritorio_id: proj.escritorio_id, projeto_id: proj.id, texto: t, prioridade: "importante", ordem: (objs.at(-1)?.ordem ?? 0) + i + 1, origem: "cliente" }))
    );
    if (error) return setErro(erroMsg(error));
    carregar();
  }
  async function upObj(id: string, p: Partial<Objetivo>) {
    const { error } = await supabase.from("briefing_objetivos").update(p).eq("id", id);
    if (error) setErro(erroMsg(error));
    carregar();
  }
  async function tirarObj(o: Objetivo) {
    if (!confirm(`Apagar o objetivo "${o.texto}"?`)) return;
    await supabase.from("briefing_objetivos").delete().eq("id", o.id);
    carregar();
  }

  // Referências da equipe
  async function addRef({ tipo, comentario, arquivos, link }: { tipo: Ref["tipo"]; comentario: string; arquivos: File[]; link: string }) {
    if (!proj) return;
    setErro("");
    setEnviando(true);
    try {
      for (const f of arquivos) {
        if (!refAceita(f.type)) throw new Error(`${f.name}: envie imagens (JPG, PNG, WEBP) ou PDF.`);
        if (f.size > LIMITE_REF) throw new Error(`${f.name}: limite de 25 MB por arquivo.`);
        const caminho = `${proj.escritorio_id}/${proj.id}/equipe/${Date.now()}-${nomeArquivo(f.name)}`;
        const up = await supabase.storage.from("briefing").upload(caminho, f, { contentType: f.type });
        if (up.error) throw up.error;
        const { error } = await supabase.from("briefing_refs").insert({
          escritorio_id: proj.escritorio_id, projeto_id: proj.id, origem: "responsavel", tipo,
          titulo: f.name.replace(/\.[^.]+$/, ""), comentario: comentario || null, caminho, mime: f.type, tamanho: f.size,
        });
        if (error) throw error;
      }
      if (link.trim()) {
        const u = /^https?:\/\//.test(link.trim()) ? link.trim() : `https://${link.trim()}`;
        const { error } = await supabase.from("briefing_refs").insert({ escritorio_id: proj.escritorio_id, projeto_id: proj.id, origem: "responsavel", tipo, comentario: comentario || null, link: u });
        if (error) throw error;
      }
    } catch (e) {
      setErro(erroMsg(e));
    }
    setEnviando(false);
    carregar();
  }
  async function tirarRef(r: Ref) {
    if (!confirm("Tirar esta referência?")) return;
    if (r.caminho) await supabase.storage.from("briefing").remove([r.caminho]);
    await supabase.from("briefing_refs").delete().eq("id", r.id);
    carregar();
  }

  if (proj === undefined) return <p className="note">Carregando…</p>;
  if (proj === null) return <Vazio titulo="Projeto não encontrado" />;
  const mudou = JSON.stringify(cli) !== JSON.stringify(b?.cliente ?? {}) || JSON.stringify(resp) !== JSON.stringify(b?.responsavel ?? {});
  const refsCli = refs.filter((r) => r.origem === "cliente");
  const refsResp = refs.filter((r) => r.origem !== "cliente");
  const ativos = objs.filter((o) => o.ativo);

  return (
    <>
      <Cabeca kicker={`Briefing${b ? ` · versão ${b.versao}` : ""}`} titulo={nomeProjeto(proj)}>
        <Link className="btn small" href={`/projetos/${proj.id}`}>Voltar ao projeto</Link>
        <Link className="btn small dark" href={`/analises/nova?projeto=${proj.id}`}>Pré-análise IA</Link>
      </Cabeca>
      <p className="note" style={{ margin: "-10px 0 20px", maxWidth: 760 }}>
        O projeto precisa, antes de tudo, atender o objetivo do cliente. Os objetivos abaixo entram sozinhos em toda pré-análise deste projeto, que dá uma nota de aderência a eles.
      </p>
      {erro && <p className="err" role="alert" style={{ marginBottom: 12 }}>{erro}</p>}

      {/* Objetivos */}
      <section className="box stack" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <p className="sec-t" style={{ margin: 0 }}>Objetivos do projeto</p>
            <p className="note" style={{ margin: "2px 0 0" }}>A régua da IA. Poucos e claros. Essencial pesa 3, importante 2, desejável 1.</p>
          </div>
          {podeEditar && cli.objetivos?.trim() && <button className="btn small" type="button" onClick={importarObjetivos}>Trazer objetivos do cliente</button>}
        </div>
        {objs.length === 0 ? (
          <p className="note" style={{ margin: 0 }}>Nenhum objetivo ainda. Sem objetivos, a pré-análise avisa que o projeto não tem briefing.</p>
        ) : (
          <div className="lista">
            {objs.map((o, i) => (
              <div key={o.id} className="item" style={{ opacity: o.ativo ? 1 : 0.5 }}>
                <span className="ia-n">{i + 1}</span>
                <span className="item-t">
                  <strong style={{ whiteSpace: "normal", fontWeight: 500 }}>{o.texto}</strong>
                  <small>{o.origem === "cliente" ? "Do cliente" : "Do responsável"}</small>
                </span>
                {podeEditar ? (
                  <>
                    <select className="f" style={{ width: 140 }} value={o.prioridade} onChange={(e) => upObj(o.id, { prioridade: e.target.value as Prioridade })} aria-label="Prioridade">
                      {(Object.keys(PRIORIDADE) as Prioridade[]).map((k) => <option key={k} value={k}>{PRIORIDADE[k]}</option>)}
                    </select>
                    <label className="row note" style={{ gap: 4 }}><input type="checkbox" checked={o.ativo} onChange={(e) => upObj(o.id, { ativo: e.target.checked })} /> Ativo</label>
                    <button className="btn small ghost" type="button" onClick={() => tirarObj(o)}>Apagar</button>
                  </>
                ) : (
                  <span className={o.prioridade === "essencial" ? "pill inv" : o.prioridade === "importante" ? "pill" : "pill dash"}>{PRIORIDADE[o.prioridade]}</span>
                )}
              </div>
            ))}
          </div>
        )}
        {podeEditar && (
          <form className="row" onSubmit={addObj} style={{ flexWrap: "nowrap" }}>
            <input type="text" value={novoObj.texto} onChange={(e) => setNovoObj({ ...novoObj, texto: e.target.value })} placeholder="Ex.: Vista para o mar em todas as unidades" aria-label="Novo objetivo" />
            <select className="f" style={{ width: 150 }} value={novoObj.prioridade} onChange={(e) => setNovoObj({ ...novoObj, prioridade: e.target.value as Prioridade })} aria-label="Prioridade">
              {(Object.keys(PRIORIDADE) as Prioridade[]).map((k) => <option key={k} value={k}>{PRIORIDADE[k]}</option>)}
            </select>
            <button className="btn dark small" type="submit">Adicionar</button>
          </form>
        )}
        {ativos.length > 0 && <p className="note" style={{ margin: 0 }}>{ativos.filter((o) => o.prioridade === "essencial").length} essenciais · {ativos.filter((o) => o.prioridade === "importante").length} importantes · {ativos.filter((o) => o.prioridade === "desejavel").length} desejáveis</p>}
      </section>

      <div className="grid2" style={{ alignItems: "start" }}>
        {/* Cliente */}
        <section className="box stack">
          <div>
            <p className="mono" style={{ marginBottom: 4 }}>Orientações do cliente</p>
            <p className="sec-t" style={{ margin: 0 }}>{b?.cliente_nome ? `Respondido por ${b.cliente_nome}` : "Cliente"}</p>
            {b?.cliente_enviado_em && <p className="note" style={{ margin: "2px 0 0" }}>Enviado pelo link em {dataHora(b.cliente_enviado_em)}</p>}
          </div>
          {podeEditar && (
            <div className="br-link">
              {b?.link_ativo ? (
                <>
                  <p className="note" style={{ margin: "0 0 8px" }}>Link ativo. O cliente preenche e envia imagens sem criar conta.</p>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <input type="text" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link do cliente" />
                    <button className="btn small" type="button" onClick={copiar}>{copiado ? "Copiado" : "Copiar"}</button>
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <a className="btn small" href={`https://wa.me/?text=${encodeURIComponent(`Olá! Para começarmos o projeto ${proj.nome}, preencha o briefing neste link: ${url}`)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
                    <button className="btn small ghost" type="button" onClick={() => link(false)}>Desativar link</button>
                  </div>
                </>
              ) : (
                <div className="row">
                  <button className="btn dark small" type="button" onClick={() => link(true)}>Gerar link para o cliente</button>
                  <span className="note">ou preencha abaixo a partir da reunião</span>
                </div>
              )}
            </div>
          )}
          {CAMPOS_CLIENTE.map((c) => (
            <label key={c.k} className="form-l">
              <span>{c.t}</span>
              {c.curto ? (
                <input type="text" value={cli[c.k] ?? ""} disabled={!podeEditar} onChange={(e) => setCli({ ...cli, [c.k]: e.target.value })} placeholder={c.dica} />
              ) : (
                <textarea value={cli[c.k] ?? ""} disabled={!podeEditar} onChange={(e) => setCli({ ...cli, [c.k]: e.target.value })} placeholder={c.dica} />
              )}
            </label>
          ))}
          <p className="sec-t" style={{ margin: "8px 0 0" }}>Referências do cliente</p>
          <Refs refs={refsCli} tirar={podeEditar ? tirarRef : undefined} vazio="O cliente ainda não enviou imagens." />
        </section>

        {/* Responsável */}
        <section className="box stack">
          <div>
            <p className="mono" style={{ marginBottom: 4 }}>Briefing do responsável</p>
            <p className="sec-t" style={{ margin: 0 }}>Leitura da equipe</p>
          </div>
          {CAMPOS_RESP.map((c) => (
            <label key={c.k} className="form-l">
              <span>{c.t}</span>
              <textarea value={resp[c.k] ?? ""} disabled={!podeEditar} onChange={(e) => setResp({ ...resp, [c.k]: e.target.value })} placeholder={c.dica} />
            </label>
          ))}
          <p className="sec-t" style={{ margin: "8px 0 0" }}>Referências da equipe</p>
          {podeEditar && <NovaRef enviar={addRef} ocupado={enviando} />}
          <Refs refs={refsResp} tirar={podeEditar ? tirarRef : undefined} vazio="Nenhuma referência da equipe ainda." />
        </section>
      </div>

      {podeEditar && (
        <div className="painel" style={{ marginTop: 16 }}>
          <div className="box row" style={{ justifyContent: "space-between", padding: "12px 18px" }}>
            <span className="note">{mudou ? "Há alterações não salvas." : ok || (b ? `Atualizado em ${dataHora(b.updated_at)}` : "Briefing ainda não salvo.")}</span>
            <button className="btn dark small" type="button" disabled={!mudou} onClick={salvar}>Salvar briefing</button>
          </div>
        </div>
      )}
    </>
  );
}
