"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { CAMPOS_CLIENTE, LIMITE_REF, refAceita, type CamposCliente, type Ref } from "@/lib/briefing";
import { nomeArquivo } from "@/lib/analistas";
import Refs, { NovaRef } from "../Refs";

type Dados = {
  projeto: string;
  escritorio: string;
  escritorio_id: string;
  projeto_id: string;
  cliente: CamposCliente;
  cliente_nome: string | null;
  enviado_em: string | null;
  refs: Ref[];
};

// Página do cliente: preenche o briefing e envia referências, sem criar conta.
export default function BriefingCliente({ params }: { params: { token: string } }) {
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [d, setD] = useState<Dados | null | undefined>(undefined);
  const [campos, setCampos] = useState<CamposCliente>({});
  const [nome, setNome] = useState("");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [enviandoRef, setEnviandoRef] = useState(false);

  const carregar = useCallback(async (inicial = false) => {
    const { data, error } = await supabase.rpc("briefing_publico", { p_token: params.token });
    if (error) return setD(null);
    const x = (data as Dados | null) ?? null;
    setD(x);
    if (x && inicial) {
      setCampos(x.cliente || {});
      setNome(x.cliente_nome || "");
    }
  }, [supabase, params.token]);
  useEffect(() => {
    carregar(true);
  }, [carregar]);

  async function salvar(enviar: boolean) {
    setErro("");
    setMsg("");
    if (enviar && !nome.trim()) return setErro("Informe seu nome antes de enviar.");
    setSalvando(true);
    const { error } = await supabase.rpc("briefing_cliente_salvar", { p_token: params.token, p_cliente: campos, p_nome: nome, p_enviar: enviar });
    setSalvando(false);
    if (error) return setErro("Não foi possível salvar. Confira a conexão e tente de novo.");
    setMsg(enviar ? "Enviado. A equipe já recebeu suas respostas; você pode voltar e completar quando quiser." : "Rascunho salvo.");
    carregar();
  }

  async function addRef({ tipo, comentario, arquivos, link }: { tipo: Ref["tipo"]; comentario: string; arquivos: File[]; link: string }) {
    if (!d) return;
    setErro("");
    setEnviandoRef(true);
    try {
      for (const f of arquivos) {
        if (!refAceita(f.type)) throw new Error(`${f.name}: envie imagens (JPG, PNG, WEBP) ou PDF.`);
        if (f.size > LIMITE_REF) throw new Error(`${f.name}: limite de 25 MB por arquivo.`);
        const caminho = `${d.escritorio_id}/${d.projeto_id}/cliente/${params.token}/${Date.now()}-${nomeArquivo(f.name)}`;
        const up = await supabase.storage.from("briefing").upload(caminho, f, { contentType: f.type });
        if (up.error) throw new Error("Não foi possível enviar o arquivo.");
        const { error } = await supabase.rpc("briefing_cliente_ref", {
          p_token: params.token, p_tipo: tipo, p_titulo: f.name.replace(/\.[^.]+$/, ""), p_comentario: comentario || null,
          p_caminho: caminho, p_mime: f.type, p_tamanho: f.size, p_link: null,
        });
        if (error) throw new Error(error.message);
      }
      if (link.trim()) {
        const url = /^https?:\/\//.test(link.trim()) ? link.trim() : `https://${link.trim()}`;
        const { error } = await supabase.rpc("briefing_cliente_ref", {
          p_token: params.token, p_tipo: tipo, p_titulo: null, p_comentario: comentario || null,
          p_caminho: null, p_mime: null, p_tamanho: null, p_link: url,
        });
        if (error) throw new Error(error.message);
      }
    } catch (e) {
      setErro((e as Error).message);
    }
    setEnviandoRef(false);
    carregar();
  }

  async function tirar(r: Ref) {
    const { data } = await supabase.rpc("briefing_cliente_tirar", { p_token: params.token, p_ref: r.id });
    if (data) await supabase.storage.from("briefing").remove([data as string]);
    carregar();
  }

  if (d === undefined) return <main className="wrap"><p className="note">Carregando…</p></main>;
  if (d === null)
    return (
      <main className="wrap" style={{ maxWidth: 620 }}>
        <p className="mono" style={{ marginBottom: 12 }}>Briefing do projeto</p>
        <h1 className="h-l">Este link não está ativo.</h1>
        <p className="note" style={{ marginTop: 12 }}>Peça um novo link ao escritório.</p>
      </main>
    );

  return (
    <main className="wrap br-cli">
      <header className="br-cab">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full.png" alt={d.escritorio} />
      </header>
      <p className="mono" style={{ margin: "28px 0 8px" }}>Briefing do projeto</p>
      <h1 className="h-l">{d.projeto}</h1>
      <p className="note" style={{ maxWidth: 640, marginTop: 10 }}>
        Conte com as suas palavras o que você espera deste projeto. Quanto mais detalhes, imagens e exemplos, melhor o resultado. Você pode salvar e voltar depois pelo mesmo link.
      </p>

      <section className="box stack" style={{ marginTop: 24 }}>
        <label className="form-l">
          <span>Seu nome</span>
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        {CAMPOS_CLIENTE.map((c) => (
          <label key={c.k} className="form-l">
            <span>{c.t}</span>
            <small className="note">{c.dica}</small>
            {c.curto ? (
              <input type="text" value={campos[c.k] ?? ""} onChange={(e) => setCampos({ ...campos, [c.k]: e.target.value })} />
            ) : (
              <textarea value={campos[c.k] ?? ""} onChange={(e) => setCampos({ ...campos, [c.k]: e.target.value })} />
            )}
          </label>
        ))}
      </section>

      <section className="box stack" style={{ marginTop: 16 }}>
        <div>
          <p className="sec-t" style={{ margin: 0 }}>Imagens e referências</p>
          <p className="note" style={{ margin: "2px 0 0" }}>Fotos, prints, projetos que você gosta e também o que não gosta. Diga o que chama a sua atenção em cada uma.</p>
        </div>
        <NovaRef enviar={addRef} ocupado={enviandoRef} />
        <Refs refs={d.refs} tirar={tirar} vazio="Nenhuma imagem enviada ainda." />
      </section>

      {erro && <p className="err" role="alert" style={{ marginTop: 14 }}>{erro}</p>}
      {msg && <p className="ok" role="status" style={{ marginTop: 14 }}>{msg}</p>}
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn dark" type="button" disabled={salvando} onClick={() => salvar(true)}>Enviar para a equipe</button>
        <button className="btn" type="button" disabled={salvando} onClick={() => salvar(false)}>Salvar rascunho</button>
        {d.enviado_em && <span className="note">Última vez enviado em {new Date(d.enviado_em).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
      <p className="note" style={{ marginTop: 28 }}>{d.escritorio} · suas respostas ficam visíveis só para a equipe do projeto.</p>
    </main>
  );
}
