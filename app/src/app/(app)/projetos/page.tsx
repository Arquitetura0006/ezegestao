"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { Avatar, Cabeca, Vazio } from "../ui";
import { FASES, dataCurta, erroMsg } from "@/lib/util";

type Proj = { id: string; nome: string; fase: string | null; prazo: string | null; ativo: boolean; membros: { perfil: { nome: string | null; foto_url: string | null } | null }[] };

export default function Projetos() {
  const { esc, admin } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const router = useRouter();
  const [lista, setLista] = useState<Proj[] | null>(null);
  const [busca, setBusca] = useState("");
  const [arquivados, setArquivados] = useState(false);
  const [novo, setNovo] = useState<{ nome: string; fase: string; prazo: string } | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from("projetos")
      .select("id,nome,fase,prazo,ativo,membros:projeto_membros(perfil:perfis(nome,foto_url))")
      .eq("escritorio_id", esc.id)
      .order("nome");
    setLista((data as unknown as Proj[]) ?? []);
  }, [supabase, esc.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!novo) return;
    setErro("");
    if (!novo.nome.trim()) return setErro("Dê um nome ao projeto.");
    const { data, error } = await supabase
      .from("projetos")
      .insert({ escritorio_id: esc.id, nome: novo.nome.trim(), fase: novo.fase || null, prazo: novo.prazo || null })
      .select("id")
      .single();
    if (error) return setErro(erroMsg(error));
    router.push(`/projetos/${data.id}`);
  }

  const q = busca.trim().toLowerCase();
  const vis = (lista ?? []).filter((p) => p.ativo !== arquivados && (!q || `${p.nome} ${p.fase ?? ""}`.toLowerCase().includes(q)));
  const nArq = (lista ?? []).filter((p) => !p.ativo).length;

  return (
    <>
      <Cabeca kicker={esc.nome} titulo="Projetos">
        {admin && !novo && <button className="btn dark" type="button" onClick={() => setNovo({ nome: "", fase: FASES[0], prazo: "" })}>Novo projeto</button>}
      </Cabeca>

      {novo && (
        <form className="box stack" style={{ marginBottom: 20 }} onSubmit={criar}>
          <div className="grid2" style={{ gap: 12 }}>
            <label className="form-l"><span>Nome</span><input type="text" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} autoFocus maxLength={100} placeholder="Ex.: Residência Costa" /></label>
            <label className="form-l"><span>Fase</span>
              <select className="f" value={novo.fase} onChange={(e) => setNovo({ ...novo, fase: e.target.value })}>{FASES.map((f) => <option key={f}>{f}</option>)}</select>
            </label>
            <label className="form-l"><span>Prazo da fase</span><input type="date" value={novo.prazo} onChange={(e) => setNovo({ ...novo, prazo: e.target.value })} /></label>
          </div>
          {erro && <p className="err" role="alert">{erro}</p>}
          <div className="row">
            <button className="btn dark small" type="submit">Criar projeto</button>
            <button className="btn small" type="button" onClick={() => setNovo(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {lista && lista.length > 0 && (
        <div className="row" style={{ marginBottom: 16 }}>
          <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar projeto" style={{ maxWidth: 360 }} aria-label="Buscar projeto" />
          {nArq > 0 && (
            <button className="btn small" type="button" onClick={() => setArquivados(!arquivados)}>{arquivados ? "Ver ativos" : `Arquivados (${nArq})`}</button>
          )}
        </div>
      )}

      {lista === null ? (
        <p className="note">Carregando…</p>
      ) : vis.length === 0 ? (
        <Vazio
          titulo={lista.length === 0 ? "Nenhum projeto ainda" : "Nada encontrado"}
          texto={lista.length === 0 ? (admin ? "Cadastre os projetos em andamento e coloque os Partners de cada um." : "Os projetos em que você participa aparecem aqui.") : undefined}
        />
      ) : (
        <div className="lista">
          {vis.map((p) => (
            <Link key={p.id} href={`/projetos/${p.id}`} className="item">
              <div className="item-t">
                <strong>{p.nome}</strong>
                <small>{[p.fase, p.prazo ? `prazo ${dataCurta(p.prazo + "T12:00:00")}` : null].filter(Boolean).join(" · ") || "Sem fase"}</small>
              </div>
              <span className="row" style={{ gap: 0 }}>
                {p.membros.slice(0, 4).map((m, i) => (
                  <span key={i} style={{ marginLeft: i ? -8 : 0 }}><Avatar nome={m.perfil?.nome} foto={m.perfil?.foto_url} size={28} /></span>
                ))}
                {p.membros.length > 4 && <small className="note" style={{ marginLeft: 6 }}>+{p.membros.length - 4}</small>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
