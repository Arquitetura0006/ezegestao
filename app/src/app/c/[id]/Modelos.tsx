"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { BUCKET, nomeSeguro, rev, tamanho, type Modelo, type ProjetoCoord, type Revisao } from "@/lib/coord";
import { dataHora, erroMsg } from "@/lib/util";
import type { Visor } from "./visor";

const SUGESTOES = ["Arquitetura", "Estrutura", "Elétrico", "Hidrossanitário", "Climatização", "Incêndio", "Fundações"];

export default function Modelos({
  projeto, modelos, revisoes, visiveis, carregados, baixando, visor, onAlternar, onChange, avisar,
}: {
  projeto: ProjetoCoord; modelos: Modelo[]; revisoes: Revisao[]; visiveis: Record<string, boolean>;
  carregados: Record<string, string>; baixando: Record<string, boolean>;
  visor: React.MutableRefObject<Visor | null>; onAlternar: (id: string) => void; onChange: () => void; avisar: (t: string) => void;
}) {
  const supabase = useMemo(() => supabaseNavegador(), []);
  const coordena = projeto.coordena;
  const [disciplinas, setDisciplinas] = useState<{ id: string; nome: string }[]>([]);
  const [novo, setNovo] = useState("");
  const [envio, setEnvio] = useState<{ modelo: string; etapa: string; pct: number } | null>(null);
  const [hist, setHist] = useState<string | null>(null);

  useEffect(() => {
    if (!coordena) return;
    supabase.from("disciplinas").select("id,nome").eq("escritorio_id", projeto.escritorio_id).order("ordem").order("nome")
      .then(({ data }) => setDisciplinas((data as { id: string; nome: string }[]) ?? []));
  }, [supabase, coordena, projeto.escritorio_id]);

  const nomes = [...new Set([...SUGESTOES, ...disciplinas.map((d) => d.nome)])].filter((n) => !modelos.some((m) => m.nome === n));

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const nome = novo.trim();
    if (!nome) return;
    const d = disciplinas.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
    const { error } = await supabase.from("coord_modelos").insert({
      projeto_id: projeto.id, escritorio_id: projeto.escritorio_id, nome, disciplina_id: d?.id ?? null, ordem: modelos.length + 1,
    });
    if (error) return avisar(erroMsg(error));
    setNovo("");
    onChange();
  }

  async function enviar(m: Modelo, f: File) {
    if (!/\.ifc$/i.test(f.name)) return avisar("Envie um arquivo .ifc");
    const v = visor.current;
    if (!v) return avisar("O 3D ainda está abrindo. Tente de novo em instantes.");
    try {
      setEnvio({ modelo: m.id, etapa: "Lendo o arquivo", pct: 0 });
      const ifc = new Uint8Array(await f.arrayBuffer());
      setEnvio({ modelo: m.id, etapa: "Convertendo para abrir rápido", pct: 0 });
      const frag = await v.converter(ifc, f.name, (p) => setEnvio({ modelo: m.id, etapa: "Convertendo para abrir rápido", pct: Math.round(p * 100) }));
      const numero = Math.max(-1, ...revisoes.filter((r) => r.modelo_id === m.id).map((r) => r.numero)) + 1;
      const pasta = `${projeto.escritorio_id}/${projeto.id}/modelos/${m.id}`;
      const base = `${rev(numero)}-${Date.now()}`;
      setEnvio({ modelo: m.id, etapa: "Enviando o IFC", pct: 0 });
      const a = await supabase.storage.from(BUCKET).upload(`${pasta}/${base}-${nomeSeguro(f.name)}`, f, { contentType: "application/octet-stream" });
      if (a.error) throw a.error;
      setEnvio({ modelo: m.id, etapa: "Enviando o modelo convertido", pct: 0 });
      const b = await supabase.storage.from(BUCKET).upload(`${pasta}/${base}.frag`, new Blob([frag as BlobPart]), { contentType: "application/octet-stream" });
      if (b.error) throw b.error;
      const { error } = await supabase.from("coord_revisoes").insert({
        projeto_id: projeto.id, escritorio_id: projeto.escritorio_id, modelo_id: m.id, numero, arquivo: f.name,
        ifc_caminho: a.data.path, frag_caminho: b.data.path, tamanho: f.size,
      });
      if (error) throw error;
      avisar(`${m.nome} ${rev(numero)} enviado.`);
      onChange();
    } catch (e) {
      const msg = erroMsg(e);
      avisar(/exceeded|too large|maximum/i.test(msg) ? "Arquivo maior que o limite do Storage. Aumente o limite em Supabase › Storage › Settings." : `Não foi possível enviar: ${msg}`);
    } finally {
      setEnvio(null);
    }
  }

  async function baixar(r: Revisao) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(r.ifc_caminho, 600, { download: r.arquivo });
    if (data?.signedUrl) window.location.href = data.signedUrl;
  }

  async function apagarModelo(m: Modelo) {
    if (!window.confirm(`Apagar o modelo ${m.nome} e todas as revisões? Os apontamentos continuam.`)) return;
    const caminhos = revisoes.filter((r) => r.modelo_id === m.id).flatMap((r) => [r.ifc_caminho, r.frag_caminho].filter(Boolean) as string[]);
    if (caminhos.length) await supabase.storage.from(BUCKET).remove(caminhos);
    const { error } = await supabase.from("coord_modelos").delete().eq("id", m.id);
    if (error) return avisar(erroMsg(error));
    await visor.current?.remover(m.id);
    onChange();
  }

  return (
    <div className="stack" style={{ gap: 10 }}>
      {modelos.length === 0 && (
        <div className="vazio" style={{ padding: 22 }}>
          <p className="vazio-t">Nenhum modelo.</p>
          <p className="note" style={{ margin: "4px 0 0" }}>{coordena ? "Crie a disciplina e envie o IFC." : "A coordenação ainda não enviou modelos."}</p>
        </div>
      )}
      {modelos.length > 0 && (
        <div className="lista">
          {modelos.map((m) => {
            const rs = revisoes.filter((r) => r.modelo_id === m.id);
            const u = rs[0];
            const env = envio?.modelo === m.id;
            return (
              <div key={m.id} style={{ padding: "12px 16px" }}>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <button type="button" className={`cd-olho${visiveis[m.id] !== false ? " on" : ""}`} disabled={!carregados[m.id]} onClick={() => onAlternar(m.id)} aria-label={`Mostrar ou ocultar ${m.nome}`} aria-pressed={visiveis[m.id] !== false} />
                  <span className="item-t">
                    <strong>{m.nome}</strong>
                    <small>
                      {u ? `${rev(u.numero)} · ${dataHora(u.created_at)} · ${tamanho(u.tamanho)}` : "Sem arquivo"}
                      {baixando[m.id] ? " · carregando…" : ""}
                    </small>
                  </span>
                  {coordena && (
                    <label className={`btn small${env ? "" : " dark"}`} aria-disabled={!!envio}>
                      {u ? "Nova revisão" : "Enviar IFC"}
                      <input type="file" accept=".ifc" hidden disabled={!!envio} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) enviar(m, f); }} />
                    </label>
                  )}
                </div>
                {env && (
                  <div style={{ marginTop: 8 }}>
                    <p className="note" style={{ margin: "0 0 4px" }}>{envio!.etapa}{envio!.pct ? ` · ${envio!.pct}%` : "…"}</p>
                    <div className="barra"><i style={{ width: `${envio!.pct || 8}%` }} /></div>
                  </div>
                )}
                {rs.length > 0 && (
                  <button type="button" className="linkbtn note" style={{ fontSize: 12.5, marginTop: 6 }} onClick={() => setHist(hist === m.id ? null : m.id)}>
                    {hist === m.id ? "Ocultar revisões" : `${rs.length} ${rs.length === 1 ? "revisão" : "revisões"}`}
                  </button>
                )}
                {hist === m.id && (
                  <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                    {rs.map((r) => (
                      <div key={r.id} className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
                        <span>{rev(r.numero)} · {r.arquivo} · {dataHora(r.created_at)}</span>
                        <button type="button" className="linkbtn" onClick={() => baixar(r)}>Baixar IFC</button>
                      </div>
                    ))}
                    {coordena && <button type="button" className="linkbtn note" style={{ fontSize: 12.5, alignSelf: "flex-start" }} onClick={() => apagarModelo(m)}>Apagar modelo</button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {coordena && (
        <form className="row" style={{ flexWrap: "nowrap" }} onSubmit={criar}>
          <input type="text" list="cd-disc" placeholder="Nova disciplina (ex.: Estrutura)" value={novo} onChange={(e) => setNovo(e.target.value)} />
          <datalist id="cd-disc">{nomes.map((n) => <option key={n} value={n} />)}</datalist>
          <button className="btn small" type="submit">Adicionar</button>
        </form>
      )}
      {coordena && (
        <p className="note" style={{ margin: 0 }}>
          O IFC é convertido no seu navegador antes do envio, para abrir rápido para todos. Exporte do Revit ou Archicad com as coordenadas compartilhadas, para as disciplinas se sobreporem.
        </p>
      )}
    </div>
  );
}
