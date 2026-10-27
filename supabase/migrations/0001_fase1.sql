-- EZE Gestão · Fase 1
-- Multiescritório: todo dado pertence a um escritório (escritorio_id).
-- Segurança: RLS em todas as tabelas; acesso só para membros do escritório.
-- Presença guarda apenas o estado atual (sem histórico de horário), por decisão de projeto.

create extension if not exists pgcrypto;

-- =========================================================
-- Tipos
-- =========================================================
do $$ begin
  create type papel_membro as enum ('dono','admin','partner','recepcao');
exception when duplicate_object then null; end $$;
do $$ begin
  create type status_presenca as enum ('disp','foco','reun','ausente');
exception when duplicate_object then null; end $$;
do $$ begin
  create type status_visita as enum ('aguardando','chamando','atendido','reuniao','encerrada');
exception when duplicate_object then null; end $$;

-- =========================================================
-- Escritórios, perfis e membros
-- =========================================================
create table if not exists public.escritorios (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  plano text not null default 'interno',
  status text not null default 'ativo' check (status in ('teste','ativo','suspenso','cancelado')),
  logo_url text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  foto_url text,
  cidade text,
  fuso text default 'America/Sao_Paulo',
  created_at timestamptz not null default now()
);

create table if not exists public.membros (
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  papel papel_membro not null default 'partner',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (escritorio_id, perfil_id)
);

-- Convites: o admin cadastra o e-mail; no primeiro login a pessoa entra no escritório.
create table if not exists public.convites (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  email text not null,
  papel papel_membro not null default 'partner',
  created_at timestamptz not null default now(),
  aceito_em timestamptz,
  unique (escritorio_id, email)
);

-- =========================================================
-- Funções de permissão (security definer para não recursar no RLS)
-- =========================================================
create or replace function public.eh_membro(esc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from membros where escritorio_id = esc and perfil_id = auth.uid() and ativo);
$$;

create or replace function public.eh_admin(esc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from membros where escritorio_id = esc and perfil_id = auth.uid() and ativo and papel in ('dono','admin'));
$$;


-- Cria o perfil e aplica convites pendentes quando alguém se cadastra
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome, email, foto_url)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          new.email,
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;

  insert into membros (escritorio_id, perfil_id, papel)
  select c.escritorio_id, new.id, c.papel from convites c
  where lower(c.email) = lower(new.email) and c.aceito_em is null
  on conflict do nothing;

  update convites set aceito_em = now() where lower(email) = lower(new.email) and aceito_em is null;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_usuario();

-- =========================================================
-- Padrões: habilidades, trilhas, aulas, progresso, manual
-- =========================================================
create table if not exists public.habilidades (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text not null,
  ordem int not null default 0
);

create table if not exists public.trilhas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  habilidade_id uuid references public.habilidades(id) on delete set null,
  titulo text not null,
  descricao text,
  ordem int not null default 0,
  publicada boolean not null default false,
  created_at timestamptz not null default now()
);

-- blocos: [{tipo:'video'|'texto'|'imagem'|'arquivo'|'quiz'|'check'|'ex', ...}]
create table if not exists public.aulas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  trilha_id uuid not null references public.trilhas(id) on delete cascade,
  titulo text not null,
  ordem int not null default 0,
  blocos jsonb not null default '[]'::jsonb,
  publicada boolean not null default false,
  atualizada_em timestamptz not null default now()
);

create table if not exists public.progresso_aula (
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  aula_id uuid not null references public.aulas(id) on delete cascade,
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  video_pct int not null default 0 check (video_pct between 0 and 100),
  resposta jsonb,
  notas text,
  concluida_em timestamptz,
  primary key (perfil_id, aula_id)
);

create table if not exists public.credenciamentos (
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  trilha_id uuid not null references public.trilhas(id) on delete cascade,
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  concedido_em timestamptz not null default now(),
  primary key (perfil_id, trilha_id)
);

create table if not exists public.manual_docs (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  categoria text not null,
  titulo text not null,
  corpo text not null default '',
  ordem int not null default 0,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.duvidas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  aula_id uuid not null references public.aulas(id) on delete cascade,
  autor_id uuid not null references public.perfis(id) on delete cascade,
  texto text not null,
  resposta text,
  respondida_por uuid references public.perfis(id),
  faq boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================================================
-- Mural
-- =========================================================
create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  titulo text not null,
  texto text not null default '',
  autor_id uuid references public.perfis(id),
  created_at timestamptz not null default now()
);

create table if not exists public.avisos_leitura (
  aviso_id uuid not null references public.avisos(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  lido_em timestamptz not null default now(),
  primary key (aviso_id, perfil_id)
);

-- =========================================================
-- Sala virtual
-- =========================================================
create table if not exists public.ambientes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  chave text not null,
  nome text not null,
  tipo text not null default 'sala' check (tipo in ('sala','reuniao','recepcao','jardim','projetos')),
  link_chamada text,
  grade text,            -- posição na planta (CSS grid-area)
  ordem int not null default 0,
  unique (escritorio_id, chave)
);

-- Só o estado atual de cada pessoa. Sem histórico.
create table if not exists public.presenca (
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  ambiente_id uuid references public.ambientes(id) on delete set null,
  status status_presenca not null default 'disp',
  atualizado_em timestamptz not null default now(),
  primary key (perfil_id, escritorio_id)
);

-- =========================================================
-- Projetos
-- =========================================================
create table if not exists public.projetos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text not null,
  fase text,
  habilidade_id uuid references public.habilidades(id) on delete set null,
  prazo date,
  ativo boolean not null default true,
  pasta_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.projeto_membros (
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  primary key (projeto_id, perfil_id)
);

create or replace function public.eh_do_projeto(proj uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from projeto_membros where projeto_id = proj and perfil_id = auth.uid());
$$;

create table if not exists public.recados (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  autor_id uuid not null references public.perfis(id) on delete cascade,
  texto text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reunioes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  ambiente_id uuid references public.ambientes(id) on delete set null,
  projeto_id uuid references public.projetos(id) on delete set null,
  iniciada_por uuid references public.perfis(id),
  iniciada_em timestamptz not null default now(),
  encerrada_em timestamptz
);

-- =========================================================
-- Recepção (clientes sem conta usam um token secreto)
-- =========================================================
create table if not exists public.visitas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  nome text not null,
  assunto text,
  email text,
  status status_visita not null default 'aguardando',
  atendente_id uuid references public.perfis(id),
  ambiente_id uuid references public.ambientes(id),
  chamados uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create or replace function public.criar_visita(esc_slug text, p_nome text, p_assunto text)
returns table (id uuid, token uuid)
language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  select escritorios.id into e from escritorios where slug = esc_slug and status in ('teste','ativo');
  if e is null then raise exception 'Escritório não encontrado'; end if;
  if coalesce(trim(p_nome),'') = '' then raise exception 'Informe o nome'; end if;
  return query
    insert into visitas (escritorio_id, nome, assunto)
    values (e, left(trim(p_nome),80), left(trim(coalesce(p_assunto,'')),120))
    returning visitas.id, visitas.token;
end $$;

create or replace function public.ver_visita(p_token uuid)
returns table (id uuid, nome text, assunto text, status status_visita, ambiente text, chamados jsonb)
language sql stable security definer set search_path = public as $$
  select v.id, v.nome, v.assunto, v.status, a.nome,
         coalesce((select jsonb_agg(jsonb_build_object('nome', p.nome, 'foto', p.foto_url))
                   from perfis p where p.id = any(v.chamados)), '[]'::jsonb)
  from visitas v left join ambientes a on a.id = v.ambiente_id
  where v.token = p_token and v.created_at > now() - interval '12 hours';
$$;

create or replace function public.visita_acao(p_token uuid, p_acao text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_acao = 'chamar' then
    update visitas set status = 'chamando', atualizada_em = now() where token = p_token and status = 'aguardando';
  elsif p_acao = 'cancelar' then
    update visitas set status = 'aguardando', atualizada_em = now() where token = p_token and status = 'chamando';
  elsif p_acao = 'sair' then
    update visitas set status = 'encerrada', atualizada_em = now() where token = p_token;
  else
    raise exception 'Ação inválida';
  end if;
end $$;

-- =========================================================
-- Imagens da capa
-- =========================================================
create table if not exists public.capa_imagens (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  url text not null,
  pos_desktop int not null default 50,
  pos_mobile int not null default 50,
  ordem int not null default 0
);

-- Capa pública (página de entrada não exige login)
create or replace function public.capa_publica(esc_slug text)
returns table (nome text, logo_url text, config jsonb, imagens jsonb)
language sql stable security definer set search_path = public as $$
  select e.nome, e.logo_url, e.config,
         coalesce((select jsonb_agg(jsonb_build_object('url', c.url, 'x', c.pos_desktop, 'xm', c.pos_mobile) order by c.ordem)
                   from capa_imagens c where c.escritorio_id = e.id), '[]'::jsonb)
  from escritorios e where e.slug = esc_slug and e.status in ('teste','ativo');
$$;

-- =========================================================
-- RLS
-- =========================================================
alter table public.escritorios enable row level security;
alter table public.perfis enable row level security;
alter table public.membros enable row level security;
alter table public.convites enable row level security;
alter table public.habilidades enable row level security;
alter table public.trilhas enable row level security;
alter table public.aulas enable row level security;
alter table public.progresso_aula enable row level security;
alter table public.credenciamentos enable row level security;
alter table public.manual_docs enable row level security;
alter table public.duvidas enable row level security;
alter table public.avisos enable row level security;
alter table public.avisos_leitura enable row level security;
alter table public.ambientes enable row level security;
alter table public.presenca enable row level security;
alter table public.projetos enable row level security;
alter table public.projeto_membros enable row level security;
alter table public.recados enable row level security;
alter table public.reunioes enable row level security;
alter table public.visitas enable row level security;
alter table public.capa_imagens enable row level security;

-- Escritório: membros leem; admin edita
drop policy if exists esc_ler on public.escritorios;
create policy esc_ler on public.escritorios for select to authenticated using (eh_membro(id));
drop policy if exists esc_editar on public.escritorios;
create policy esc_editar on public.escritorios for update to authenticated using (eh_admin(id)) with check (eh_admin(id));

-- Perfis: cada um edita o seu; colegas de escritório se veem
drop policy if exists perfil_ler on public.perfis;
create policy perfil_ler on public.perfis for select to authenticated using (
  id = auth.uid() or exists (select 1 from membros m1 join membros m2 on m1.escritorio_id = m2.escritorio_id
                              where m1.perfil_id = auth.uid() and m2.perfil_id = perfis.id and m1.ativo));
drop policy if exists perfil_editar on public.perfis;
create policy perfil_editar on public.perfis for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Membros e convites: membros leem a equipe; admin gerencia
drop policy if exists membros_ler on public.membros;
create policy membros_ler on public.membros for select to authenticated using (eh_membro(escritorio_id));
drop policy if exists membros_admin on public.membros;
create policy membros_admin on public.membros for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id));
drop policy if exists convites_admin on public.convites;
create policy convites_admin on public.convites for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id));

-- Conteúdo (habilidades, trilhas, aulas, manual, ambientes, capa): membros leem; admin escreve
do $$
declare t text;
begin
  foreach t in array array['habilidades','trilhas','aulas','manual_docs','ambientes','capa_imagens'] loop
    execute format('drop policy if exists %1$s_ler on public.%1$s', t);
    execute format('create policy %1$s_ler on public.%1$s for select to authenticated using (eh_membro(escritorio_id))', t);
    execute format('drop policy if exists %1$s_admin on public.%1$s', t);
    execute format('create policy %1$s_admin on public.%1$s for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id))', t);
  end loop;
end $$;

-- Progresso e leitura de avisos: cada um o seu; admin lê todos do escritório
drop policy if exists prog_proprio on public.progresso_aula;
create policy prog_proprio on public.progresso_aula for all to authenticated
  using (perfil_id = auth.uid() and eh_membro(escritorio_id)) with check (perfil_id = auth.uid() and eh_membro(escritorio_id));
drop policy if exists prog_admin on public.progresso_aula;
create policy prog_admin on public.progresso_aula for select to authenticated using (eh_admin(escritorio_id));

drop policy if exists cred_ler on public.credenciamentos;
create policy cred_ler on public.credenciamentos for select to authenticated using (perfil_id = auth.uid() or eh_admin(escritorio_id));
drop policy if exists cred_admin on public.credenciamentos;
create policy cred_admin on public.credenciamentos for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id));

drop policy if exists leitura_propria on public.avisos_leitura;
create policy leitura_propria on public.avisos_leitura for all to authenticated
  using (perfil_id = auth.uid() and eh_membro(escritorio_id)) with check (perfil_id = auth.uid() and eh_membro(escritorio_id));
drop policy if exists leitura_admin on public.avisos_leitura;
create policy leitura_admin on public.avisos_leitura for select to authenticated using (eh_admin(escritorio_id));

-- Dúvidas: membros leem; autor cria; admin responde
drop policy if exists duv_ler on public.duvidas;
create policy duv_ler on public.duvidas for select to authenticated using (eh_membro(escritorio_id));
drop policy if exists duv_criar on public.duvidas;
create policy duv_criar on public.duvidas for insert to authenticated with check (autor_id = auth.uid() and eh_membro(escritorio_id));
drop policy if exists duv_admin on public.duvidas;
create policy duv_admin on public.duvidas for update to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id));

-- Avisos: membros leem; admin publica
drop policy if exists avisos_ler on public.avisos;
create policy avisos_ler on public.avisos for select to authenticated using (eh_membro(escritorio_id));
drop policy if exists avisos_admin on public.avisos;
create policy avisos_admin on public.avisos for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id));

-- Presença: membros veem a sala; cada um atualiza a própria
drop policy if exists pres_ler on public.presenca;
create policy pres_ler on public.presenca for select to authenticated using (eh_membro(escritorio_id));
drop policy if exists pres_propria on public.presenca;
create policy pres_propria on public.presenca for all to authenticated
  using (perfil_id = auth.uid() and eh_membro(escritorio_id)) with check (perfil_id = auth.uid() and eh_membro(escritorio_id));

-- Projetos: admin vê todos; Partner só os seus
drop policy if exists proj_ler on public.projetos;
create policy proj_ler on public.projetos for select to authenticated using (
  eh_admin(escritorio_id) or eh_do_projeto(id));
drop policy if exists proj_admin on public.projetos;
create policy proj_admin on public.projetos for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id));

drop policy if exists pm_ler on public.projeto_membros;
create policy pm_ler on public.projeto_membros for select to authenticated using (
  eh_admin(escritorio_id) or perfil_id = auth.uid() or eh_do_projeto(projeto_id));
drop policy if exists pm_admin on public.projeto_membros;
create policy pm_admin on public.projeto_membros for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id));

drop policy if exists rec_ler on public.recados;
create policy rec_ler on public.recados for select to authenticated using (
  eh_admin(escritorio_id) or eh_do_projeto(projeto_id));
drop policy if exists rec_criar on public.recados;
create policy rec_criar on public.recados for insert to authenticated with check (
  autor_id = auth.uid() and (eh_admin(escritorio_id) or eh_do_projeto(projeto_id)));

-- Reuniões: membros veem e iniciam
drop policy if exists reu_ler on public.reunioes;
create policy reu_ler on public.reunioes for select to authenticated using (eh_membro(escritorio_id));
drop policy if exists reu_escrever on public.reunioes;
create policy reu_escrever on public.reunioes for all to authenticated using (eh_membro(escritorio_id)) with check (eh_membro(escritorio_id));

-- Visitas: equipe vê e atende; visitante usa as funções com token
drop policy if exists vis_equipe on public.visitas;
create policy vis_equipe on public.visitas for all to authenticated using (eh_membro(escritorio_id)) with check (eh_membro(escritorio_id));

-- =========================================================
-- Permissões explícitas (tabelas não são expostas automaticamente)
-- =========================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.criar_visita(text,text,text) to anon, authenticated;
grant execute on function public.ver_visita(uuid) to anon, authenticated;
grant execute on function public.visita_acao(uuid,text) to anon, authenticated;
grant execute on function public.capa_publica(text) to anon, authenticated;
grant execute on function public.eh_membro(uuid), public.eh_admin(uuid), public.eh_do_projeto(uuid) to authenticated;

-- =========================================================
-- Tempo real (sala, recepção, mural, recados)
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array['presenca','visitas','avisos','recados','reunioes'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- =========================================================
-- Dados iniciais: EZE Arquitetura
-- =========================================================
insert into public.escritorios (slug, nome, config)
values ('eze', 'EZE Arquitetura e Gestão', '{"capa":{"tempo":9,"aleatorio":true,"pb":true}}')
on conflict (slug) do nothing;

with e as (select id from public.escritorios where slug = 'eze')
insert into public.ambientes (escritorio_id, chave, nome, tipo, grade, ordem)
select e.id, v.chave, v.nome, v.tipo, v.grade, v.ordem from e, (values
  ('arquitetos','Arquitetos','sala','1 / 1 / 5 / 3',1),
  ('ceo','CEO','sala','1 / 3 / 2 / 7',2),
  ('engenharia','Engenharia','sala','1 / 7 / 5 / 9',3),
  ('jardim','Jardim','jardim','2 / 3 / 5 / 7',4),
  ('aprovacao','Aprovação e atendimento','sala','5 / 1 / 6 / 3',5),
  ('reuniao2','Reunião 2','reuniao','5 / 3 / 6 / 5',6),
  ('recepcao','Recepção','recepcao','5 / 5 / 6 / 9',7),
  ('projetos','Projetos','projetos','6 / 1 / 7 / 3',8),
  ('financeiro','Financeiro','sala','6 / 3 / 7 / 5',9),
  ('reuniao1','Reunião 1','reuniao','6 / 5 / 7 / 9',10)
) as v(chave, nome, tipo, grade, ordem)
on conflict (escritorio_id, chave) do nothing;

with e as (select id from public.escritorios where slug = 'eze')
insert into public.habilidades (escritorio_id, nome, ordem)
select e.id, v.nome, v.ordem from e, (values ('Criação',1),('Projeto de aprovação',2),('Detalhamento',3)) as v(nome, ordem)
where not exists (select 1 from public.habilidades h where h.escritorio_id = e.id);

with e as (select id from public.escritorios where slug = 'eze')
insert into public.trilhas (escritorio_id, habilidade_id, titulo, ordem, publicada)
select e.id, (select h.id from public.habilidades h where h.escritorio_id = e.id and h.nome = v.hab), v.titulo, v.ordem, true
from e, (values (null,'Padrões gerais EZE',1),('Criação','Criação',2),('Projeto de aprovação','Projeto de aprovação',3),('Detalhamento','Detalhamento',4)) as v(hab, titulo, ordem)
where not exists (select 1 from public.trilhas t where t.escritorio_id = e.id);

-- O Eze entra como dono no primeiro login com este e-mail
insert into public.convites (escritorio_id, email, papel)
select id, 'ezequiel@ezearquitetura.com.br', 'dono' from public.escritorios where slug = 'eze'
on conflict (escritorio_id, email) do nothing;
