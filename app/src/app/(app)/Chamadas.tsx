"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "./ctx";
import { Avatar } from "./ui";
import { primeiroNome } from "@/lib/util";

type Chamado = { id: string; de: string; para: string; ambiente_id: string | null; status: string };
type Info = { nome: string; foto: string | null; sala: string; link: string | null };

// Toque curto, sem arquivo de som.
function tocar() {
  try {
    const A = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new A();
    [0, 0.22].forEach((t) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ac.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.15, ac.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + 0.18);
      o.connect(g).connect(ac.destination);
      o.start(ac.currentTime + t);
      o.stop(ac.currentTime + t + 0.2);
    });
  } catch {}
}

export default function Chamadas() {
  const { eu, esc, papel } = useApp();
  const atende = papel !== "partner";
  const supabase = useMemo(() => supabaseNavegador(), []);
  const router = useRouter();
  const [rec, setRec] = useState<(Chamado & Info) | null>(null);
  const [visita, setVisita] = useState("");
  const [aviso, setAviso] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    async function info(c: Chamado, quem: string): Promise<Info> {
      const [{ data: p }, { data: a }] = await Promise.all([
        supabase.from("perfis").select("nome,foto_url").eq("id", quem).maybeSingle(),
        c.ambiente_id ? supabase.from("ambientes").select("nome,link_chamada").eq("id", c.ambiente_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      return { nome: p?.nome || "Alguém", foto: p?.foto_url ?? null, sala: a?.nome || "uma sala", link: a?.link_chamada ?? null };
    }
    function mostrar(t: string) {
      setAviso(t);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setAviso(""), 6000);
    }

    // Chamadas pendentes ao abrir (ex.: recebida enquanto trocava de tela)
    supabase
      .from("chamados")
      .select("id,de,para,ambiente_id,status,created_at")
      .eq("para", eu.id)
      .eq("status", "pendente")
      .gt("created_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .then(async ({ data }) => {
        if (data?.[0]) setRec({ ...(data[0] as Chamado), ...(await info(data[0] as Chamado, data[0].de)) });
      });

    const canal = supabase
      .channel(`chamados-${eu.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chamados", filter: `para=eq.${eu.id}` }, async (m) => {
        const c = m.new as Chamado;
        if (c.status !== "pendente") return;
        tocar();
        setRec({ ...c, ...(await info(c, c.de)) });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chamados", filter: `de=eq.${eu.id}` }, async (m) => {
        const c = m.new as Chamado;
        const i = await info(c, c.para);
        if (c.status === "aceito") mostrar(`${primeiroNome(i.nome)} aceitou e está indo para ${i.sala}.`);
        if (c.status === "recusado") mostrar(`${primeiroNome(i.nome)} não pode agora. Deixe um recado.`);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chamados", filter: `para=eq.${eu.id}` }, (m) => {
        const c = m.new as Chamado;
        if (c.status === "cancelado") setRec((r) => (r?.id === c.id ? null : r));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "visitas", filter: `escritorio_id=eq.${esc.id}` }, (m) => {
        const v = m.new as { nome: string; status: string };
        const o = m.old as { status?: string };
        if (atende && v.status === "chamando" && o.status !== "chamando") {
          tocar();
          setVisita(v.nome);
        }
        if (v.status !== "chamando") setVisita((x) => (x === v.nome ? "" : x));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
      clearTimeout(timer.current);
    };
  }, [supabase, eu.id, esc.id, atende]);

  async function responder(aceitar: boolean) {
    if (!rec) return;
    const c = rec;
    setRec(null);
    await supabase.from("chamados").update({ status: aceitar ? "aceito" : "recusado" }).eq("id", c.id);
    if (aceitar) {
      if (c.ambiente_id) {
        await supabase
          .from("presenca")
          .upsert({ perfil_id: eu.id, escritorio_id: esc.id, ambiente_id: c.ambiente_id, status: "reun", atualizado_em: new Date().toISOString() });
      }
      if (c.link) window.open(c.link, "_blank", "noopener");
      router.push("/sala");
    }
  }

  return (
    <>
      {rec && (
        <div className="chamada" role="alertdialog" aria-labelledby="ch-t">
          <Avatar nome={rec.nome} foto={rec.foto} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p id="ch-t" style={{ margin: 0, fontWeight: 700 }}>{rec.nome} está chamando</p>
            <p className="note" style={{ margin: "2px 0 0" }}>Para {rec.sala}{rec.link ? "" : " (sem link de chamada configurado)"}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn small" type="button" onClick={() => responder(false)}>Agora não</button>
            <button className="btn small dark" type="button" onClick={() => responder(true)}>Atender</button>
          </div>
        </div>
      )}
      {visita && !rec && (
        <div className="chamada" role="alertdialog" aria-labelledby="vi-t">
          <span className="avt" style={{ width: 52, height: 52, fontSize: 18 }}>{visita.trim()[0]?.toUpperCase()}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p id="vi-t" style={{ margin: 0, fontWeight: 700 }}>{visita} está na recepção</p>
            <p className="note" style={{ margin: "2px 0 0" }}>Cliente chamando a recepção</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn small" type="button" onClick={() => setVisita("")}>Fechar</button>
            <button className="btn small dark" type="button" onClick={() => { setVisita(""); router.push("/sala#recepcao"); }}>Atender</button>
          </div>
        </div>
      )}
      {aviso && (
        <div className="toast" role="status">
          {aviso}
        </div>
      )}
    </>
  );
}
