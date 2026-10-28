"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { Cabeca, Vazio } from "../ui";
import Sub from "./Sub";
import { erroMsg } from "@/lib/util";

type Trilha = { id: string; titulo: string; descricao: string | null; publicada: boolean; ordem: number; aulas: { id: string; publicada: boolean }[] };

export default function Padroes() {
  const { eu, esc, admin } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const router = useRouter();
  const [trilhas, setTrilhas] = useState<Trilha[] | null>(null);
  const [feitas, setFeitas] = useState<Set<string>>(new Set());
  const [cred, setCred] = useState<Set<string>>(new Set());
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const [{ data: t }, { data: p }, { data: c }] = await Promise.all([
      supabase.from("trilhas").select("id,titulo,descricao,publicada,ordem,aulas(id,publicada)").eq("escritorio_id", esc.id).order("ordem"),
      supabase.from("progresso_aula").select("aula_id").eq("perfil_id", eu.id).not("concluida_em", "is", null),
      supabase.from("credenciamentos").select("trilha_id").eq("perfil_id", eu.id),
    ]);
    setTrilhas(((t as Trilha[]) ?? []).filter((x) => admin || x.publicada));
    setFeitas(new Set((p ?? []).map((x: { aula_id: string }) => x.aula_id)));
    setCred(new Set((c ?? []).map((x: { trilha_id: string }) => x.trilha_id)));
  }, [supabase, esc.id, eu.id, admin]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!nova.trim()) return;
    const ordem = (trilhas?.reduce((m, t) => Math.max(m, t.ordem), 0) ?? 0) + 1;
    const { data, error } = await supabase.from("trilhas").insert({ escritorio_id: esc.id, titulo: nova.trim(), ordem, publicada: false }).select("id").single();
    if (error) return setErro(erroMsg(error));
    router.push(`/padroes/${data.id}`);
  }

  return (
    <>
      <Cabeca kicker="Padrões EZE" titulo="Treinamento" />
      <Sub />
      <p className="note" style={{ marginTop: -8, marginBottom: 20 }}>
        Cada trilha é uma habilidade. Ao concluir todas as aulas, você fica credenciado nela. As aulas continuam disponíveis para rever.
      </p>

      {trilhas === null ? (
        <p className="note">Carregando…</p>
      ) : trilhas.length === 0 ? (
        <Vazio titulo="Nenhuma trilha publicada ainda" texto={admin ? "Crie a primeira trilha abaixo." : "Quando o escritório publicar o treinamento, ele aparece aqui."} />
      ) : (
        <div className="grid2">
          {trilhas.map((t) => {
            const pub = t.aulas.filter((a) => a.publicada);
            const lista = admin ? t.aulas : pub;
            const ok = pub.filter((a) => feitas.has(a.id)).length;
            const pct = pub.length ? Math.round((ok / pub.length) * 100) : 0;
            return (
              <Link key={t.id} href={`/padroes/${t.id}`} className="box trilha-card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong style={{ fontSize: 17 }}>{t.titulo}</strong>
                  {cred.has(t.id) ? <span className="pill inv">Credenciado</span> : !t.publicada ? <span className="pill dash">Rascunho</span> : null}
                </div>
                {t.descricao && <span className="note" style={{ margin: 0 }}>{t.descricao}</span>}
                <div className="barra" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
                <span className="note">
                  {lista.length === 0 ? "Nenhuma aula ainda" : `${ok} de ${pub.length} aulas concluídas`}
                  {admin && t.aulas.length !== pub.length ? ` · ${t.aulas.length - pub.length} em rascunho` : ""}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {admin && (
        <form className="box row" style={{ marginTop: 20, alignItems: "flex-end" }} onSubmit={criar}>
          <label className="form-l" style={{ flex: "1 1 260px" }}>
            <span>Nova trilha</span>
            <input type="text" value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Ex.: Detalhamento executivo" maxLength={80} />
          </label>
          <button className="btn dark" type="submit">Criar trilha</button>
          {erro && <p className="err" role="alert" style={{ width: "100%" }}>{erro}</p>}
        </form>
      )}
    </>
  );
}
