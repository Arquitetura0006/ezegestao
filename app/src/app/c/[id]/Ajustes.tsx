"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import type { ProjetoCoord } from "@/lib/coord";
import { erroMsg } from "@/lib/util";

type Tipo = { id: string; nome: string; ordem: number; ativo: boolean };

export default function Ajustes({
  projeto, etapas, onTipos, avisar,
}: {
  projeto: ProjetoCoord; etapas: { sigla: string; nome: string }[]; onTipos: (t: string[]) => void; avisar: (t: string) => void;
}) {
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [novo, setNovo] = useState("");

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("coord_tipos").select("id,nome,ordem,ativo").eq("escritorio_id", projeto.escritorio_id).order("ordem");
    const l = (data as Tipo[]) ?? [];
    setTipos(l);
    onTipos(l.filter((t) => t.ativo).map((t) => t.nome));
  }, [supabase, projeto.escritorio_id, onTipos]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!novo.trim()) return;
    const { error } = await supabase.from("coord_tipos").insert({ escritorio_id: projeto.escritorio_id, nome: novo.trim(), ordem: tipos.length + 1 });
    if (error) return avisar(erroMsg(error));
    setNovo("");
    carregar();
  }

  async function alternar(t: Tipo) {
    const { error } = await supabase.from("coord_tipos").update({ ativo: !t.ativo }).eq("id", t.id);
    if (error) return avisar(erroMsg(error));
    carregar();
  }

  async function renomear(t: Tipo, nome: string) {
    if (!nome.trim() || nome === t.nome) return;
    const { error } = await supabase.from("coord_tipos").update({ nome: nome.trim() }).eq("id", t.id);
    if (error) return avisar(erroMsg(error));
    carregar();
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h3 className="sec-t">Tipos de apontamento</h3>
        <div className="lista">
          {tipos.map((t) => (
            <div key={t.id} className="item" style={{ opacity: t.ativo ? 1 : 0.5, padding: "8px 12px" }}>
              <input type="text" defaultValue={t.nome} onBlur={(e) => renomear(t, e.target.value)} style={{ border: 0, padding: "6px 4px" }} aria-label="Nome do tipo" />
              <button type="button" className="btn small ghost" onClick={() => alternar(t)}>{t.ativo ? "Desativar" : "Ativar"}</button>
            </div>
          ))}
        </div>
        <form className="row" style={{ flexWrap: "nowrap", marginTop: 8 }} onSubmit={criar}>
          <input type="text" placeholder="Novo tipo" value={novo} onChange={(e) => setNovo(e.target.value)} />
          <button className="btn small" type="submit">Adicionar</button>
        </form>
        <p className="note" style={{ margin: "6px 0 0" }}>Valem para todos os projetos do escritório.</p>
      </div>

      <div>
        <h3 className="sec-t">Etapas</h3>
        <p className="note" style={{ margin: "0 0 8px" }}>
          As mesmas do processo do escritório ({etapas.map((e) => e.sigla).join(", ") || "nenhuma cadastrada"}). Para mudar, edite em{" "}
          <Link href="/cadastros">Cadastros › Processo EZE</Link>.
        </p>
      </div>
    </div>
  );
}
