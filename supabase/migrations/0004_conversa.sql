-- EZE Gestão · 0004 · conversa de texto da sala (canal geral da equipe)
create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  autor_id uuid not null references public.perfis(id) on delete cascade,
  texto text not null check (length(texto) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists mensagens_esc_data on public.mensagens (escritorio_id, created_at desc);

alter table public.mensagens enable row level security;
drop policy if exists msg_ler on public.mensagens;
create policy msg_ler on public.mensagens for select to authenticated using (eh_membro(escritorio_id));
drop policy if exists msg_criar on public.mensagens;
create policy msg_criar on public.mensagens for insert to authenticated with check (autor_id = auth.uid() and eh_membro(escritorio_id));
drop policy if exists msg_apagar on public.mensagens;
create policy msg_apagar on public.mensagens for delete to authenticated using (autor_id = auth.uid() or eh_admin(escritorio_id));
grant select, insert, delete on public.mensagens to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.mensagens;
exception when duplicate_object then null; end $$;

select 'ok' as resultado;
