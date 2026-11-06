"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { REF_TIPO, type Ref, type RefTipo } from "@/lib/briefing";

// Grade de referências (imagens com miniatura, PDFs e links), usada pela equipe e pelo cliente.
export default function Refs({ refs, tirar, vazio }: { refs: Ref[]; tirar?: (r: Ref) => void; vazio?: string }) {
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const cams = refs.filter((r) => r.caminho && !urls[r.caminho]).map((r) => r.caminho!);
    if (!cams.length) return;
    supabase.storage
      .from("briefing")
      .createSignedUrls(cams, 3600)
      .then(({ data }) => {
        const novo: Record<string, string> = {};
        for (const d of data ?? []) if (d.path && d.signedUrl) novo[d.path] = d.signedUrl;
        setUrls((u) => ({ ...u, ...novo }));
      });
  }, [refs, supabase, urls]);

  if (!refs.length) return <p className="note" style={{ margin: 0 }}>{vazio ?? "Nenhuma referência ainda."}</p>;

  return (
    <div className="br-grade">
      {refs.map((r) => {
        const url = r.caminho ? urls[r.caminho] : r.link;
        const img = r.mime?.startsWith("image/") && url;
        return (
          <figure key={r.id} className={`br-ref t-${r.tipo}`}>
            <a className="br-mini" href={url || undefined} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {img ? <img src={url!} alt={r.titulo || ""} loading="lazy" /> : <span>{r.caminho ? (r.mime === "application/pdf" ? "PDF" : "ARQ") : "LINK"}</span>}
            </a>
            <figcaption>
              <span className={`pill${r.tipo === "nao_gosta" ? " inv" : r.tipo === "gosta" ? "" : " dash"}`}>{REF_TIPO[r.tipo as RefTipo]}</span>
              {r.titulo && <strong>{r.titulo}</strong>}
              {r.comentario && <small>{r.comentario}</small>}
              {r.link && !r.caminho && <a className="note" href={r.link} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>{r.link}</a>}
              {tirar && <button type="button" className="linkbtn note" onClick={() => tirar(r)}>Tirar</button>}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

// Formulário para adicionar referência (arquivo ou link), com tipo e comentário.
export function NovaRef({ enviar, ocupado }: { enviar: (d: { tipo: RefTipo; comentario: string; arquivos: File[]; link: string }) => Promise<void>; ocupado?: boolean }) {
  const [tipo, setTipo] = useState<RefTipo>("referencia");
  const [comentario, setComentario] = useState("");
  const [link, setLink] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  return (
    <form
      className="stack br-nova"
      style={{ gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        await enviar({ tipo, comentario, arquivos, link });
        setComentario("");
        setLink("");
        setArquivos([]);
        (e.target as HTMLFormElement).reset();
      }}
    >
      <div className="tabs seg" role="radiogroup" aria-label="Tipo">
        {(Object.keys(REF_TIPO) as RefTipo[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={tipo === k} className={tipo === k ? "on" : ""} onClick={() => setTipo(k)}>{REF_TIPO[k]}</button>
        ))}
      </div>
      <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" onChange={(e) => setArquivos(Array.from(e.target.files ?? []))} aria-label="Imagens ou PDF" />
      <input type="text" value={link} onChange={(e) => setLink(e.target.value)} placeholder="ou cole um link (Pinterest, Instagram, site)" aria-label="Link" />
      <input type="text" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="O que chama a atenção nesta referência?" aria-label="Comentário" />
      <div>
        <button className="btn dark small" type="submit" disabled={ocupado || (!arquivos.length && !link.trim())}>{ocupado ? "Enviando…" : "Adicionar referência"}</button>
      </div>
    </form>
  );
}
