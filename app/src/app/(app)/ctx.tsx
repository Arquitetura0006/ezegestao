"use client";

import { createContext, useContext } from "react";
import type { Papel } from "@/lib/util";
import { podeCom, type Modulo, type Permissoes } from "@/lib/permissoes";

export type Eu = { id: string; nome: string; email: string; foto: string | null; cidade: string | null };
export type Esc = { id: string; nome: string; slug: string };
export type Ctx = { eu: Eu; esc: Esc; papel: Papel; admin: boolean; financeiro: boolean; acessoFin: boolean; perm: Permissoes };

export const Contexto = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(Contexto);
  if (!c) throw new Error("Fora do escritório");
  return c;
}

// Pode ver (ou editar) um módulo. Dono e Administrador podem tudo, menos o
// financeiro, que tem permissão própria.
export function usePode(m: Modulo, editar = false): boolean {
  const c = useApp();
  return podeCom(c.papel, c.acessoFin, c.perm, m, editar);
}
