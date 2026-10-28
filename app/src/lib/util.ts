// Utilidades compartilhadas pelas telas internas.

export const MODELO_URL = "https://arquitetura0006.github.io/ezegestao/";

export type Papel = "dono" | "admin" | "partner" | "recepcao";
export const PAPEL: Record<Papel, string> = { dono: "Dono", admin: "Administrador", partner: "Partner", recepcao: "Recepção" };

export type Status = "disp" | "foco" | "reun" | "ausente";
export const STATUS: Record<Status, string> = { disp: "Disponível", foco: "Foco", reun: "Em reunião", ausente: "Ausente" };

export const iniciais = (n?: string | null) =>
  (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export const primeiroNome = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "";

// Converte links de YouTube, Vimeo, Google Drive e Loom em endereço de incorporação.
export function videoEmbed(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const h = u.hostname.replace(/^www\./, "");
    if (h === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (h.endsWith("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) return u.toString();
      if (u.pathname.startsWith("/shorts/")) return `https://www.youtube.com/embed/${u.pathname.split("/")[2]}`;
      const v = u.searchParams.get("v");
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }
    if (h === "vimeo.com") return `https://player.vimeo.com/video/${u.pathname.split("/").filter(Boolean)[0]}`;
    if (h === "player.vimeo.com") return u.toString();
    if (h === "drive.google.com") {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      const id = m?.[1] || u.searchParams.get("id");
      return id ? `https://drive.google.com/file/d/${id}/preview` : null;
    }
    if (h.endsWith("loom.com")) return `https://www.loom.com/embed/${u.pathname.split("/").filter(Boolean).pop()}`;
    return null;
  } catch {
    return null;
  }
}

export const FASES = ["Estudo preliminar", "Anteprojeto", "Projeto de aprovação", "Projeto executivo", "Detalhamento", "Compatibilização", "Acompanhamento de obra"];

export const dataCurta = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "";

export const dataHora = (d?: string | null) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

export const erroMsg = (e: unknown) =>
  (e as { message?: string })?.message || "Não foi possível salvar. Tente de novo.";
