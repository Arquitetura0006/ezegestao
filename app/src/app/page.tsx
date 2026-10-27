import { redirect } from "next/navigation";
import { supabaseServidor, ESCRITORIO } from "@/lib/supabase/server";
import Entrada, { type Capa } from "./Entrada";

export const dynamic = "force-dynamic";

const PADRAO: Capa = {
  nome: "EZE Arquitetura e Gestão",
  tempo: 9,
  aleatorio: true,
  pb: true,
  imagens: [
    { url: "/capa-1.webp", mobile: "/capa-1-m.webp", x: 42, xm: 46 },
    { url: "/capa-2.webp", mobile: "/capa-2-m.webp", x: 26, xm: 26 },
    { url: "/capa-3.webp", mobile: "/capa-3-m.webp", x: 38, xm: 62 },
    { url: "/capa-4.webp", mobile: "/capa-4-m.webp", x: 40, xm: 66 },
  ],
};

export default async function Pagina() {
  const supabase = supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/inicio");

  let capa = PADRAO;
  const { data } = await supabase.rpc("capa_publica", { esc_slug: ESCRITORIO });
  const linha = Array.isArray(data) ? data[0] : null;
  if (linha) {
    const cfg = (linha.config?.capa ?? {}) as Partial<Capa>;
    const imgs = (linha.imagens ?? []) as { url: string; x: number; xm: number }[];
    capa = {
      nome: linha.nome,
      tempo: cfg.tempo ?? PADRAO.tempo,
      aleatorio: cfg.aleatorio ?? PADRAO.aleatorio,
      pb: cfg.pb ?? PADRAO.pb,
      imagens: imgs.length ? imgs.map((i) => ({ url: i.url, mobile: i.url, x: i.x, xm: i.xm })) : PADRAO.imagens,
    };
  }
  return <Entrada capa={capa} escritorio={ESCRITORIO} />;
}
