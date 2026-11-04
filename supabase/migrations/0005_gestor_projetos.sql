-- EZE Gestão · 0005 · Gestor de projetos (substitui o Desker em fases)
-- Clientes, etapas-modelo (DP → PV) com tarefas-modelo, disciplinas,
-- projetos com código/cliente/status, etapas do projeto, tarefas em árvore,
-- checklist, apontamento de horas e capacidade semanal da equipe.
-- Regras: admin vê e edita tudo; Partner vê os próprios projetos e atualiza
-- as tarefas em que é responsável; cada pessoa lança só as próprias horas.

-- =========================================================
-- Cadastros
-- =========================================================
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text not null,
  documento text,              -- CPF ou CNPJ
  email text,
  telefone text,
  cidade text,
  contato text,                -- pessoa de contato
  obs text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists clientes_esc on public.clientes (escritorio_id, nome);

create table if not exists public.disciplinas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text not null,
  ordem int not null default 0,
  unique (escritorio_id, nome)
);

create table if not exists public.etapas_modelo (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  sigla text not null,
  nome text not null,
  ordem int not null default 0,
  peso numeric not null default 1,      -- peso no progresso do projeto
  ativo boolean not null default true,
  unique (escritorio_id, sigla)
);

create table if not exists public.tarefas_modelo (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  etapa_id uuid not null references public.etapas_modelo(id) on delete cascade,
  titulo text not null,
  horas_previstas numeric not null default 0,
  checklist text[] not null default '{}',
  ordem int not null default 0
);

-- Capacidade semanal de cada pessoa (carga da equipe)
alter table public.membros add column if not exists horas_semana numeric not null default 40;
alter table public.membros add column if not exists cargo text;

-- =========================================================
-- Projetos: campos de gestão
-- =========================================================
create table if not exists public.projeto_codigos (
  escritorio_id uuid primary key references public.escritorios(id) on delete cascade,
  ultimo int not null default 0
);

alter table public.projetos add column if not exists codigo int;
alter table public.projetos add column if not exists cliente_id uuid references public.clientes(id) on delete set null;
alter table public.projetos add column if not exists tipologia text;            -- HOSP, MULTI, UNI, INTERIORES, COM
alter table public.projetos add column if not exists cidade text;
alter table public.projetos add column if not exists endereco text;
alter table public.projetos add column if not exists area_m2 numeric;
alter table public.projetos add column if not exists valor numeric;
alter table public.projetos add column if not exists status text not null default 'andamento';
alter table public.projetos add column if not exists coordenador_id uuid references public.perfis(id) on delete set null;
alter table public.projetos add column if not exists inicio date;
alter table public.projetos add column if not exists termino date;
alter table public.projetos add column if not exists escopo text;
alter table public.projetos add column if not exists origem_desker text;        -- id no Desker (migração)

do $$ begin
  alter table public.projetos add constraint projetos_status_check
    check (status in ('pendente','andamento','pausado','finalizado','sem_contrato'));
exception when duplicate_object then null; end $$;

-- Numera os projetos que já existem, por ordem de criação
with n as (
  select id, row_number() over (partition by escritorio_id order by created_at) as rn from public.projetos where codigo is null
)
update public.projetos p set codigo = n.rn + coalesce((select max(codigo) from public.projetos q where q.escritorio_id = p.escritorio_id), 0)
from n where n.id = p.id;

create unique index if not exists projetos_codigo on public.projetos (escritorio_id, codigo) where codigo is not null;

-- Código sequencial por escritório quando não informado
create or replace function public.projeto_codigo() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.codigo is null then
    insert into projeto_codigos (escritorio_id, ultimo) values (new.escritorio_id, 0) on conflict (escritorio_id) do nothing;
    update projeto_codigos
       set ultimo = greatest(ultimo, (select coalesce(max(codigo), 0) from projetos where escritorio_id = new.escritorio_id)) + 1
     where escritorio_id = new.escritorio_id
     returning ultimo into n;
    new.codigo := n;
  end if;
  return new;
end $$;

drop trigger if exists projeto_codigo on public.projetos;
create trigger projeto_codigo before insert on public.projetos
  for each row execute function public.projeto_codigo();

-- =========================================================
-- Etapas do projeto e tarefas
-- =========================================================
create table if not exists public.projeto_etapas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  modelo_id uuid references public.etapas_modelo(id) on delete set null,
  sigla text,
  nome text not null,
  ordem int not null default 0,
  peso numeric not null default 1,
  inicio date,
  termino date,
  created_at timestamptz not null default now()
);
create index if not exists etapas_proj on public.projeto_etapas (projeto_id, ordem);

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  etapa_id uuid references public.projeto_etapas(id) on delete cascade,
  pai_id uuid references public.tarefas(id) on delete cascade,
  disciplina_id uuid references public.disciplinas(id) on delete set null,
  titulo text not null,
  descricao text,
  responsavel_id uuid references public.perfis(id) on delete set null,
  inicio date,
  termino date,
  horas_previstas numeric not null default 0,
  status text not null default 'pendente' check (status in ('backlog','pendente','andamento','revisao','concluida')),
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','urgente')),
  ordem int not null default 0,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tarefas_proj on public.tarefas (projeto_id, etapa_id, ordem);
create index if not exists tarefas_resp on public.tarefas (escritorio_id, responsavel_id, status);

create or replace function public.tarefa_carimbo() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status <> 'concluida' then
    new.concluida_em := null;
  elsif tg_op = 'INSERT' then
    new.concluida_em := coalesce(new.concluida_em, now());
  elsif old.status <> 'concluida' then
    new.concluida_em := now();
  end if;
  return new;
end $$;
drop trigger if exists tarefa_carimbo on public.tarefas;
create trigger tarefa_carimbo before insert or update on public.tarefas
  for each row execute function public.tarefa_carimbo();

create table if not exists public.checklist_itens (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  texto text not null,
  feito boolean not null default false,
  ordem int not null default 0
);
create index if not exists check_tarefa on public.checklist_itens (tarefa_id, ordem);

-- Horas: base do custo por projeto. Origem prepara o agente EZE Horas.
create table if not exists public.apontamentos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  projeto_id uuid references public.projetos(id) on delete cascade,
  tarefa_id uuid references public.tarefas(id) on delete set null,
  data date not null default current_date,
  minutos int not null check (minutos > 0 and minutos <= 1440),
  nota text,
  origem text not null default 'manual' check (origem in ('manual','cronometro','agente','importado')),
  created_at timestamptz not null default now()
);
create index if not exists apont_proj on public.apontamentos (projeto_id, data);
create index if not exists apont_pessoa on public.apontamentos (escritorio_id, perfil_id, data);

-- =========================================================
-- Aplicar o modelo de etapas e tarefas a um projeto
-- =========================================================
create or replace function public.aplicar_modelo(proj uuid, siglas text[] default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  esc uuid;
  e record;
  nova uuid;
  t record;
  nt uuid;
  n int := 0;
  i int;
begin
  select escritorio_id into esc from projetos where id = proj;
  if esc is null or not eh_admin(esc) then raise exception 'Sem permissão'; end if;
  for e in
    select * from etapas_modelo
    where escritorio_id = esc and ativo and (siglas is null or sigla = any(siglas))
      and not exists (select 1 from projeto_etapas pe where pe.projeto_id = proj and pe.modelo_id = etapas_modelo.id)
    order by ordem
  loop
    insert into projeto_etapas (escritorio_id, projeto_id, modelo_id, sigla, nome, ordem, peso)
      values (esc, proj, e.id, e.sigla, e.nome, e.ordem, e.peso) returning id into nova;
    for t in select * from tarefas_modelo where etapa_id = e.id order by ordem loop
      insert into tarefas (escritorio_id, projeto_id, etapa_id, titulo, horas_previstas, ordem)
        values (esc, proj, nova, t.titulo, t.horas_previstas, t.ordem) returning id into nt;
      if t.checklist is not null then
        for i in 1 .. coalesce(array_length(t.checklist, 1), 0) loop
          insert into checklist_itens (escritorio_id, tarefa_id, texto, ordem) values (esc, nt, t.checklist[i], i);
        end loop;
      end if;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
grant execute on function public.aplicar_modelo(uuid, text[]) to authenticated;

-- Progresso do projeto: média das etapas ponderada pelo peso;
-- cada etapa = horas previstas concluídas / horas previstas (ou nº de tarefas).
create or replace view public.projeto_progresso with (security_invoker = true) as
with t as (
  select etapa_id, projeto_id,
         sum(greatest(horas_previstas, 0)) as hp,
         sum(case when status = 'concluida' then greatest(horas_previstas, 0) else 0 end) as hc,
         count(*) as nt,
         count(*) filter (where status = 'concluida') as nc
  from tarefas where pai_id is null group by etapa_id, projeto_id
), e as (
  select pe.projeto_id, pe.id, pe.peso,
         case when coalesce(t.hp,0) > 0 then t.hc / t.hp
              when coalesce(t.nt,0) > 0 then t.nc::numeric / t.nt
              else 0 end as pct
  from projeto_etapas pe left join t on t.etapa_id = pe.id
)
select projeto_id,
       case when sum(peso) > 0 then round(100 * sum(pct * peso) / sum(peso)) else 0 end as progresso
from e group by projeto_id;
grant select on public.projeto_progresso to authenticated;

-- =========================================================
-- Segurança
-- =========================================================
alter table public.clientes enable row level security;
alter table public.disciplinas enable row level security;
alter table public.etapas_modelo enable row level security;
alter table public.tarefas_modelo enable row level security;
alter table public.projeto_codigos enable row level security;
alter table public.projeto_etapas enable row level security;
alter table public.tarefas enable row level security;
alter table public.checklist_itens enable row level security;
alter table public.apontamentos enable row level security;

-- Cadastros: membros leem, admin edita
do $$ declare t text; begin
  foreach t in array array['clientes','disciplinas','etapas_modelo','tarefas_modelo'] loop
    execute format('drop policy if exists %1$s_ler on public.%1$s', t);
    execute format('create policy %1$s_ler on public.%1$s for select to authenticated using (eh_membro(escritorio_id))', t);
    execute format('drop policy if exists %1$s_admin on public.%1$s', t);
    execute format('create policy %1$s_admin on public.%1$s for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id))', t);
  end loop;
end $$;

drop policy if exists et_ler on public.projeto_etapas;
create policy et_ler on public.projeto_etapas for select to authenticated using (eh_admin(escritorio_id) or eh_do_projeto(projeto_id));
drop policy if exists et_admin on public.projeto_etapas;
create policy et_admin on public.projeto_etapas for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id));

drop policy if exists tf_ler on public.tarefas;
create policy tf_ler on public.tarefas for select to authenticated using (eh_admin(escritorio_id) or eh_do_projeto(projeto_id));
drop policy if exists tf_admin on public.tarefas;
create policy tf_admin on public.tarefas for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id));
drop policy if exists tf_resp on public.tarefas;
create policy tf_resp on public.tarefas for update to authenticated
  using (responsavel_id = auth.uid() and eh_do_projeto(projeto_id))
  with check (responsavel_id = auth.uid() and eh_do_projeto(projeto_id));

drop policy if exists ck_ler on public.checklist_itens;
create policy ck_ler on public.checklist_itens for select to authenticated using (
  eh_admin(escritorio_id) or exists (select 1 from tarefas t where t.id = tarefa_id and eh_do_projeto(t.projeto_id)));
drop policy if exists ck_admin on public.checklist_itens;
create policy ck_admin on public.checklist_itens for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id));
drop policy if exists ck_resp on public.checklist_itens;
create policy ck_resp on public.checklist_itens for update to authenticated
  using (exists (select 1 from tarefas t where t.id = tarefa_id and t.responsavel_id = auth.uid()))
  with check (exists (select 1 from tarefas t where t.id = tarefa_id and t.responsavel_id = auth.uid()));

drop policy if exists ap_ler on public.apontamentos;
create policy ap_ler on public.apontamentos for select to authenticated using (eh_admin(escritorio_id) or perfil_id = auth.uid());
drop policy if exists ap_proprio on public.apontamentos;
create policy ap_proprio on public.apontamentos for all to authenticated
  using (perfil_id = auth.uid() and eh_membro(escritorio_id))
  with check (perfil_id = auth.uid() and eh_membro(escritorio_id) and (projeto_id is null or eh_admin(escritorio_id) or eh_do_projeto(projeto_id)));
drop policy if exists ap_admin on public.apontamentos;
create policy ap_admin on public.apontamentos for all to authenticated using (eh_admin(escritorio_id)) with check (eh_admin(escritorio_id));

grant select, insert, update, delete on public.clientes, public.disciplinas, public.etapas_modelo, public.tarefas_modelo,
  public.projeto_etapas, public.tarefas, public.checklist_itens, public.apontamentos to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.tarefas;
exception when duplicate_object then null; end $$;

-- =========================================================
-- Dados iniciais da EZE (processo real, levantado do Desker)
-- =========================================================
with e as (select id from public.escritorios where slug = 'eze')
insert into public.etapas_modelo (escritorio_id, sigla, nome, ordem, peso)
select e.id, v.sigla, v.nome, v.ordem, v.peso from e, (values
  ('DP','Documentação Preliminar',1,1),
  ('EV','Estudo de Viabilidade',2,1),
  ('AP','Anteprojeto',3,3),
  ('PL','Projeto Legal',4,2),
  ('GA','Gestão de Aprovação',5,1),
  ('PB','Pré-Executivo',6,2),
  ('PE','Projeto Executivo',7,4),
  ('QD','Quantitativos e Detalhamentos',8,1),
  ('IN','Interiores',9,2),
  ('PV','Pós-Venda',10,1)
) as v(sigla, nome, ordem, peso)
on conflict (escritorio_id, sigla) do nothing;

with e as (select id from public.escritorios where slug = 'eze'),
m as (select em.id, em.sigla, em.escritorio_id from public.etapas_modelo em join e on e.id = em.escritorio_id)
insert into public.tarefas_modelo (escritorio_id, etapa_id, titulo, horas_previstas, ordem)
select m.escritorio_id, m.id, v.titulo, v.horas, v.ordem from m join (values
  ('DP','Documentos do terreno',1,1),
  ('DP','Pagamento de taxas',1,2),
  ('DP','Consulta de viabilidade — Planejamento',1,3),
  ('DP','Consulta de viabilidade — FAMAB',1,4),
  ('DP','Alinhamento de muro',1,5),
  ('EV','Levantamento de legislação e índices',4,1),
  ('EV','Estudo de massa e unidades',16,2),
  ('EV','Planilha de viabilidade',6,3),
  ('EV','Apresentação ao cliente',2,4),
  ('AP','Validações',4,1),
  ('AP','Detalhamento de planta',40,2),
  ('AP','Modelagem de fachada',80,3),
  ('AP','Aprovação do cliente',4,4),
  ('PL','Documentação do projeto legal',40,1),
  ('GA','Aprovação — Projeto arquitetônico',4,1),
  ('GA','Aprovação — Projeto hidrossanitário',2,2),
  ('GA','Aprovação — Preventivo de incêndio',2,3),
  ('GA','Aprovação — Projeto elétrico',2,4),
  ('GA','Alvará de construção',2,5),
  ('PB','Compatibilização hidrossanitário',8,1),
  ('PB','Compatibilização preventivo de incêndio',8,2),
  ('PB','Compatibilização estrutural',8,3),
  ('PB','Compatibilização elétrico',8,4),
  ('PE','Documentação do projeto executivo',120,1),
  ('QD','Quantitativos',16,1),
  ('QD','Detalhamentos',24,2),
  ('IN','Layout e conceito de interiores',24,1),
  ('IN','Detalhamento de marcenaria',40,2),
  ('PV','Atendimento pós-entrega',4,1)
) as v(sigla, titulo, horas, ordem) on v.sigla = m.sigla
where not exists (select 1 from public.tarefas_modelo tm where tm.etapa_id = m.id);

with e as (select id from public.escritorios where slug = 'eze')
insert into public.disciplinas (escritorio_id, nome, ordem)
select e.id, v.nome, v.ordem from e, (values
  ('Arquitetura',1),('Interiores',2),('Compatibilização',3),('Coordenação',4),('Estrutural',5),('Fundações',6),
  ('Hidrossanitário',7),('Elétrico',8),('Lógica',9),('Automação',10),('Ar-condicionado',11),('Gás',12),
  ('Preventivo de incêndio',13),('Impermeabilização',14),('Terraplenagem',15),('Estrutura metálica',16)
) as v(nome, ordem)
on conflict (escritorio_id, nome) do nothing;

select 'ok' as resultado;
