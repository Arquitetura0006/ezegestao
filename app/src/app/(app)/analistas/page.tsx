"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp, usePode } from "../ctx";
import { Cabeca, Vazio } from "../ui";
import { erroMsg } from "@/lib/util";
import { CAMADAS, ordenar, type Analista, type Camada } from "@/lib/analistas";
import { AbasAnalise } from "../analises/comum";

type Conta = Record<string, { itens: number; docs: number }>;

export default function Analistas() {
  const { esc, eu } = useApp();
  const editor = usePode("analistas", true);
  const router = useRouter();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [lista, setLista] = useState<Analista[] | null>(null);
  const [conta, setConta] = useState<Conta>({});
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState<{ nome: string; camada: Camada } | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("analistas").select("*").eq("escritorio_id", esc.id),
      supabase.from("analista_itens").select("analista_id").eq("escritorio_id", esc.id).eq("ativo", true),
      supabase.from("analista_docs").select("analista_id").eq("escritorio_id", esc.id),
    ]).then(([a, i, d]) => {
      if (a.error) setErro(a.error.message.includes("analistas") ? "Rode a migração 0012 no Supabase para ativar os analistas." : a.error.message);
      setLista(ordenar((a.data as Analista[]) ?? []));
      const c: Conta = {};
      for (const x of (i.data as { analista_id: string }[]) ?? []) (c[x.analista_id] ??= { itens: 0, docs: 0 }).itens++;
      for (const x of (d.data as { analista_id: string }[]) ?? []) (c[x.analista_id] ??= { itens: 0, docs: 0 }).docs++;
      setConta(c);
    });
  }, [supabase, esc.id]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!novo?.nome.trim()) return setErro("Dê um nome ao analista.");
    const { data, error } = await supabase
      .from("analistas")
      .insert({ escritorio_id: esc.id, nome: novo.nome.trim(), camada: novo.camada, ordem: (lista?.length ?? 0) + 1, atualizado_por: eu.id })
      .select("id")
      .single();
    if (error) return setErro(erroMsg(error));
    router.push(`/analistas/${data.id}`);
  }

  return (
    <>
      <Cabeca kicker="Pré-análise IA" titulo="Analistas">
        {editor && !novo && <button className="btn dark small" type="button" onClick={() => setNovo({ nome: "", camada: "municipio" })}>Novo analista</button>}
      </Cabeca>
      <AbasAnalise />
      <p className="note" style={{ margin: "-6px 0 18px", maxWidth: 720 }}>
        Cada analista é uma regra de análise. Na hora de analisar, somam-se a Base EZE, o analista da etapa, o da cidade (quando a etapa depende da lei) e o de estética. Analista sem orientações, checklist ou documentos não entra.
      </p>
      {novo && (
        <form className="box row" style={{ marginBottom: 16, alignItems: "flex-end" }} onSubmit={criar}>
          <label className="form-l" style={{ flex: "1 1 260px" }}>
            <span>Nome</span>
            <input type="text" autoFocus value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: Porto Belo" />
          </label>
          <label className="form-l" style={{ flex: "0 1 200px" }}>
            <span>Camada</span>
            <select className="f" value={novo.camada} onChange={(e) => setNovo({ ...novo, camada: e.target.value as Camada })}>
              {CAMADAS.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <button className="btn dark small" type="submit">Criar</button>
          <button className="btn small" type="button" onClick={() => setNovo(null)}>Cancelar</button>
        </form>
      )}
      {erro && <p className="err" role="alert" style={{ marginBottom: 12 }}>{erro}</p>}
      {lista === null ? (
        <p className="note">Carregando…</p>
      ) : lista.length === 0 ? (
        <Vazio titulo="Nenhum analista" texto="Rode a migração 0012: ela cria a Base EZE, os analistas de cada etapa, Bombinhas, Itajaí e Estética, prontos para alimentar." />
      ) : (
        <div className="stack" style={{ gap: 22 }}>
          {CAMADAS.map((cam) => {
            const g = lista.filter((a) => a.camada === cam.id);
            if (!g.length) return null;
            return (
              <section key={cam.id}>
                <p className="mono" style={{ marginBottom: 8 }}>{cam.nome} · {cam.desc}</p>
                <div className="lista">
                  {g.map((a) => {
                    const c = conta[a.id];
                    const vazio = !a.orientacoes.trim() && !c;
                    return (
                      <Link key={a.id} href={`/analistas/${a.id}`} className="item" style={{ opacity: a.ativo ? 1 : 0.5 }}>
                        <span className="item-t">
                          <strong>{a.nome}</strong>
                          <small>
                            {[
                              a.etapas.length ? `Etapas ${a.etapas.join(", ")}` : "Todas as etapas",
                              a.cidades.length ? a.cidades.join(", ") : null,
                              `${c?.itens ?? 0} itens`,
                              `${c?.docs ?? 0} documentos`,
                            ].filter(Boolean).join(" · ")}
                          </small>
                        </span>
                        {!a.ativo ? <span className="pill">Inativo</span> : vazio ? <span className="pill dash">A alimentar</span> : <span className="pill inv">Pronto</span>}
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
