-- EZE Gestão · 0003 · operação real: chamadas entre pessoas, convites para quem já tem conta,
-- conclusão de aula com credenciamento automático e link da chamada para o visitante.

-- =========================================================
-- Chamadas ("Chamar" alguém para uma sala)
-- =========================================================
create table if not exists public.chamados (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  de uuid not null references public.perfis(id) on delete cascade,
  para uuid not null references public.perfis(id) on delete cascade,
  ambiente_id uuid references public.ambientes(id) on delete set null,
  status text not null default 'pendente' check (status in ('pendente','aceito','recusado','cancelado')),
  created_at timestamptz not null default now()
);
create index if not exists chamados_para on public.chamados (para, status);

alter table public.chamados enable row level security;
drop policy if exists cham_ler on public.chamados;
create policy cham_ler on public.chamados for select to authenticated
  using ((de = auth.uid() or para = auth.uid()) and eh_membro(escritorio_id));
drop policy if exists cham_criar on public.chamados;
create policy cham_criar on public.chamados for insert to authenticated
  with check (de = auth.uid() and eh_membro(escritorio_id));
drop policy if exists cham_responder on public.chamados;
create policy cham_responder on public.chamados for update to authenticated
  using ((de = auth.uid() or para = auth.uid()) and eh_membro(escritorio_id))
  with check ((de = auth.uid() or para = auth.uid()) and eh_membro(escritorio_id));
grant select, insert, update on public.chamados to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.chamados;
exception when duplicate_object then null; end $$;

-- =========================================================
-- Convites para quem já tinha conta (o gatilho só roda no cadastro)
-- =========================================================
create or replace function public.aplicar_convites() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; em text;
begin
  select lower(email) into em from auth.users where id = auth.uid();
  if em is null then return 0; end if;
  insert into perfis (id, email) values (auth.uid(), em) on conflict (id) do nothing;
  insert into membros (escritorio_id, perfil_id, papel)
  select c.escritorio_id, auth.uid(), c.papel from convites c
  where lower(c.email) = em and c.aceito_em is null
  on conflict (escritorio_id, perfil_id) do update set ativo = true, papel = excluded.papel;
  get diagnostics n = row_count;
  update convites set aceito_em = now() where lower(email) = em and aceito_em is null;
  return n;
end $$;
grant execute on function public.aplicar_convites() to authenticated;

-- =========================================================
-- Concluir aula: marca o progresso e credencia quando a trilha fecha
-- =========================================================
create or replace function public.concluir_aula(p_aula uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare a record; total int; feitas int;
begin
  select id, trilha_id, escritorio_id into a from aulas where id = p_aula;
  if a.id is null or not eh_membro(a.escritorio_id) then raise exception 'Aula não encontrada'; end if;

  insert into progresso_aula (perfil_id, aula_id, escritorio_id, video_pct, concluida_em)
  values (auth.uid(), a.id, a.escritorio_id, 100, now())
  on conflict (perfil_id, aula_id) do update set concluida_em = coalesce(progresso_aula.concluida_em, now()), video_pct = 100;

  select count(*) into total from aulas where trilha_id = a.trilha_id and publicada;
  select count(*) into feitas from aulas au join progresso_aula p on p.aula_id = au.id and p.perfil_id = auth.uid()
   where au.trilha_id = a.trilha_id and au.publicada and p.concluida_em is not null;

  if total > 0 and feitas >= total then
    insert into credenciamentos (perfil_id, trilha_id, escritorio_id) values (auth.uid(), a.trilha_id, a.escritorio_id)
    on conflict do nothing;
    return true;
  end if;
  return false;
end $$;
grant execute on function public.concluir_aula(uuid) to authenticated;

-- =========================================================
-- Visitante: devolve também o link da chamada da sala de reunião
-- =========================================================
drop function if exists public.ver_visita(uuid);
create function public.ver_visita(p_token uuid)
returns table (id uuid, nome text, assunto text, status status_visita, ambiente text, link text, chamados jsonb)
language sql stable security definer set search_path = public as $$
  select v.id, v.nome, v.assunto, v.status, a.nome, a.link_chamada,
         coalesce((select jsonb_agg(jsonb_build_object('nome', p.nome, 'foto', p.foto_url))
                   from perfis p where p.id = any(v.chamados)), '[]'::jsonb)
  from visitas v left join ambientes a on a.id = v.ambiente_id
  where v.token = p_token and v.created_at > now() - interval '12 hours';
$$;
grant execute on function public.ver_visita(uuid) to anon, authenticated;

-- Membros podem ver o próprio vínculo mesmo antes de qualquer outra leitura
drop policy if exists membros_proprio on public.membros;
create policy membros_proprio on public.membros for select to authenticated using (perfil_id = auth.uid());

select 'ok' as resultado;
