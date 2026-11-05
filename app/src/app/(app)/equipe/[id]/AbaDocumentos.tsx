"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp, usePode } from "../../ctx";
import { Vazio } from "../../ui";
import { erroMsg } from "@/lib/util";
import { dataBR } from "@/lib/financeiro";

type Doc = { id: string; nome: string; tipo: string; caminho: string | null; link: string | null; tamanho: number | null; created_at: string };
const TIPOS: Record<string, string> = { contrato: "Contrato", pessoal: "Documento pessoal", certificado: "Certificado", outro: "Outro" };

const tam = (b: number | null) => (!b ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const ext = (n: string) => (n.split(".").pop() || "").slice(0, 4).toUpperCase();

// Documentos da pessoa: arquivos no bucket privado "pessoas" ou links (Drive).
// Veem: a própria pessoa e quem tem Equipe › editar. Enviam e apagam: Equipe › editar.
export default function Documentos({ pessoa }: { pessoa: string }) {
  const { esc } = useApp();
  const editar = usePode("equipe", true);
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [tipo, setTipo] = useState("contrato");
  const [link, setLink] = useState({ nome: "", url: "" });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const arq = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from("pessoa_documentos").select("id,nome,tipo,caminho,link,tamanho,created_at").eq("escritorio_id", esc.id).eq("perfil_id", pessoa).order("created_at", { ascending: false });
    if (error) setErro(error.message.includes("pessoa_documentos") ? "Rode a migração 0009 no Supabase para ativar os documentos." : erroMsg(error));
    setDocs((data as Doc[]) ?? []);
  }, [supabase, esc.id, pessoa]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function enviar(files: FileList | null) {
    if (!files?.length) return;
    setErro("");
    setEnviando(true);
    for (const f of Array.from(files)) {
      if (f.size > 50 * 1048576) {
        setErro(`${f.name}: limite de 50 MB por arquivo.`);
        continue;
      }
      const limpo = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_");
      const caminho = `${esc.id}/${pessoa}/${Date.now()}-${limpo}`;
      const up = await supabase.storage.from("pessoas").upload(caminho, f, { contentType: f.type || undefined });
      if (up.error) {
        setErro(erroMsg(up.error));
        continue;
      }
      const { error } = await supabase.from("pessoa_documentos").insert({ escritorio_id: esc.id, perfil_id: pessoa, nome: f.name, tipo, caminho, tamanho: f.size });
      if (error) {
        await supabase.storage.from("pessoas").remove([caminho]);
        setErro(erroMsg(error));
      }
    }
    setEnviando(false);
    if (arq.current) arq.current.value = "";
    carregar();
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    let url = link.url.trim();
    if (!url) return;
    if (!/^https?:\/\//.test(url)) url = `https://${url}`;
    const { error } = await supabase.from("pessoa_documentos").insert({ escritorio_id: esc.id, perfil_id: pessoa, nome: link.nome.trim() || url, tipo, link: url });
    if (error) return setErro(erroMsg(error));
    setLink({ nome: "", url: "" });
    carregar();
  }

  async function abrir(d: Doc) {
    if (d.link) return window.open(d.link, "_blank", "noopener");
    const w = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("pessoas").createSignedUrl(d.caminho!, 120);
    if (error || !data) {
      w?.close();
      return setErro(erroMsg(error));
    }
    if (w) w.location.href = data.signedUrl;
  }

  async function apagar(d: Doc) {
    if (!confirm(`Apagar "${d.nome}"?`)) return;
    if (d.caminho) await supabase.storage.from("pessoas").remove([d.caminho]);
    await supabase.from("pessoa_documentos").delete().eq("id", d.id);
    carregar();
  }

  return (
    <>
      {editar && (
        <section className="box" style={{ marginBottom: 16 }}>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="form-l" style={{ flex: "0 1 200px" }}>
              <span>Tipo</span>
              <select className="f" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <input ref={arq} type="file" multiple hidden onChange={(e) => enviar(e.target.files)} />
            <button className="btn dark" type="button" disabled={enviando} onClick={() => arq.current?.click()}>{enviando ? "Enviando…" : "Enviar arquivo"}</button>
            <form className="row" style={{ flex: "1 1 360px", flexWrap: "nowrap" }} onSubmit={addLink}>
              <input type="text" value={link.nome} onChange={(e) => setLink({ ...link, nome: e.target.value })} placeholder="Nome" aria-label="Nome do link" style={{ maxWidth: 160 }} />
              <input type="text" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder="ou cole um link (Drive)" aria-label="Link" />
              <button className="btn" type="submit">Adicionar</button>
            </form>
          </div>
          <p className="note" style={{ margin: "10px 0 0" }}>Arquivos ficam privados: só esta pessoa e quem administra a equipe veem. Até 50 MB por arquivo.</p>
        </section>
      )}
      {erro && <p className="err" role="alert" style={{ marginBottom: 10 }}>{erro}</p>}
      {docs === null ? <p className="note">Carregando…</p> : docs.length === 0 ? (
        <Vazio titulo="Nenhum documento" texto={editar ? "Contrato, documentos pessoais e certificados ficam aqui." : undefined} />
      ) : (
        <div className="tabela-w">
          <table className="tabela">
            <thead><tr><th>Nome</th><th>Tipo</th><th>Tamanho</th><th>Enviado em</th>{editar && <th />}</tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="clicavel" onClick={() => abrir(d)}>
                  <td>
                    <span className="doc-l">
                      <span className="doc-ic">{d.link ? "LINK" : ext(d.nome)}</span>
                      <strong style={{ fontWeight: 500 }}>{d.nome}</strong>
                    </span>
                  </td>
                  <td>{TIPOS[d.tipo] ?? d.tipo}</td>
                  <td className="note">{tam(d.tamanho)}</td>
                  <td className="note">{dataBR(d.created_at)}</td>
                  {editar && (
                    <td style={{ textAlign: "right" }}>
                      <button className="btn small ghost" type="button" onClick={(e) => { e.stopPropagation(); apagar(d); }}>Apagar</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
