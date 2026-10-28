"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "../ctx";
import { Avatar, Cabeca } from "../ui";
import { MODELO_URL, PAPEL, erroMsg } from "@/lib/util";

export default function Perfil() {
  const { eu, esc, papel, admin } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const router = useRouter();
  const [f, setF] = useState({ nome: eu.nome, cidade: eu.cidade ?? "" });
  const [msg, setMsg] = useState<{ t: "ok" | "err"; s: string } | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("perfis").update({ nome: f.nome.trim() || eu.nome, cidade: f.cidade.trim() || null }).eq("id", eu.id);
    if (error) return setMsg({ t: "err", s: erroMsg(error) });
    setMsg({ t: "ok", s: "Perfil salvo." });
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <Cabeca kicker={`${PAPEL[papel]} · ${esc.nome}`} titulo="Meu perfil" />
      <form className="box stack" onSubmit={salvar}>
        <div className="row">
          <Avatar nome={f.nome} foto={eu.foto} size={56} />
          <span className="note">{eu.email}{eu.foto ? " · foto da sua conta Google" : ""}</span>
        </div>
        <label className="form-l">
          <span>Como quer ser chamado</span>
          <input type="text" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} maxLength={60} />
        </label>
        <label className="form-l">
          <span>Cidade</span>
          <input type="text" value={f.cidade} onChange={(e) => setF({ ...f, cidade: e.target.value })} placeholder="Ex.: Bombinhas, SC" maxLength={60} />
        </label>
        {msg && <p className={msg.t} role={msg.t === "err" ? "alert" : "status"}>{msg.s}</p>}
        <div className="row"><button className="btn dark" type="submit">Salvar</button></div>
      </form>

      <div className="lista" style={{ marginTop: 20 }}>
        {admin && <Link className="item" href="/config"><span className="item-t"><strong>Configurações do escritório</strong><small>Nome e links de chamada dos ambientes</small></span></Link>}
        <a className="item" href={MODELO_URL} target="_blank" rel="noreferrer"><span className="item-t"><strong>Ver modelo</strong><small>Versão de demonstração com conteúdo de exemplo</small></span></a>
        <Link className="item" href="/privacidade"><span className="item-t"><strong>Privacidade</strong></span></Link>
        <form action="/auth/sair" method="post" className="item">
          <span className="item-t"><strong>Sair</strong></span>
          <button className="btn small" type="submit">Sair</button>
        </form>
      </div>
    </div>
  );
}
