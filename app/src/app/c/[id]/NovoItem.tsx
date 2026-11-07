"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { BUCKET, PRIORIDADE, chavePessoa, type Camera, type Modelo, type Pessoa, type Prioridade, type ProjetoCoord } from "@/lib/coord";
import { erroMsg } from "@/lib/util";
import type { Pick } from "./visor";

export type Rascunho = {
  print: string;
  camera: Camera;
  pick: Pick | null;
  visiveis: string[];
  revisoes: Record<string, string>;
  marcador: { x: number; y: number; frente: boolean } | null;
  tela: { w: number; h: number };
};

export default function NovoItem({
  projeto, rascunho, pessoas, modelos, etapas, tipos, sugeridos, onClose, onSalvo,
}: {
  projeto: ProjetoCoord; rascunho: Rascunho; pessoas: Pessoa[]; modelos: Modelo[];
  etapas: { sigla: string; nome: string }[]; tipos: string[]; sugeridos: (modeloId: string) => string[];
  onClose: () => void; onSalvo: (id: string) => void;
}) {
  const supabase = useMemo(() => supabaseNavegador(), []);
  const cv = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const desenhando = useRef<{ x: number; y: number } | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [modelo, setModelo] = useState(rascunho.pick?.modelo ?? rascunho.visiveis[0] ?? "");
  const [etapa, setEtapa] = useState("");
  const [tipo, setTipo] = useState(tipos[0] ?? "");
  const [prioridade, setPrioridade] = useState<Prioridade>("media");
  const [prazo, setPrazo] = useState("");
  const [interno, setInterno] = useState(false);
  const [resp, setResp] = useState<string[]>(() => sugeridos(rascunho.pick?.modelo ?? rascunho.visiveis[0] ?? ""));
  const [mexeuResp, setMexeuResp] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  function base() {
    const c = cv.current;
    const i = img.current;
    if (!c || !i) return;
    c.width = i.naturalWidth;
    c.height = i.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(i, 0, 0);
    const m = rascunho.marcador;
    if (m?.frente) {
      const k = i.naturalWidth / rascunho.tela.w;
      const x = m.x * k;
      const y = m.y * k;
      const r = 26 * k;
      g.lineWidth = 7 * k;
      g.strokeStyle = "#fff";
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 3.5 * k;
      g.strokeStyle = "#16181d";
      g.stroke();
    }
  }

  useEffect(() => {
    const i = new Image();
    i.onload = () => {
      img.current = i;
      base();
    };
    i.src = rascunho.print;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rascunho.print]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = cv.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function traco(a: { x: number; y: number }, b: { x: number; y: number }) {
    const c = cv.current!;
    const g = c.getContext("2d")!;
    const k = c.width / 900;
    g.lineCap = "round";
    g.lineJoin = "round";
    [["#fff", 8 * k], ["#16181d", 4 * k]].forEach(([cor, w]) => {
      g.strokeStyle = cor as string;
      g.lineWidth = w as number;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    });
  }

  const elegiveis = pessoas.filter((p) => p.perfil_id || p.convidado_id);
  const grupos = [
    { t: "Equipe", l: elegiveis.filter((p) => p.grupo === "equipe") },
    { t: "Convidados", l: elegiveis.filter((p) => p.grupo !== "equipe") },
  ];

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return setErro("Dê um título ao apontamento.");
    setSalvando(true);
    setErro("");
    try {
      const p = rascunho.pick;
      const { data, error } = await supabase
        .from("coord_itens")
        .insert({
          projeto_id: projeto.id,
          escritorio_id: projeto.escritorio_id,
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          modelo_id: modelo || null,
          revisao_id: (modelo && rascunho.revisoes[modelo]) || null,
          etapa: etapa || null,
          tipo: tipo || null,
          prioridade,
          prazo: prazo || null,
          interno,
          camera: rascunho.camera,
          ponto: p?.ponto ?? null,
          elemento: p ? { modelo: p.modelo, localId: p.localId, nome: p.nome, categoria: p.categoria, guid: p.guid } : null,
          visiveis: rascunho.visiveis,
        })
        .select("id")
        .single();
      if (error || !data) throw error;
      const id = (data as { id: string }).id;

      const blob: Blob = await new Promise((ok) => cv.current!.toBlob((b) => ok(b!), "image/jpeg", 0.86));
      const caminho = `${projeto.escritorio_id}/${projeto.id}/itens/${id}/print-${Date.now()}.jpg`;
      const up = await supabase.storage.from(BUCKET).upload(caminho, blob, { contentType: "image/jpeg" });
      if (!up.error) await supabase.from("coord_itens").update({ print_caminho: caminho }).eq("id", id);

      if (resp.length) {
        const linhas = resp.map((k) => {
          const pp = elegiveis.find((x) => chavePessoa(x) === k)!;
          return pp.convidado_id ? { item_id: id, convidado_id: pp.convidado_id } : { item_id: id, perfil_id: pp.perfil_id };
        });
        const r = await supabase.from("coord_responsaveis").insert(linhas);
        if (r.error) throw r.error;
      }
      onSalvo(id);
    } catch (er) {
      setErro(erroMsg(er));
      setSalvando(false);
    }
  }

  return (
    <div className="cd-modal-fundo" role="dialog" aria-modal="true" aria-label="Novo apontamento" onClick={onClose}>
      <form className="cd-modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <div className="cd-modal-img">
          <canvas
            ref={cv}
            onPointerDown={(e) => {
              (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
              desenhando.current = pos(e);
            }}
            onPointerMove={(e) => {
              if (!desenhando.current) return;
              const p = pos(e);
              traco(desenhando.current, p);
              desenhando.current = p;
            }}
            onPointerUp={() => (desenhando.current = null)}
          />
          <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <span className="note">Desenhe sobre a imagem para marcar.</span>
            <button type="button" className="btn small ghost" onClick={base}>Limpar marcação</button>
          </div>
          {rascunho.pick && (
            <p className="note" style={{ margin: "6px 0 0" }}>
              Elemento: <strong>{rascunho.pick.nome || "sem nome"}</strong>
              {rascunho.pick.categoria ? ` · ${rascunho.pick.categoria}` : ""}
            </p>
          )}
        </div>

        <div className="cd-modal-campos">
          <p className="mono">Novo apontamento</p>
          <input type="text" className="titulo-in" placeholder="O que precisa ser corrigido" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
          <textarea placeholder="Descrição (o que está errado e o que se espera)" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          <div className="grid2" style={{ gap: 10 }}>
            <label className="form-l"><span>Disciplina</span>
              <select className="f" value={modelo} onChange={(e) => { setModelo(e.target.value); if (!mexeuResp) setResp(sugeridos(e.target.value)); }}>
                <option value="">Geral</option>
                {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </label>
            <label className="form-l"><span>Etapa</span>
              <select className="f" value={etapa} onChange={(e) => setEtapa(e.target.value)}>
                <option value="">—</option>
                {etapas.map((x) => <option key={x.sigla} value={x.sigla}>{x.sigla} · {x.nome}</option>)}
              </select>
            </label>
            <label className="form-l"><span>Tipo</span>
              <select className="f" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="">—</option>
                {tipos.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label className="form-l"><span>Prioridade</span>
              <select className="f" value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)}>
                {(Object.keys(PRIORIDADE) as Prioridade[]).map((k) => <option key={k} value={k}>{PRIORIDADE[k]}</option>)}
              </select>
            </label>
            <label className="form-l"><span>Prazo</span><input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></label>
          </div>

          <div className="form-l">
            <span>Responsáveis{resp.length > 0 && !mexeuResp ? " (sugeridos pelo organograma)" : ""}</span>
            {grupos.map((g) => g.l.length > 0 && (
              <div key={g.t} style={{ marginTop: 4 }}>
                <p className="note" style={{ margin: "0 0 4px" }}>{g.t}</p>
                <div className="row" style={{ gap: 6 }}>
                  {g.l.map((p) => {
                    const k = chavePessoa(p);
                    const on = resp.includes(k);
                    return (
                      <button key={k} type="button" className={`pill${on ? " inv" : ""}`} style={{ border: 0, cursor: "pointer" }} aria-pressed={on}
                        onClick={() => { setMexeuResp(true); setResp(on ? resp.filter((x) => x !== k) : [...resp, k]); }}>
                        {p.nome}{p.grupo !== "equipe" && p.empresa ? ` · ${p.empresa}` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {elegiveis.length === 0 && <p className="note" style={{ margin: 0 }}>Convide pessoas na aba Pessoas.</p>}
          </div>

          <label className="row" style={{ gap: 8, fontSize: 14 }}>
            <input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} />
            Interno (só a equipe da {projeto.escritorio} vê)
          </label>

          {erro && <p className="err" role="alert">{erro}</p>}
          <div className="row">
            <button className="btn dark" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Criar apontamento"}</button>
            <button className="btn" type="button" onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </form>
    </div>
  );
}
