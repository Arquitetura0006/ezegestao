"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import { useApp } from "./ctx";

// Quem está com o sistema aberto agora (em qualquer tela). A posição na planta fica na tabela "presenca".
const OnlineCtx = createContext<Set<string>>(new Set());
export const useOnline = () => useContext(OnlineCtx);

export function OnlineProvider({ children }: { children: React.ReactNode }) {
  const { eu, esc } = useApp();
  const supabase = useMemo(() => supabaseNavegador(), []);
  const [on, setOn] = useState<Set<string>>(new Set([eu.id]));

  useEffect(() => {
    const canal = supabase.channel(`online-${esc.id}`, { config: { presence: { key: eu.id } } });
    canal
      .on("presence", { event: "sync" }, () => {
        setOn(new Set([eu.id, ...Object.keys(canal.presenceState())]));
      })
      .subscribe(async (s) => {
        if (s === "SUBSCRIBED") await canal.track({ em: new Date().toISOString() });
      });
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, eu.id, esc.id]);

  return <OnlineCtx.Provider value={on}>{children}</OnlineCtx.Provider>;
}
