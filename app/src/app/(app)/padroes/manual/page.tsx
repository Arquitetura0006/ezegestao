"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../../ctx";
import { Cabeca, Vazio } from "../../ui";
import Sub from "../Sub";
import { dataCurta, erroMsg } from "@/lib/util";

type Doc = { id: string; categoria: string; titulo: string; corpo: string; ordem: number; atualizado_em: string };
const VAZIO = { id: "", categoria: "", titulo: "", corpo: "" };

export default function Manual() {
  const { esc, admin } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [ed, setEd] = useState<typeof VAZIO | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("manual_docs").select("id,categoria,titulo,corpo,ordem,atualizado_em").eq("escritorio_id", esc.id).order("categoria").order("ordem").order("titulo");
    setDocs((data as Doc[]) ?? []);
  }, [supabase, esc.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!ed) return;
    setErro("");
    if (!ed.titulo.trim()) return setErro("Dê um título.");
    const row = { escritorio_id: esc.id, categoria: ed.categoria.trim() || "Geral", titulo: ed.titulo.trim(), corpo: ed.corpo, atualizado_em: new Date().toISOString() };
    const { error } = ed.id ? await supabase.from("manual_docs").update(row).eq("id", ed.id) : await supabase.from("manual_docs").insert(row);
    if (error) return setErro(erroMsg(error));
    setEd(null);
    carregar();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este item do manual?")) return;
    await supabase.from("manual_docs").delete().eq("id", id);
    setEd(null);
    carregar();
  }

  const q = busca.trim().toLowerCase();
  const filtrados = (docs ?? []).filter((d) => !q || `${d.titulo} ${d.corpo} ${d.categoria}`.toLowerCase().includes(q));
  const cats = Array.from(new Set(filtrados.map((d) => d.categoria)));
  const categorias = Array.from(new Set((docs ?? []).map((d) => d.categoria)));

  return (
    <>
      <Cabeca kicker="Padrões EZE" titulo="Treinamento">
        {admin && !ed && <button className="btn dark" type="button" onClick={() => setEd({ ...VAZIO })}>Novo item</button>}
      </Cabeca>
      <Sub />

      {ed && (
        <form className="box stack" style={{ marginBottom: 20 }} onSubmit={salvar}>
          <div className="grid2" style={{ gap: 12 }}>
            <label className="form-l">
              <span>Título</span>
              <input type="text" value={ed.titulo} onChange={(e) => setEd({ ...ed, titulo: e.target.value })} maxLength={120} autoFocus />
            </label>
            <label className="form-l">
              <span>Categoria</span>
              <input type="text" list="cats" value={ed.categoria} onChange={(e) => setEd({ ...ed, categoria: e.target.value })} placeholder="Ex.: Nomenclatura de arquivos" maxLength={60} />
              <datalist id="cats">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
          </div>
          <label className="form-l">
            <span>Conteúdo</span>
            <textarea value={ed.corpo} onChange={(e) => setEd({ ...ed, corpo: e.target.value })} style={{ minHeight: 220 }} />
          </label>
          {erro && <p className="err" role="alert">{erro}</p>}
          <div className="row">
            <button className="btn dark small" type="submit">Salvar</button>
            <button className="btn small" type="button" onClick={() => setEd(null)}>Cancelar</button>
            {ed.id && <button className="btn small ghost" type="button" style={{ marginLeft: "auto" }} onClick={() => excluir(ed.id)}>Excluir</button>}
          </div>
        </form>
      )}

      {docs && docs.length > 0 && (
        <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no manual" style={{ marginBottom: 16, maxWidth: 420 }} aria-label="Buscar no manual" />
      )}

      {docs === null ? (
        <p className="note">Carregando…</p>
      ) : docs.length === 0 ? (
        <Vazio titulo="Manual vazio" texto={admin ? "Registre aqui as regras do escritório: nomenclatura, pastas, carimbos, entregas." : "As regras do escritório aparecem aqui."} />
      ) : (
        cats.map((c) => (
          <section key={c} style={{ marginBottom: 20 }}>
            <p className="mono" style={{ marginBottom: 8 }}>{c}</p>
            <div className="lista">
              {filtrados.filter((d) => d.categoria === c).map((d) => (
                <div key={d.id}>
                  <button className="item linkbtn" type="button" style={{ width: "100%", textDecoration: "none", textAlign: "left" }} aria-expanded={aberto === d.id} onClick={() => setAberto(aberto === d.id ? null : d.id)}>
                    <span className="item-t"><strong>{d.titulo}</strong><small>Atualizado em {dataCurta(d.atualizado_em)}</small></span>
                    <span className="note">{aberto === d.id ? "−" : "+"}</span>
                  </button>
                  {aberto === d.id && (
                    <div style={{ padding: "0 18px 16px" }}>
                      <p className="texto-aula">{d.corpo || "Sem conteúdo."}</p>
                      {admin && <button className="btn small" type="button" style={{ marginTop: 10 }} onClick={() => setEd({ id: d.id, categoria: d.categoria, titulo: d.titulo, corpo: d.corpo })}>Editar</button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
