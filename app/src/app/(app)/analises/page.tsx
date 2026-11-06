"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp, usePode } from "../ctx";
import { Cabeca, Vazio } from "../ui";
import { nomeProjeto } from "@/lib/gestor";
import { dataHora } from "@/lib/util";
import type { Analise } from "@/lib/analistas";
import { AbasAnalise, Nota, SeloDecisao, SeloStatus } from "./comum";

type Linha = Pick<Analise, "id" | "titulo" | "etapa_sigla" | "cidade" | "status" | "nota" | "decisao" | "created_at" | "enviado_por" | "projeto_id"> & {
  projetos: { nome: string; codigo: number | null; tipologia: string | null } | null;
  perfis: { nome: string | null } | null;
};

export default function Analises() {
  const { esc, eu } = useApp();
  const todas = usePode("analistas");
  const router = useRouter();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [lista, setLista] = useState<Linha[] | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "minhas" | "aguardando">(todas ? "aguardando" : "minhas");
  const [erro, setErro] = useState("");

  useEffect(() => {
    supabase
      .from("analises")
      .select("id,titulo,etapa_sigla,cidade,status,nota,decisao,created_at,enviado_por,projeto_id, projetos(nome,codigo,tipologia), perfis:enviado_por(nome)")
      .eq("escritorio_id", esc.id)
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (error) setErro(error.message.includes("analises") ? "Rode a migração 0012 no Supabase para ativar a pré-análise." : error.message);
        setLista((data as unknown as Linha[]) ?? []);
      });
  }, [supabase, esc.id]);

  const vis = (lista ?? []).filter((a) =>
    filtro === "minhas" ? a.enviado_por === eu.id : filtro === "aguardando" ? a.status === "concluida" && !a.decisao : true
  );

  return (
    <>
      <Cabeca kicker="Pré-análise IA" titulo="Análises">
        <Link className="btn dark small" href="/analises/nova">Enviar para análise</Link>
      </Cabeca>
      <AbasAnalise />
      <div className="row" style={{ marginBottom: 14 }}>
        <div className="tabs seg" role="tablist">
          {(todas ? (["aguardando", "todas", "minhas"] as const) : (["minhas", "todas"] as const)).map((k) => (
            <button key={k} type="button" className={filtro === k ? "on" : ""} onClick={() => setFiltro(k)}>
              {k === "aguardando" ? "Aguardando decisão" : k === "todas" ? "Todas" : "Minhas"}
            </button>
          ))}
        </div>
      </div>
      {erro && <p className="err" role="alert" style={{ marginBottom: 12 }}>{erro}</p>}
      {lista === null ? (
        <p className="note">Carregando…</p>
      ) : vis.length === 0 ? (
        <Vazio
          titulo={filtro === "aguardando" ? "Nada aguardando decisão" : "Nenhuma análise"}
          texto="Envie as pranchas em PDF ou os renders. A IA confere com os analistas da etapa, da cidade e da estética antes da aprovação."
        >
          <Link className="btn dark small" href="/analises/nova">Enviar para análise</Link>
        </Vazio>
      ) : (
        <div className="tabela-w">
          <table className="tabela">
            <thead>
              <tr><th>Entrega</th><th>Projeto</th><th>Etapa</th><th>Status</th><th>Estética</th><th>Decisão</th><th>Enviado</th></tr>
            </thead>
            <tbody>
              {vis.map((a) => (
                <tr key={a.id} className="clicavel" onClick={() => router.push(`/analises/${a.id}`)}>
                  <td><Link href={`/analises/${a.id}`} style={{ fontWeight: 500, textDecoration: "none" }}>{a.titulo}</Link></td>
                  <td className="note">{a.projetos ? nomeProjeto(a.projetos) : "Sem projeto"}{a.cidade ? ` · ${a.cidade}` : ""}</td>
                  <td>{a.etapa_sigla || "—"}</td>
                  <td><SeloStatus s={a.status} /></td>
                  <td><Nota v={a.nota} /></td>
                  <td>{a.status === "concluida" ? <SeloDecisao d={a.decisao} /> : <span className="note">—</span>}</td>
                  <td className="note">{a.perfis?.nome || "—"} · {dataHora(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
