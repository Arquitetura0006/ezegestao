-- EZE Gestão · 0007 · Comercial
-- Propostas com funil (estudo → aberta → pendente → aprovada/recusada), histórico de
-- atividades, forma de pagamento, etapas incluídas e aprovação que cria o projeto.
-- Só administradores acessam o comercial.

create table if not exists public.proposta_codigos (
  escritorio_id uuid primary key references public.escritorios(id) on delete cascade,
  ultimo int not null default 0
);

create table if not exists public.propostas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  codigo int,
  nome text not null,
  tipologia text,
  cliente_id uuid references public.clientes(id) on delete set null,
  contato text,                      -- quem pediu (corretor, imobiliária, parceiro)
  cidade text,
  endereco text,
  area_m2 numeric,
  valor numeric,
  status text not null default 'aberta' check (status in ('estudo','aberta','pendente','aprovada','recusada')),
  probabilidade int check (probabilidade between 0 and 100),
  motivo_perda text,
  escopo text,
  etapas text[] not null default '{}',   -- siglas do processo EZE incluídas
  prazo text,                            -- ex.: "Anteprojeto em 30 dias após o levantamento"
  validade date,
  forma_pagamento text,
  parcelas jsonb not null default '[]',  -- [{descricao, percentual, valor, quando}]
  observacoes text,
  proxima_acao text,
  proxima_data date,
  responsavel_id uuid references public.perfis(id) on delete set null,
  projeto_id uuid references public.projetos(id) on delete set null,
  enviada_em date,
  decidida_em date,
  origem_desker text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists propostas_codigo on public.propostas (escritorio_id, codigo) where codigo is not null;
create unique index if not exists propostas_desker on public.propostas (escritorio_id, origem_desker) where origem_desker is not null;
create index if not exists propostas_status on public.propostas (escritorio_id, status);

create table if not exists public.proposta_atividades (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  proposta_id uuid not null references public.propostas(id) on delete cascade,
  autor_id uuid references public.perfis(id) on delete set null,
  tipo text not null default 'nota' check (tipo in ('nota','ligacao','reuniao','email','whatsapp','visita','status')),
  texto text not null,
  created_at timestamptz not null default now()
);
create index if not exists prop_ativ on public.proposta_atividades (proposta_id, created_at desc);

-- Código sequencial próprio do comercial
create or replace function public.proposta_codigo() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.codigo is null then
    insert into proposta_codigos (escritorio_id, ultimo) values (new.escritorio_id, 0) on conflict (escritorio_id) do nothing;
    update proposta_codigos
       set ultimo = greatest(ultimo, (select coalesce(max(codigo), 0) from propostas where escritorio_id = new.escritorio_id)) + 1
     where escritorio_id = new.escritorio_id
     returning ultimo into n;
    new.codigo := n;
  end if;
  return new;
end $$;
drop trigger if exists proposta_codigo on public.propostas;
create trigger proposta_codigo before insert on public.propostas for each row execute function public.proposta_codigo();

-- Carimbo e histórico de mudança de status
create or replace function public.proposta_carimbo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status in ('aprovada','recusada') and new.decidida_em is null then new.decidida_em := current_date; end if;
    if new.status in ('aberta','pendente') and old.status = 'estudo' and new.enviada_em is null then new.enviada_em := current_date; end if;
    insert into proposta_atividades (escritorio_id, proposta_id, autor_id, tipo, texto)
      values (new.escritorio_id, new.id, auth.uid(), 'status',
        'Status: ' || old.status || ' → ' || new.status || coalesce(' · ' || nullif(new.motivo_perda, ''), ''));
  end if;
  return new;
end $$;
drop trigger if exists proposta_carimbo on public.propostas;
create trigger proposta_carimbo before insert or update on public.propostas for each row execute function public.proposta_carimbo();

-- Aprovar: cria o projeto com os dados da proposta e o processo EZE das etapas incluídas
create or replace function public.aprovar_proposta(prop uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare p propostas; proj uuid;
begin
  select * into p from propostas where id = prop;
  if p.id is null or not eh_admin(p.escritorio_id) then raise exception 'Sem permissão'; end if;
  proj := p.projeto_id;
  if proj is null then
    insert into projetos (escritorio_id, nome, tipologia, cliente_id, cidade, endereco, area_m2, valor, status, escopo, inicio)
      values (p.escritorio_id, p.nome, p.tipologia, p.cliente_id, p.cidade, p.endereco, p.area_m2, p.valor, 'andamento', p.escopo, current_date)
      returning id into proj;
    perform aplicar_modelo(proj, case when cardinality(p.etapas) > 0 then p.etapas end);
    if p.responsavel_id is not null then
      insert into projeto_membros (projeto_id, perfil_id, escritorio_id) values (proj, p.responsavel_id, p.escritorio_id) on conflict do nothing;
      update projetos set coordenador_id = p.responsavel_id where id = proj;
    end if;
  end if;
  update propostas set status = 'aprovada', projeto_id = proj, probabilidade = 100 where id = prop;
  return proj;
end $$;
grant execute on function public.aprovar_proposta(uuid) to authenticated;

-- Segurança: só administradores
alter table public.propostas enable row level security;
alter table public.proposta_atividades enable row level security;
alter table public.proposta_codigos enable row level security;
drop policy if exists prop_admin on public.propostas;
create policy prop_admin on public.propostas for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id));
drop policy if exists pativ_admin on public.proposta_atividades;
create policy pativ_admin on public.proposta_atividades for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id));
grant select, insert, update, delete on public.propostas, public.proposta_atividades to authenticated;

select 'ok' as resultado;
