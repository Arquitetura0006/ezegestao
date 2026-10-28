"use client";

import { createContext, useContext } from "react";
import type { Papel } from "@/lib/util";

export type Eu = { id: string; nome: string; email: string; foto: string | null; cidade: string | null };
export type Esc = { id: string; nome: string; slug: string };
export type Ctx = { eu: Eu; esc: Esc; papel: Papel; admin: boolean };

export const Contexto = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(Contexto);
  if (!c) throw new Error("Fora do escritório");
  return c;
}
