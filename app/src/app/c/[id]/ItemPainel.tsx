"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import {
  BUCKET, PRIORIDADE, STATUS_ITEM, chavePessoa, nomeSeguro, num, vencido,
  type Item, type Mensagem, type Modelo, type Pessoa, type Prioridade, type ProjetoCoord, type StatusItem,
} from "@/lib/coord";
import { dataCurta, dataHora, erroMsg } from "@/lib/util";
import { Avatar } from "@/app/(app)/ui";
import type { Eu } from "./Coordenacao";

export default function ItemPainel({
  item, projeto, eu, pessoas, modelos, etapas, tipos, souResp, onClose, onChange, irPara, avisar,
}: {
  item: Item; projeto: ProjetoCoord; eu: Eu; pessoas: Pessoa[]; modelos: Modelo[];
  etapas: { sigla: string; nome: string }[]; tipos: string[]; souResp: boolean;
  onClose: () => void; onChange: () => void; irPara: () => void; avisar: (t: string) => void;
}) {
  const supabase = useMemo(() => supabaseNavegador(), []);
  const coordena = projeto.coordena;
  const [msgs, setMsgs] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [decisao, setDecisao] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [printUrl, setPrintUrl] = useState<string | null>(null);
  const [ampliar, setAmpliar] = useState(false);
  const [ed, setEd] = useState<Item | null>(null);
  const [edResp, setEdResp] = useState<string[]>([]);
  const fim = useRef<HTMLDivElement>(null);

  const porPerfil = useMemo(() => {
    const m: Record<string, Pessoa> = {};
    pessoas.forEach((p) => p.perfil_id && (m[p.perfil_id] = p));
    return m;
  }, [pessoas]);
  const resp = (item.coord_responsaveis ?? []).map((r) => pessoas.find((p) => chavePessoa(p) === chavePessoa(r))).filter(Boolean) as Pessoa[];
  const modelo = modelos.find((m) => m.id === item.modelo_id);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("coord_mensagens").select("id,item_id,autor_id,tipo,texto,anexo_caminho,anexo_nome,created_at").eq("item_id", item.id).order("created_at");
    setMsgs((data as Mensagem[]) ?? []);
  }, [supabase, item.id]);

  useEffect(() => {
    carregar();
    const canal = supabase
      .channel(`cmsg-${item.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "coord_mensagens", filter: `item_id=eq.${item.id}` }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, item.id, carregar]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);

  useEffect(() => {
    setPrintUrl(null);
    if (item.print_caminho)
      supabase.storage.from(BUCKET).createSignedUrl(item.print_caminho, 3600).then(({ data }) => setPrintUrl(data?.signedUrl ?? null));
  }, [supabase, item.print_caminho]);

  async function status(s: StatusItem) {
    const { error } = await supabase.from("coord_itens").update({ status: s }).eq("id", item.id);
    if (error) return avisar(erroMsg(error));
    onChange();
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim() && !arquivo) return;
    setEnviando(true);
    try {
      let anexo_caminho: string | null = null;
      let anexo_nome: string | null = null;
      if (arquivo) {
        anexo_caminho = `${projeto.escritorio_id}/${projeto.id}/itens/${item.id}/${Date.now()}-${nomeSeguro(arquivo.name)}`;
        const up = await supabase.storage.from(BUCKET).upload(anexo_caminho, arquivo, { contentType: arquivo.type || undefined });
        if (up.error) throw up.error;
        anexo_nome = arquivo.name;
      }
      const { error } = await supabase.from("coord_mensagens").insert({
        projeto_id: projeto.id,
        escritorio_id: projeto.escritorio_id,
        item_id: item.id,
        autor_id: eu.id,
        tipo: decisao && coordena ? "decisao" : "msg",
        texto: texto.trim() || anexo_nome || "Anexo",
        anexo_caminho,
        anexo_nome,
      });
      if (error) throw error;
      setTexto("");
      setArquivo(null);
      setDecisao(false);
      carregar();
    } catch (er) {
      avisar(erroMsg(er));
    } finally {
      setEnviando(false);
    }
  }

  async function abrirAnexo(caminho: string) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  async function apagarMsg(id: string) {
    await supabase.from("coord_mensagens").delete().eq("id", id);
    carregar();
  }

  function editar() {
    setEd({ ...item });
    setEdResp((item.coord_responsaveis ?? []).map(chavePessoa));
  }

  async function salvarEd(e: React.FormEvent) {
    e.preventDefault();
    if (!ed) return;
    const { error } = await supabase.from("coord_itens").update({
      titulo: ed.titulo.trim() || item.titulo,
      descricao: ed.descricao?.trim() || null,
      modelo_id: ed.modelo_id || null,
      etapa: ed.etapa || null,
      tipo: ed.tipo || null,
      prioridade: ed.prioridade,
      prazo: ed.prazo || null,
      interno: ed.interno,
    }).eq("id", item.id);
    if (error) return avisar(erroMsg(error));
    const atuais = (item.coord_responsaveis ?? []).map(chavePessoa);
    const sair = atuais.filter((k) => !edResp.includes(k));
    const entrar = edResp.filter((k) => !atuais.includes(k));
    for (const k of sair) {
      const [t, id] = k.split(":");
      await supabase.from("coord_responsaveis").delete().eq("item_id", item.id).eq(t === "c" ? "convidado_id" : "perfil_id", id);
    }
    if (entrar.length) {
      const r = await supabase.from("coord_responsaveis").insert(
        entrar.map((k) => {
          const [t, id] = k.split(":");
          return t === "c" ? { item_id: item.id, convidado_id: id } : { item_id: item.id, perfil_id: id };
        })
      );
      if (r.error) return avisar(erroMsg(r.error));
    }
    setEd(null);
    onChange();
  }

  async function excluir() {
    if (!window.confirm(`Excluir o apontamento ${num(item.numero)}? A conversa também será apagada.`)) return;
    const { error } = await supabase.from("coord_itens").delete().eq("id", item.id);
    if (error) return avisar(erroMsg(error));
    onClose();
    onChange();
  }

  // Leva o responsável da equipe para uma sala de reunião da Sala virtual
  async function chamar(p: Pessoa) {
    if (!p.perfil_id) return;
    const { data: amb } = await supabase.from("ambientes").select("id,nome,link_chamada").eq("escritorio_id", projeto.escritorio_id).eq("tipo", "reuniao").order("ordem").limit(1).maybeSingle();
    if (!amb) return avisar("Nenhuma sala de reunião cadastrada na Sala.");
    const { error } = await supabase.from("chamados").insert({ escritorio_id: projeto.escritorio_id, de: eu.id, para: p.perfil_id, ambiente_id: amb.id });
    if (error) return avisar(erroMsg(error));
    await supabase.from("coord_mensagens").insert({
      projeto_id: projeto.id, escritorio_id: projeto.escritorio_id, item_id: item.id, autor_id: eu.id, tipo: "msg",
      texto: `Chamei ${p.nome} para a ${amb.nome} para tratar este apontamento.`,
    });
    if (amb.link_chamada) window.open(amb.link_chamada, "_blank", "noopener");
    avisar(`${p.nome} foi chamado para a ${amb.nome}.`);
  }

  const podeStatus: StatusItem[] = coordena
    ? (["aberto", "em_correcao", "respondido", "validado"] as StatusItem[])
    : souResp && item.status !== "validado"
      ? (["em_correcao", "respondido"] as StatusItem[])
      : [];

  const elegiveis = pessoas.filter((p) => p.perfil_id || p.convidado_id);

  return (
    <aside className="cd-painel" aria-label={`Apontamento ${num(item.numero)}`}>
      <div className="cd-painel-h">
        <div style={{ minWidth: 0 }}>
          <p className="mono">{num(item.numero)}{modelo ? ` · ${modelo.nome}` : ""}{item.interno ? " · Interno" : ""}</p>
          <h2 className="h-m" style={{ margin: "2px 0 0" }}>{item.titulo}</h2>
        </div>
        <button type="button" className="btn small ghost" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="cd-painel-c">
        {ed ? (
          <form className="stack" onSubmit={salvarEd}>
            <input type="text" value={ed.titulo} onChange={(e) => setEd({ ...ed, titulo: e.target.value })} />
            <textarea value={ed.descricao ?? ""} onChange={(e) => setEd({ ...ed, descricao: e.target.value })} placeholder="Descrição" />
            <div className="grid2" style={{ gap: 8 }}>
              <select className="f" value={ed.modelo_id ?? ""} onChange={(e) => setEd({ ...ed, modelo_id: e.target.value || null })} aria-label="Disciplina">
                <option value="">Geral</option>
                {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
              <select className="f" value={ed.etapa ?? ""} onChange={(e) => setEd({ ...ed, etapa: e.target.value || null })} aria-label="Etapa">
                <option value="">Etapa</option>
                {etapas.map((x) => <option key={x.sigla} value={x.sigla}>{x.sigla} · {x.nome}</option>)}
              </select>
              <select className="f" value={ed.tipo ?? ""} onChange={(e) => setEd({ ...ed, tipo: e.target.value || null })} aria-label="Tipo">
                <option value="">Tipo</option>
                {[...new Set([...tipos, ...(ed.tipo ? [ed.tipo] : [])])].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <select className="f" value={ed.prioridade} onChange={(e) => setEd({ ...ed, prioridade: e.target.value as Prioridade })} aria-label="Prioridade">
                {(Object.keys(PRIORIDADE) as Prioridade[]).map((k) => <option key={k} value={k}>{PRIORIDADE[k]}</option>)}
              </select>
              <input type="date" value={ed.prazo ?? ""} onChange={(e) => setEd({ ...ed, prazo: e.target.value || null })} aria-label="Prazo" />
            </div>
            <div className="row" style={{ gap: 6 }}>
              {elegiveis.map((p) => {
                const k = chavePessoa(p);
                const on = edResp.includes(k);
                return (
                  <button key={k} type="button" className={`pill${on ? " inv" : ""}`} style={{ border: 0, cursor: "pointer" }} onClick={() => setEdResp(on ? edResp.filter((x) => x !== k) : [...edResp, k])}>{p.nome}</button>
                );
              })}
            </div>
            <label className="row" style={{ gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={ed.interno} onChange={(e) => setEd({ ...ed, interno: e.target.checked })} /> Interno
            </label>
            <div className="row">
              <button className="btn small dark" type="submit">Salvar</button>
              <button className="btn small" type="button" onClick={() => setEd(null)}>Cancelar</button>
              <button className="btn small ghost" type="button" style={{ marginLeft: "auto" }} onClick={excluir}>Excluir</button>
            </div>
          </form>
        ) : (
          <>
            <div className="status-linha">
              {podeStatus.length > 0
                ? podeStatus.map((s) => (
                    <button key={s} type="button" className={`pill${item.status === s ? " inv" : ""}`} style={{ border: 0, cursor: "pointer" }} onClick={() => item.status !== s && status(s)}>
                      {s === "aberto" && item.status !== "aberto" ? "Reabrir" : STATUS_ITEM[s]}
                    </button>
                  ))
                : <span className="pill inv">{STATUS_ITEM[item.status]}</span>}
            </div>

            <dl className="ficha" style={{ marginTop: 14 }}>
              <dt>Responsáveis</dt>
              <dd>
                {resp.length === 0 ? <span className="note">Ninguém</span> : resp.map((p) => (
                  <span key={chavePessoa(p)} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    {p.nome}{p.grupo !== "equipe" && p.empresa ? <span className="note"> · {p.empresa}</span> : null}
                    {coordena && projeto.equipe && p.grupo === "equipe" && p.perfil_id && p.perfil_id !== eu.id && (
                      <button type="button" className="linkbtn" style={{ fontSize: 13 }} onClick={() => chamar(p)}>Chamar</button>
                    )}
                  </span>
                ))}
              </dd>
              {item.prazo && (<><dt>Prazo</dt><dd className={vencido(item) ? "atras" : ""}>{dataCurta(item.prazo)}{vencido(item) ? " · vencido" : ""}</dd></>)}
              <dt>Prioridade</dt><dd>{PRIORIDADE[item.prioridade]}</dd>
              {item.etapa && (<><dt>Etapa</dt><dd>{item.etapa}{etapas.find((x) => x.sigla === item.etapa) ? ` · ${etapas.find((x) => x.sigla === item.etapa)!.nome}` : ""}</dd></>)}
              {item.tipo && (<><dt>Tipo</dt><dd>{item.tipo}</dd></>)}
              {item.elemento && (<><dt>Elemento</dt><dd>{item.elemento.nome || "Sem nome"}{item.elemento.categoria ? ` · ${item.elemento.categoria}` : ""}</dd></>)}
              <dt>Criado</dt><dd>{dataHora(item.created_at)}{item.criado_por && porPerfil[item.criado_por] ? ` · ${porPerfil[item.criado_por].nome}` : ""}</dd>
            </dl>

            {item.descricao && <p className="texto-aula" style={{ marginTop: 12 }}>{item.descricao}</p>}

            {printUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={printUrl} alt={`Vista do apontamento ${num(item.numero)}`} className="cd-print" onClick={() => setAmpliar(true)} />
            )}
            <div className="row" style={{ marginTop: 8 }}>
              {item.camera && <button type="button" className="btn small" onClick={irPara}>Ver no 3D</button>}
              {coordena && <button type="button" className="btn small ghost" onClick={editar}>Editar</button>}
            </div>
          </>
        )}

        <h3 className="sec-t" style={{ margin: "22px 0 8px" }}>Conversa</h3>
        <div className="cd-chat">
          {msgs.length === 0 && <p className="note" style={{ margin: 0 }}>Sem mensagens ainda.</p>}
          {msgs.map((m) => {
            const autor = m.autor_id ? porPerfil[m.autor_id] : undefined;
            if (m.tipo === "status")
              return (
                <p key={m.id} className="cd-chat-st">
                  {autor?.nome ?? "Sistema"} mudou para <strong>{m.texto}</strong> · {dataHora(m.created_at)}
                </p>
              );
            return (
              <div key={m.id} className={`msg${m.tipo === "decisao" ? " cd-decisao" : ""}`}>
                <span className="msg-av"><Avatar nome={autor?.nome} foto={autor?.foto} size={28} eu={m.autor_id === eu.id} /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p className="note" style={{ margin: 0 }}>
                    <strong style={{ color: "var(--fg)" }}>{autor?.nome ?? "Alguém"}</strong>
                    {autor && autor.grupo !== "equipe" && autor.empresa ? ` · ${autor.empresa}` : ""} · {dataHora(m.created_at)}
                    {m.tipo === "decisao" && <span className="pill inv" style={{ marginLeft: 6 }}>Decisão</span>}
                  </p>
                  <p className="msg-t">{m.texto}</p>
                  {m.anexo_caminho && (
                    <button type="button" className="linkbtn" style={{ fontSize: 13 }} onClick={() => abrirAnexo(m.anexo_caminho!)}>{m.anexo_nome || "Anexo"}</button>
                  )}
                </div>
                {m.autor_id === eu.id && m.tipo === "msg" && (
                  <button type="button" className="msg-x" aria-label="Apagar mensagem" onClick={() => apagarMsg(m.id)}>×</button>
                )}
              </div>
            );
          })}
          <div ref={fim} />
        </div>
      </div>

      <form className="cd-chat-f" onSubmit={enviar}>
        <textarea
          rows={2}
          placeholder={souResp && !coordena ? "Responda ou explique a correção" : "Escreva uma mensagem"}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
          style={{ minHeight: 0 }}
        />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row" style={{ gap: 10 }}>
            <label className="linkbtn" style={{ fontSize: 13 }}>
              {arquivo ? arquivo.name : "Anexar"}
              <input type="file" hidden onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            </label>
            {coordena && (
              <label className="row" style={{ gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={decisao} onChange={(e) => setDecisao(e.target.checked)} /> Registrar como decisão
              </label>
            )}
          </div>
          <button className="btn small dark" type="submit" disabled={enviando || (!texto.trim() && !arquivo)}>Enviar</button>
        </div>
      </form>

      {ampliar && printUrl && (
        <div className="cd-modal-fundo" onClick={() => setAmpliar(false)} role="dialog" aria-label="Imagem ampliada">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={printUrl} alt="" style={{ maxWidth: "94vw", maxHeight: "90vh", borderRadius: 12 }} />
        </div>
      )}
    </aside>
  );
}
