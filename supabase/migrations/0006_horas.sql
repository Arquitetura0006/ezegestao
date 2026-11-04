-- EZE Gestão · 0006 · Horas e custo por projeto
-- Cronômetro por pessoa, valor/hora com histórico (só admin vê), custo gravado
-- em cada apontamento no momento do lançamento, e campos para importar o
-- histórico do Desker (inclusive de quem ainda não entrou no sistema).

alter table public.tarefas add column if not exists origem_desker text;
alter table public.clientes add column if not exists origem_desker text;

-- Histórico de horas (Desker) pode ser de quem ainda não tem conta
alter table public.apontamentos alter column perfil_id drop not null;
alter table public.apontamentos add column if not exists pessoa_nome text;
alter table public.apontamentos add column if not exists valor_hora numeric;
alter table public.apontamentos add column if not exists origem_desker text;
create unique index if not exists apont_desker on public.apontamentos (escritorio_id, origem_desker) where origem_desker is not null;

-- Valor/hora por pessoa, com vigência. Só administradores leem e editam.
create table if not exists public.valores_hora (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  valor numeric not null check (valor >= 0),
  desde date not null default current_date,
  created_at timestamptz not null default now(),
  unique (escritorio_id, perfil_id, desde)
);
alter table public.valores_hora enable row level security;
drop policy if exists vh_admin on public.valores_hora;
create policy vh_admin on public.valores_hora for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id));
grant select, insert, update, delete on public.valores_hora to authenticated;

-- Grava o valor/hora vigente em cada novo apontamento (custo histórico não muda
-- quando o valor da pessoa muda depois).
create or replace function public.apontamento_valor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.valor_hora is null and new.perfil_id is not null then
    select valor into new.valor_hora from valores_hora
     where escritorio_id = new.escritorio_id and perfil_id = new.perfil_id and desde <= new.data
     order by desde desc limit 1;
  end if;
  return new;
end $$;
drop trigger if exists apontamento_valor on public.apontamentos;
create trigger apontamento_valor before insert on public.apontamentos
  for each row execute function public.apontamento_valor();

-- Quem não é admin não vê nem altera o valor/hora gravado no apontamento
revoke select, update on public.apontamentos from authenticated;
grant select (id, escritorio_id, perfil_id, pessoa_nome, projeto_id, tarefa_id, data, minutos, nota, origem, origem_desker, created_at)
  on public.apontamentos to authenticated;
grant update (projeto_id, tarefa_id, data, minutos, nota) on public.apontamentos to authenticated;

-- Custo: visão só para administradores (roda com o dono da view; o filtro garante o acesso)
drop view if exists public.apontamentos_custo;
create view public.apontamentos_custo as
  select a.id, a.escritorio_id, a.perfil_id, a.pessoa_nome, a.projeto_id, a.tarefa_id, a.data, a.minutos,
         a.valor_hora, round(a.minutos / 60.0 * coalesce(a.valor_hora, 0), 2) as custo
  from public.apontamentos a
  where public.eh_admin(a.escritorio_id);
revoke all on public.apontamentos_custo from anon;
grant select on public.apontamentos_custo to authenticated;

-- Recalcula o custo de um período quando o valor/hora foi cadastrado depois
create or replace function public.recalcular_custo(esc uuid, de date, ate date) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not eh_admin(esc) then raise exception 'Sem permissão'; end if;
  -- valor vigente na data; para horas anteriores ao primeiro valor cadastrado, usa o primeiro
  update apontamentos a set valor_hora = coalesce(
    (select v.valor from valores_hora v
      where v.escritorio_id = a.escritorio_id and v.perfil_id = a.perfil_id and v.desde <= a.data
      order by v.desde desc limit 1),
    (select v.valor from valores_hora v
      where v.escritorio_id = a.escritorio_id and v.perfil_id = a.perfil_id
      order by v.desde asc limit 1))
  where a.escritorio_id = esc and a.data between de and ate and a.perfil_id is not null;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.recalcular_custo(uuid, date, date) to authenticated;

-- =========================================================
-- Cronômetro: um por pessoa. Parar vira apontamento.
-- =========================================================
create table if not exists public.cronometros (
  perfil_id uuid primary key default auth.uid() references public.perfis(id) on delete cascade,
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  projeto_id uuid references public.projetos(id) on delete cascade,
  tarefa_id uuid references public.tarefas(id) on delete set null,
  nota text,
  inicio timestamptz not null default now()
);
alter table public.cronometros enable row level security;
drop policy if exists cr_proprio on public.cronometros;
create policy cr_proprio on public.cronometros for all to authenticated
  using (perfil_id = auth.uid() and eh_membro(escritorio_id))
  with check (perfil_id = auth.uid() and eh_membro(escritorio_id) and (projeto_id is null or eh_admin(escritorio_id) or eh_do_projeto(projeto_id)));
drop policy if exists cr_admin_ler on public.cronometros;
create policy cr_admin_ler on public.cronometros for select to authenticated using (eh_admin(escritorio_id));
grant select, insert, update, delete on public.cronometros to authenticated;

-- Para o cronômetro da pessoa e grava o tempo (máx. 24h por registro; acima disso divide por dia)
create or replace function public.parar_cronometro() returns int
language plpgsql security invoker set search_path = public as $$
declare
  c cronometros;
  ini timestamptz;
  fim timestamptz := now();
  corte timestamptz;
  min int;
  total int := 0;
begin
  select * into c from cronometros where perfil_id = auth.uid();
  if c.perfil_id is null then return 0; end if;
  ini := c.inicio;
  while ini < fim loop
    corte := least(fim, date_trunc('day', ini at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '1 day');
    min := ceil(extract(epoch from (corte - ini)) / 60.0);
    if min >= 1 then
      insert into apontamentos (escritorio_id, perfil_id, projeto_id, tarefa_id, data, minutos, nota, origem)
        values (c.escritorio_id, c.perfil_id, c.projeto_id, c.tarefa_id, (ini at time zone 'America/Sao_Paulo')::date, least(min, 1440), c.nota, 'cronometro');
      total := total + least(min, 1440);
    end if;
    ini := corte;
  end loop;
  delete from cronometros where perfil_id = c.perfil_id;
  return total;
end $$;
grant execute on function public.parar_cronometro() to authenticated;

-- =========================================================
-- Resumos (somas no banco; a API devolve no máximo 1000 linhas)
-- =========================================================
-- Horas de um projeto por tarefa e pessoa. Custo só para admin.
create or replace function public.horas_projeto(proj uuid)
returns table (tarefa_id uuid, perfil_id uuid, pessoa text, minutos bigint, custo numeric)
language plpgsql stable security definer set search_path = public as $$
declare esc uuid; adm boolean;
begin
  select escritorio_id into esc from projetos where id = proj;
  adm := eh_admin(esc);
  if not (adm or eh_do_projeto(proj)) then raise exception 'Sem permissão'; end if;
  return query
    select a.tarefa_id, a.perfil_id, coalesce(pf.nome, a.pessoa_nome), sum(a.minutos)::bigint,
           case when adm then round(sum(a.minutos / 60.0 * coalesce(a.valor_hora, 0)), 2) end
    from apontamentos a left join perfis pf on pf.id = a.perfil_id
    where a.projeto_id = proj
    group by a.tarefa_id, a.perfil_id, coalesce(pf.nome, a.pessoa_nome);
end $$;
grant execute on function public.horas_projeto(uuid) to authenticated;

-- Horas do escritório num período por projeto e pessoa (admin)
create or replace function public.horas_periodo(esc uuid, de date, ate date)
returns table (projeto_id uuid, perfil_id uuid, pessoa text, minutos bigint, custo numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not eh_admin(esc) then raise exception 'Sem permissão'; end if;
  return query
    select a.projeto_id, a.perfil_id, coalesce(pf.nome, a.pessoa_nome), sum(a.minutos)::bigint,
           round(sum(a.minutos / 60.0 * coalesce(a.valor_hora, 0)), 2)
    from apontamentos a left join perfis pf on pf.id = a.perfil_id
    where a.escritorio_id = esc and a.data between de and ate
    group by a.projeto_id, a.perfil_id, coalesce(pf.nome, a.pessoa_nome);
end $$;
grant execute on function public.horas_periodo(uuid, date, date) to authenticated;

-- Custo total de todos os projetos (admin), para margem
create or replace function public.custo_projetos(esc uuid)
returns table (projeto_id uuid, minutos bigint, custo numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not eh_admin(esc) then raise exception 'Sem permissão'; end if;
  return query
    select a.projeto_id, sum(a.minutos)::bigint, round(sum(a.minutos / 60.0 * coalesce(a.valor_hora, 0)), 2)
    from apontamentos a where a.escritorio_id = esc and a.projeto_id is not null
    group by a.projeto_id;
end $$;
grant execute on function public.custo_projetos(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.cronometros;
exception when duplicate_object then null; end $$;

select 'ok' as resultado;
