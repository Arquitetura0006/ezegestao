"use client";

import { useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../../ctx";
import { erroMsg, type Papel } from "@/lib/util";
import { CARGOS, MODULOS, type Modulo, type Nivel, type Permissoes } from "@/lib/permissoes";
import { Ico, Sw, type MembroP } from "./comum";

// Permissões de acesso (só Dono/Administrador alteram).
export default function AbaPermissoes({ m, onSaved }: { m: MembroP; onSaved: () => void }) {
  const { eu, esc, papel: meuPapel } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const inicial = () => ({ papel: m.papel, perm: { ...(m.permissoes ?? {}) } as Permissoes, fin: m.acesso_financeiro });
  const [s, setS] = useState(inicial);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; s: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const dono = s.papel === "dono";
  const admin = s.papel === "admin" || dono;
  const souEu = m.perfil_id === eu.id;
  // O dono não muda de papel por aqui; ninguém tira o próprio acesso; só o dono rebaixa outro administrador.
  const travaPapel = dono || souEu || (m.papel === "admin" && meuPapel !== "dono");
  const nivel = (mod: Modulo): Nivel | null => {
    if (dono) return "editar";
    if (mod === "financeiro") return s.fin ? "editar" : s.perm.financeiro ?? null;
    if (admin) return "editar";
    return s.perm[mod] ?? null;
  };
  const mudou = JSON.stringify(s) !== JSON.stringify(inicial());

  function setNivel(mod: Modulo, n: Nivel | null) {
    const perm = { ...s.perm };
    if (n) perm[mod] = n;
    else delete perm[mod];
    setS({ ...s, perm, fin: mod === "financeiro" ? n === "editar" : s.fin });
    setMsg(null);
  }

  function aplicar(i: string) {
    if (i === "") return;
    const c = CARGOS[Number(i)];
    setS({ ...s, perm: { ...c.p }, fin: c.p.financeiro === "editar" });
    setMsg(null);
  }

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    const { error } = await supabase.from("membros").update({ papel: s.papel, permissoes: s.perm, acesso_financeiro: s.fin }).eq("escritorio_id", esc.id).eq("perfil_id", m.perfil_id);
    setSalvando(false);
    if (error) return setMsg({ t: "err", s: error.message.includes("permissoes") ? "Rode a migração 0009 no Supabase para salvar permissões." : erroMsg(error) });
    setMsg({ t: "ok", s: "Permissões salvas. Valem no próximo carregamento da página da pessoa." });
    onSaved();
  }

  const setPapel = (p: Papel) => {
    setS({ ...s, papel: p });
    setMsg(null);
  };

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="cabeca" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 14, flexWrap: "nowrap" }}>
          <span className="perm-ic"><Ico k="permissoes" size={20} /></span>
          <div>
            <h2 className="sec-t" style={{ margin: 0 }}>Permissões de acesso</h2>
            <p className="note" style={{ margin: 0 }}>O que esta pessoa vê e edita em cada módulo. Sem nada marcado, vê só os próprios projetos e tarefas.</p>
          </div>
        </div>
        <div className="cabeca-acoes">
          <select className="f" style={{ width: 230 }} value="" onChange={(e) => aplicar(e.target.value)} disabled={admin} aria-label="Aplicar cargo">
            <option value="">Aplicar cargo…</option>
            {CARGOS.map((c, i) => <option key={c.nome} value={i}>{c.nome}</option>)}
          </select>
          <button className="btn" type="button" disabled={!mudou} onClick={() => { setS(inicial()); setMsg(null); }}>Cancelar</button>
          <button className="btn dark" type="button" disabled={!mudou || salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
      {msg && <p className={msg.t} role={msg.t === "err" ? "alert" : "status"} style={{ marginBottom: 12 }}>{msg.s}</p>}

      <p className="note" style={{ margin: "0 0 8px" }}>Permissões especiais</p>
      <div className="perm" style={{ marginBottom: 22 }}>
        <div className="perm-l esp">
          <span className="perm-ic"><Ico k="admin" size={18} /></span>
          <span><strong>Administrador</strong><small>{dono ? "Dono do escritório: acesso completo." : "Acesso completo, exceto financeiro (permissão própria). Gerencia equipe e configurações."}</small></span>
          <span className="perm-c"><Sw label="Administrador" on={admin} disabled={travaPapel} onChange={(v) => setPapel(v ? "admin" : "partner")} /></span>
        </div>
        <div className="perm-l esp">
          <span className="perm-ic"><Ico k="recepcao" size={18} /></span>
          <span><strong>Recepção</strong><small>Recebe o alerta quando um cliente chama na recepção virtual.</small></span>
          <span className="perm-c"><Sw label="Recepção" on={s.papel === "recepcao"} disabled={admin || souEu} onChange={(v) => setPapel(v ? "recepcao" : "partner")} /></span>
        </div>
        <div className="perm-l esp">
          <span className="perm-ic"><Ico k="sensiveis" size={18} /></span>
          <span><strong>Visualizar dados sensíveis</strong><small>Valor/hora, custo das horas e custo por projeto.</small></span>
          <span className="perm-c"><Sw label="Dados sensíveis" on={admin || !!s.perm.sensiveis} disabled={admin} onChange={(v) => setNivel("sensiveis", v ? "ver" : null)} /></span>
        </div>
      </div>

      <div className="perm">
        {MODULOS.map((mod) => {
          const n = nivel(mod.id);
          const travado = dono || (admin && mod.id !== "financeiro");
          const ver = mod.soEditar ? true : !!n;
          return (
            <div key={mod.id} className="perm-l">
              <span className="perm-ic"><Ico k={mod.id} size={18} /></span>
              <span><strong>{mod.nome}</strong><small>{mod.desc}</small></span>
              <span className="perm-c">Visualizar<Sw label={`${mod.nome}: visualizar`} on={ver} disabled={travado || mod.soEditar} onChange={(v) => setNivel(mod.id, v ? "ver" : null)} /></span>
              <span className="perm-c">Editar<Sw label={`${mod.nome}: editar`} on={n === "editar"} disabled={travado} onChange={(v) => setNivel(mod.id, v ? "editar" : mod.soEditar ? null : "ver")} /></span>
            </div>
          );
        })}
      </div>
      {souEu && <p className="note" style={{ marginTop: 12 }}>Você não pode tirar o seu próprio acesso de administrador.</p>}
    </div>
  );
}
