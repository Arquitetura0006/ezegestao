import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseServidor() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(lista) {
          try {
            lista.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Chamado de um Server Component: o middleware renova a sessão.
          }
        },
      },
    }
  );
}

export const ESCRITORIO = process.env.NEXT_PUBLIC_ESCRITORIO || "eze";
