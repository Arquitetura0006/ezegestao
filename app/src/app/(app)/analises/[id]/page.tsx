"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp, usePode } from "../../ctx";
import { Cabeca, Vazio } from "../../ui";
import { nomeProjeto } from "@/lib/gestor";
import { dataHora, erroMsg } from "@/lib/util";
import { CAMADA_NOME, DECISAO_NOME, ITEM_STATUS, tamanho, type Analise, type Decisao, type Parecer } from "@/lib/analistas";
import { AbasAnalise, Nota, SeloDecisao, SeloItem, SeloStatus } from "../comum";

type Det = Analise & {
  projetos: { nome: string; codigo: number | null; tipologia: string | null } | null;
  autor: { nome: string | null } | null;
  revisor: { nome: string | null } | null;
};

const GRAV: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

export default function AnalisePg({ params }: { params: { id: string } }) {
  const { eu } = useApp();
  const editor = usePode("analistas", true);
  const router = useRouter();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [a, setA] = useState<Det | null | undefined>(undefined);
  const [dec, setDec] = useState<{ decisao: Decisao | ""; parecer: string }>({ decisao: "", parecer: "" });
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [pedindo, setPedindo] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from("analises")
      .select("*, projetos(nome,codigo,tipologia), autor:enviado_por(nome), revisor:revisado_por(nome)")
      .eq("id", params.id)
      .maybeSingle();
    if (error) setErro(erroMsg(error));
    setA((data as unknown as Det) ?? null);
    return data as unknown as Det | null;
  }, [supabase, params.id]);

  useEffect(() => {
    carregar().then((d) => d && setDec({ decisao: d.decisao ?? "", parecer: d.parecer_final ?? "" }));
  }, [carregar]);

  // Enquanto a IA trabalha, confere a cada 5 s
  const rodando = a?.status === "analisando" || a?.status === "enviada";
  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(carregar, 5000);
    return () => clearInterval(t);
  }, [rodando, carregar]);

  async function rodar() {
    setErro("");
    setPedindo(true);
    const r = await fetch(`/api/analises/${params.id}/rodar`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErro(j.erro || "Não foi possível iniciar a análise.");
    setPedindo(false);
    carregar();
  }

  async function decidir(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setOk("");
    const { error } = await supabase.rpc("analise_decidir", { p_id: params.id, p_decisao: dec.decisao || null, p_parecer: dec.parecer });
    if (error) return setErro(erroMsg(error));
    setOk("Decisão registrada.");
    carregar();
  }

  async function abrir(caminho: string) {
    const w = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("analises").createSignedUrl(caminho, 300);
    if (error || !data) {
      w?.close();
      return setErro(erroMsg(error));
    }
    if (w) w.location.href = data.signedUrl;
  }

  async function apagar() {
    if (!a || !confirm("Apagar esta análise e os arquivos enviados?")) return;
    await supabase.storage.from("analises").remove(a.arquivos.map((f) => f.caminho));
    const { error } = await supabase.from("analises").delete().eq("id", a.id);
    if (error) return setErro(erroMsg(error));
    router.push("/analises");
  }

  if (a === undefined) return <p className="note">Carregando…</p>;
  if (a === null) return <Vazio titulo="Análise não encontrada" texto="Ela pode ter sido apagada ou você não tem acesso." />;

  const p = a.resultado as Parecer | null;
  const meu = a.enviado_por === eu.id;
  const podeRodar = (meu || editor) && !rodando;
  const proj = a.projetos ? nomeProjeto(a.projetos) : null;

  return (
    <>
      <div className="no-print">
      <Cabeca kicker={["Pré-análise IA", proj, a.etapa_sigla, a.cidade].filter(Boolean).join(" · ")} titulo={a.titulo}>
        {a.status === "concluida" && <button className="btn small" type="button" onClick={() => window.print()}>Imprimir / PDF</button>}
        {a.projeto_id && <Link className="btn small" href={`/projetos/${a.projeto_id}`}>Ver projeto</Link>}
        {podeRodar && <button className="btn small" type="button" disabled={pedindo} onClick={rodar}>{a.status === "concluida" ? "Analisar de novo" : "Tentar de novo"}</button>}
        {(editor || (meu && !a.decisao)) && <button className="btn small ghost" type="button" onClick={apagar}>Apagar</button>}
      </Cabeca>
      <AbasAnalise />
      </div>

      <div className="row no-print" style={{ marginBottom: 16 }}>
        <SeloStatus s={a.status} />
        {a.status === "concluida" && <SeloDecisao d={a.decisao} />}
        <span className="note">Enviada por {a.autor?.nome || "—"} em {dataHora(a.created_at)}</span>
      </div>

      {erro && <p className="err no-print" role="alert" style={{ marginBottom: 12 }}>{erro}</p>}

      {rodando && (
        <div className="box no-print" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>A IA está analisando a entrega.</p>
          <p className="note" style={{ margin: "4px 0 0" }}>Leva de 1 a 4 minutos. Pode sair desta tela; o parecer aparece aqui quando terminar.</p>
          {a.status === "enviada" && (meu || editor) && (
            <button className="btn small" type="button" style={{ marginTop: 12 }} disabled={pedindo} onClick={rodar}>Iniciar agora</button>
          )}
        </div>
      )}

      {a.status === "erro" && (
        <div className="box no-print" style={{ marginBottom: 16, borderColor: "var(--fg)" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>A análise não terminou.</p>
          <p className="note" style={{ margin: "4px 0 0" }}>{a.erro || "Erro desconhecido."}</p>
        </div>
      )}

      <div className="ia-det no-print">
        <div className="stack" style={{ gap: 16, minWidth: 0 }}>
          {p && <Parecer p={p} nota={a.nota} />}
          {!p && !rodando && a.status !== "erro" && <Vazio titulo="Sem parecer ainda" />}
        </div>

        <aside className="stack" style={{ gap: 16 }}>
          {a.status === "concluida" && (
            <form className="box stack" onSubmit={decidir}>
              <p className="sec-t" style={{ margin: 0 }}>Decisão final</p>
              {editor ? (
                <>
                  <div className="stack" style={{ gap: 6 }}>
                    {(Object.keys(DECISAO_NOME) as Decisao[]).map((k) => (
                      <label key={k} className="row" style={{ gap: 8 }}>
                        <input type="radio" name="dec" checked={dec.decisao === k} onChange={() => setDec({ ...dec, decisao: k })} /> {DECISAO_NOME[k]}
                      </label>
                    ))}
                  </div>
                  <label className="form-l">
                    <span>Parecer do responsável</span>
                    <textarea value={dec.parecer} onChange={(e) => setDec({ ...dec, parecer: e.target.value })} placeholder="O que vale, o que corrigir, o que a IA errou." />
                  </label>
                  {ok && <p className="ok" role="status">{ok}</p>}
                  <div className="row">
                    <button className="btn dark small" type="submit" disabled={!dec.decisao && !a.decisao}>{dec.decisao || !a.decisao ? "Registrar decisão" : "Tirar decisão"}</button>
                    {a.decisao && <button className="btn small ghost" type="button" onClick={() => setDec({ decisao: "", parecer: "" })}>Limpar</button>}
                  </div>
                </>
              ) : a.decisao ? (
                <>
                  <SeloDecisao d={a.decisao} />
                  {a.parecer_final && <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{a.parecer_final}</p>}
                </>
              ) : (
                <p className="note" style={{ margin: 0 }}>Aguardando o responsável.</p>
              )}
              {a.revisado_em && <p className="note" style={{ margin: 0 }}>{a.revisor?.nome || "—"} · {dataHora(a.revisado_em)}</p>}
            </form>
          )}

          <section className="box stack" style={{ gap: 8 }}>
            <p className="sec-t" style={{ margin: 0 }}>Arquivos enviados</p>
            {a.arquivos.map((f) => (
              <button key={f.caminho} type="button" className="ia-arq" onClick={() => abrir(f.caminho)}>
                <span className="doc-ic">{f.mime === "application/pdf" ? "PDF" : "IMG"}</span>
                <span className="item-t"><strong style={{ fontWeight: 500 }}>{f.nome}</strong><small>{tamanho(f.tamanho)}</small></span>
              </button>
            ))}
            {a.obs && <p className="note" style={{ margin: "6px 0 0" }}><strong>Pediu atenção a:</strong> {a.obs}</p>}
          </section>

          {a.uso && (
            <p className="note" style={{ margin: 0 }}>
              {a.modelo} · {(a.uso.entrada ?? 0) + (a.uso.cache_lida ?? 0) + (a.uso.cache_criada ?? 0)} tokens lidos ({a.uso.cache_lida ?? 0} do cache) · {a.uso.saida ?? 0} escritos
            </p>
          )}
        </aside>
      </div>

      {p && <Impressao a={a} p={p} proj={proj} />}
    </>
  );
}

function Parecer({ p, nota }: { p: Parecer; nota: number | null }) {
  return (
    <>
      <section className="box stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <p className="sec-t" style={{ margin: 0 }}>Resumo</p>
          {nota !== null && <span className="row" style={{ gap: 8 }}><span className="note">Estética</span><Nota v={nota} grande /></span>}
        </div>
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{p.resumo}</p>
      </section>

      {!!p.correcoes_prioritarias?.length && (
        <section className="box stack">
          <p className="sec-t" style={{ margin: 0 }}>Correções prioritárias</p>
          <ol className="ia-ol">
            {p.correcoes_prioritarias.map((c, i) => (
              <li key={i}>
                <span className={c.gravidade === "alta" ? "pill inv" : c.gravidade === "media" ? "pill" : "pill dash"}>{GRAV[c.gravidade] ?? c.gravidade}</span>
                <span>{c.texto}{c.onde && <small className="note"> · {c.onde}</small>}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(p.camadas ?? []).map((c, i) => {
        const nc = (c.itens ?? []).filter((x) => x.status === "nao_conforme").length;
        const vf = (c.itens ?? []).filter((x) => x.status === "verificar").length;
        return (
          <section key={i} className="box stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <p className="mono" style={{ marginBottom: 4 }}>{CAMADA_NOME[c.camada] ?? c.camada}</p>
                <p className="sec-t" style={{ margin: 0 }}>{c.analista}</p>
              </div>
              {!!c.itens?.length && <span className="note">{nc} não conforme · {vf} verificar · {c.itens.length} itens</span>}
            </div>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{c.resumo}</p>

            {!!c.notas?.length && (
              <div className="ia-notas">
                {c.notas.map((n, j) => (
                  <div key={j} className="ia-nota-l">
                    <strong>{n.criterio}</strong>
                    <Nota v={n.nota} />
                    {n.comentario && <p className="note" style={{ margin: 0 }}>{n.comentario}</p>}
                  </div>
                ))}
              </div>
            )}

            {!!c.itens?.length && (
              <div className="tabela-w" style={{ boxShadow: "none" }}>
                <table className="tabela">
                  <thead><tr><th style={{ width: 130 }}>Status</th><th>Item</th><th>Comentário</th></tr></thead>
                  <tbody>
                    {[...c.itens]
                      .sort((x, y) => ORD[x.status] - ORD[y.status])
                      .map((it, j) => (
                        <tr key={j}>
                          <td><SeloItem s={it.status} /></td>
                          <td>{it.texto}</td>
                          <td className="note">{it.comentario}{it.onde && <><br /><em>{it.onde}</em></>}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {!!c.observacoes?.length && (
              <ul className="ia-ul">
                {c.observacoes.map((o, j) => <li key={j}>{o.texto}{o.onde && <small className="note"> · {o.onde}</small>}</li>)}
              </ul>
            )}
          </section>
        );
      })}

      {(!!p.pontos_fortes?.length || !!p.nao_verificado?.length || !!p.ignorados?.length) && (
        <section className="box grid2">
          {!!p.pontos_fortes?.length && (
            <div>
              <p className="sec-t">Pontos fortes</p>
              <ul className="ia-ul">{p.pontos_fortes.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {!!p.nao_verificado?.length && (
            <div>
              <p className="sec-t">Não verificado</p>
              <ul className="ia-ul">{p.nao_verificado.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {!!p.ignorados?.length && (
            <div>
              <p className="sec-t">Analistas sem conteúdo (não entraram)</p>
              <ul className="ia-ul">{p.ignorados.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
        </section>
      )}
    </>
  );
}

const ORD: Record<string, number> = { nao_conforme: 0, verificar: 1, conforme: 2, nao_se_aplica: 3 };

// Versão para imprimir: preto e branco, com o logo
function Impressao({ a, p, proj }: { a: Det; p: Parecer; proj: string | null }) {
  return (
    <article className="doc-prop" aria-hidden="true">
      <header className="doc-cab">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.png" alt="EZE" />
        <div>
          <strong>EZE ARQUITETURA E ENGENHARIA</strong>
          <span>Pré-análise de projeto · gerada por IA, sujeita à decisão do responsável</span>
        </div>
      </header>
      <h1>{a.titulo}</h1>
      <p className="doc-data">{[proj, a.etapa_sigla, a.cidade, dataHora(a.concluida_em || a.created_at)].filter(Boolean).join(" · ")}{a.nota !== null ? ` · Estética ${a.nota.toFixed(1).replace(".", ",")}` : ""}</p>
      {a.decisao && (
        <>
          <h2>Decisão do responsável</h2>
          <p className="doc-txt"><strong>{DECISAO_NOME[a.decisao]}</strong>{a.revisor?.nome ? ` · ${a.revisor.nome}` : ""}{a.parecer_final ? `\n${a.parecer_final}` : ""}</p>
        </>
      )}
      <h2>Resumo</h2>
      <p className="doc-txt">{p.resumo}</p>
      {!!p.correcoes_prioritarias?.length && (
        <>
          <h2>Correções prioritárias</h2>
          <ol>{p.correcoes_prioritarias.map((c, i) => <li key={i}>[{GRAV[c.gravidade] ?? c.gravidade}] {c.texto}{c.onde ? ` (${c.onde})` : ""}</li>)}</ol>
        </>
      )}
      {(p.camadas ?? []).map((c, i) => (
        <section key={i}>
          <h2>{CAMADA_NOME[c.camada] ?? c.camada} · {c.analista}</h2>
          <p className="doc-txt">{c.resumo}</p>
          {!!c.notas?.length && (
            <table className="doc-tab">
              <tbody>{c.notas.map((n, j) => <tr key={j}><th>{n.criterio} · {Number(n.nota).toFixed(1).replace(".", ",")}</th><td>{n.comentario}</td></tr>)}</tbody>
            </table>
          )}
          {!!c.itens?.length && (
            <table className="doc-tab">
              <tbody>
                {[...c.itens].sort((x, y) => ORD[x.status] - ORD[y.status]).map((it, j) => (
                  <tr key={j}><th>{ITEM_STATUS[it.status]}</th><td>{it.texto}{it.comentario ? ` — ${it.comentario}` : ""}{it.onde ? ` (${it.onde})` : ""}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
      {!!p.nao_verificado?.length && (
        <>
          <h2>Não verificado</h2>
          <ol>{p.nao_verificado.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </>
      )}
    </article>
  );
}
