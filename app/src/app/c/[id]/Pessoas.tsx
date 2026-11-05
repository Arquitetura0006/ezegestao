"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { FUNCAO, textoConvite, type Convidado, type Funcao, type Modelo, type Pessoa, type ProjetoCoord } from "@/lib/coord";
import { erroMsg } from "@/lib/util";
import { Avatar } from "@/app/(app)/ui";
import type { Eu } from "./Coordenacao";

const VAZIO = { email: "", nome: "", empresa: "", funcao: "cliente" as Funcao, modelos: [] as string[] };

export default function Pessoas({
  projeto, pessoas, modelos, eu, onChange, avisar,
}: {
  projeto: ProjetoCoord; pessoas: Pessoa[]; modelos: Modelo[]; eu: Eu; onChange: () => void; avisar: (t: string) => void;
}) {
  const supabase = useMemo(() => supabaseNavegador(), []);
  const coordena = projeto.coordena;
  const [convidados, setConvidados] = useState<Convidado[]>([]);
  const [form, setForm] = useState<typeof VAZIO | null>(null);
  const [texto, setTexto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!projeto.equipe) return;
    const { data } = await supabase.from("coord_convidados").select("*").eq("projeto_id", projeto.id).order("created_at");
    setConvidados((data as Convidado[]) ?? []);
  }, [supabase, projeto.id, projeto.equipe]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function convidar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const email = form.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return avisar("Confira o e-mail.");
    const { error } = await supabase.from("coord_convidados").upsert(
      {
        projeto_id: projeto.id, escritorio_id: projeto.escritorio_id, email, nome: form.nome.trim() || null,
        empresa: form.empresa.trim() || null, funcao: form.funcao, modelos: form.modelos, ativo: true,
      },
      { onConflict: "projeto_id,email" }
    );
    if (error) return avisar(erroMsg(error));
    setTexto(textoConvite({ nome: form.nome, email }, projeto.nome, projeto.escritorio));
    setForm(null);
    carregar();
    onChange();
  }

  async function ativo(c: Convidado, v: boolean) {
    const { error } = await supabase.from("coord_convidados").update({ ativo: v }).eq("id", c.id);
    if (error) return avisar(erroMsg(error));
    carregar();
    onChange();
  }

  async function copiar(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      avisar("Texto copiado.");
    } catch {
      avisar("Não foi possível copiar. Selecione o texto e copie.");
    }
  }

  const equipe = pessoas.filter((p) => p.grupo === "equipe");
  const externos = pessoas.filter((p) => p.grupo !== "equipe");

  return (
    <div className="stack" style={{ gap: 14 }}>
      {texto && (
        <div className="box" style={{ padding: 16 }}>
          <p className="mono" style={{ marginBottom: 6 }}>Convite pronto</p>
          <p className="texto-aula" style={{ fontSize: 14 }}>{texto}</p>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn small dark" onClick={() => copiar(texto)}>Copiar</button>
            <a className="btn small" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">WhatsApp</a>
            <button type="button" className="btn small ghost" onClick={() => setTexto(null)}>Fechar</button>
          </div>
        </div>
      )}

      <div>
        <h3 className="sec-t">Convidados</h3>
        {projeto.equipe ? (
          convidados.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>Ninguém de fora ainda. Convide o cliente, a engenharia do cliente e os projetistas.</p>
          ) : (
            <div className="lista">
              {convidados.map((c) => (
                <div key={c.id} className="item" style={{ opacity: c.ativo ? 1 : 0.5 }}>
                  <Avatar nome={c.nome || c.email} size={30} />
                  <span className="item-t">
                    <strong>{c.nome || c.email}</strong>
                    <small>
                      {[FUNCAO[c.funcao], c.empresa, c.nome ? c.email : "", c.perfil_id ? "Já entrou" : "Ainda não entrou",
                        c.modelos.length ? `Vê: ${c.modelos.map((id) => modelos.find((m) => m.id === id)?.nome).filter(Boolean).join(", ")}` : "Vê todos os modelos",
                      ].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  {coordena && (
                    <span className="row" style={{ gap: 4 }}>
                      <button type="button" className="btn small ghost" onClick={() => setTexto(textoConvite(c, projeto.nome, projeto.escritorio))}>Convite</button>
                      <button type="button" className="btn small ghost" onClick={() => ativo(c, !c.ativo)}>{c.ativo ? "Remover" : "Reativar"}</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="lista">
            {externos.map((p) => (
              <div key={p.convidado_id ?? p.perfil_id} className="item">
                <Avatar nome={p.nome} foto={p.foto} size={30} eu={p.perfil_id === eu.id} />
                <span className="item-t"><strong>{p.nome}</strong><small>{[FUNCAO[p.grupo as Funcao], p.empresa].filter(Boolean).join(" · ")}</small></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {coordena && !form && (
        <button type="button" className="btn small dark" style={{ alignSelf: "flex-start" }} onClick={() => setForm({ ...VAZIO })}>Convidar pessoa</button>
      )}
      {coordena && form && (
        <form className="box stack" style={{ padding: 16, gap: 10 }} onSubmit={convidar}>
          <label className="form-l"><span>E-mail</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus /></label>
          <div className="grid2" style={{ gap: 10 }}>
            <label className="form-l"><span>Nome</span><input type="text" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
            <label className="form-l"><span>Empresa</span><input type="text" value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} /></label>
          </div>
          <label className="form-l"><span>Função</span>
            <select className="f" value={form.funcao} onChange={(e) => setForm({ ...form, funcao: e.target.value as Funcao })}>
              {(Object.keys(FUNCAO) as Funcao[]).map((k) => <option key={k} value={k}>{FUNCAO[k]}</option>)}
            </select>
          </label>
          {modelos.length > 0 && (
            <div className="form-l">
              <span>Modelos que pode ver (nenhum marcado = todos)</span>
              <div className="row" style={{ gap: 6 }}>
                {modelos.map((m) => {
                  const on = form.modelos.includes(m.id);
                  return (
                    <button key={m.id} type="button" className={`pill${on ? " inv" : ""}`} style={{ border: 0, cursor: "pointer" }}
                      onClick={() => setForm({ ...form, modelos: on ? form.modelos.filter((x) => x !== m.id) : [...form.modelos, m.id] })}>
                      {m.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="row">
            <button className="btn small dark" type="submit">Convidar</button>
            <button className="btn small" type="button" onClick={() => setForm(null)}>Cancelar</button>
          </div>
          <p className="note" style={{ margin: 0 }}>O convidado entra em {"www.ezegestao.com.br"} com este e-mail e vê só este projeto. Responde e conversa nos apontamentos; não cria nem valida.</p>
        </form>
      )}

      <div>
        <h3 className="sec-t">Equipe {projeto.escritorio}</h3>
        <div className="lista">
          {equipe.map((p) => (
            <div key={p.perfil_id} className="item">
              <Avatar nome={p.nome} foto={p.foto} size={30} eu={p.perfil_id === eu.id} />
              <span className="item-t"><strong>{p.nome}</strong>{p.email && <small>{p.email}</small>}</span>
            </div>
          ))}
        </div>
        {projeto.equipe && <p className="note" style={{ margin: "6px 0 0" }}>Quem da equipe aparece aqui: Dono, Administradores e as pessoas da equipe do projeto.</p>}
      </div>
    </div>
  );
}
