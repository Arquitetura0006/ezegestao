-- EZE Gestão · 0012 · Analistas IA (pré-análise de projetos)
-- Cada analista é uma regra de análise com orientações próprias, em camadas que se
-- somam na hora da análise:
--   base       vale para todo projeto (padrões EZE)
--   etapa      checklist de uma etapa do processo (EV, AP, PL, PE…)
--   municipio  legislação de uma cidade (Bombinhas, Itajaí…), só nas etapas marcadas
--   estetica   ousadia, volumetria, cor e materialidade, nas etapas de criação
-- Um analista entra numa análise quando a etapa da entrega está na lista dele (lista
-- vazia = todas) e, se for de município, quando a cidade do projeto é a dele.
-- A IA faz a pré-análise; a decisão final é sempre de uma pessoa (analise_decidir).
-- Permissão nova: módulo "analistas" (editar = cadastrar analistas e dar a decisão).
-- Rodar uma vez no SQL Editor, depois da 0011. Pode rodar de novo sem problema.

-- =========================================================
-- 1. Analistas, itens e documentos
-- =========================================================
create table if not exists public.analistas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text not null,
  camada text not null check (camada in ('base','etapa','municipio','estetica')),
  etapas text[] not null default '{}',      -- siglas do Processo EZE; vazio = todas
  cidades text[] not null default '{}',     -- só para camada municipio
  descricao text,
  orientacoes text not null default '',     -- como analisar (texto livre do Eze)
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  atualizado_por uuid references public.perfis(id) on delete set null
);
create index if not exists analistas_esc on public.analistas (escritorio_id, camada, ordem);

create table if not exists public.analista_itens (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  analista_id uuid not null references public.analistas(id) on delete cascade,
  ordem int not null default 0,
  grupo text,                               -- ex.: Implantação, Fachadas, Quadro de áreas
  texto text not null,                      -- o que verificar
  como_verificar text,                      -- onde olhar, limite, referência legal
  tipo text not null default 'checklist' check (tipo in ('checklist','nota')),
  peso numeric not null default 1,          -- peso na nota (itens do tipo nota)
  critico boolean not null default false,   -- não conforme = não pode seguir
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists analista_itens_a on public.analista_itens (analista_id, ordem);

create table if not exists public.analista_docs (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  analista_id uuid not null references public.analistas(id) on delete cascade,
  tipo text not null default 'norma' check (tipo in ('norma','ref_boa','ref_ruim','apoio')),
  titulo text not null,
  caminho text,                             -- arquivo no bucket "analises"
  mime text,
  tamanho bigint,
  texto text,                               -- trecho colado (artigos da lei, notas)
  comentario text,                          -- por que é boa/ruim, o que observar
  enviar boolean not null default true,     -- vai junto em toda análise
  created_at timestamptz not null default now()
);
create index if not exists analista_docs_a on public.analista_docs (analista_id, tipo);

-- =========================================================
-- 2. Análises
-- =========================================================
create table if not exists public.analises (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  projeto_id uuid references public.projetos(id) on delete set null,
  etapa_sigla text,
  cidade text,
  titulo text not null,
  obs text,                                 -- o que o arquiteto pede atenção
  arquivos jsonb not null default '[]'::jsonb,  -- [{nome, caminho, mime, tamanho}]
  analistas_ids uuid[] not null default '{}',
  enviado_por uuid default auth.uid() references public.perfis(id) on delete set null,
  status text not null default 'enviada' check (status in ('enviada','analisando','concluida','erro')),
  resultado jsonb,
  nota numeric,                             -- nota estética ponderada (0 a 10)
  modelo text,
  uso jsonb,                                -- tokens de entrada/saída
  erro text,
  decisao text check (decisao in ('aprovado','correcoes','reprovado')),
  parecer_final text,
  revisado_por uuid references public.perfis(id) on delete set null,
  revisado_em timestamptz,
  iniciada_em timestamptz,
  concluida_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists analises_esc on public.analises (escritorio_id, created_at desc);
create index if not exists analises_proj on public.analises (projeto_id, created_at desc);

-- Quem vê uma análise: quem enviou, quem tem Analistas, a equipe do projeto e quem tem Projetos
create or replace function public.analise_ve(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from analises a
     where a.id = p_id and eh_membro(a.escritorio_id)
       and (a.enviado_por = auth.uid()
            or pode(a.escritorio_id, 'analistas')
            or (a.projeto_id is not null and (eh_do_projeto(a.projeto_id) or pode(a.escritorio_id, 'projetos')))));
$$;
grant execute on function public.analise_ve(uuid) to authenticated;

-- Decisão final (humana)
create or replace function public.analise_decidir(p_id uuid, p_decisao text, p_parecer text)
returns void language plpgsql security definer set search_path = public as $$
declare esc uuid;
begin
  select escritorio_id into esc from analises where id = p_id;
  if esc is null then raise exception 'Análise não encontrada'; end if;
  if not pode(esc, 'analistas', true) then raise exception 'Só quem tem Analistas › editar dá a decisão final'; end if;
  if p_decisao is not null and p_decisao not in ('aprovado','correcoes','reprovado') then raise exception 'Decisão inválida'; end if;
  update analises
     set decisao = p_decisao, parecer_final = nullif(trim(p_parecer), ''),
         revisado_por = case when p_decisao is null then null else auth.uid() end,
         revisado_em = case when p_decisao is null then null else now() end
   where id = p_id;
end $$;
grant execute on function public.analise_decidir(uuid, text, text) to authenticated;

-- =========================================================
-- 3. Regras de acesso
-- =========================================================
alter table public.analistas enable row level security;
alter table public.analista_itens enable row level security;
alter table public.analista_docs enable row level security;
alter table public.analises enable row level security;

-- Analistas: toda a equipe lê (os critérios servem de treinamento); edita quem tem Analistas › editar
do $$ declare t text; begin
  foreach t in array array['analistas','analista_itens','analista_docs'] loop
    execute format('drop policy if exists %1$s_ler on public.%1$s', t);
    execute format('create policy %1$s_ler on public.%1$s for select to authenticated using (eh_membro(escritorio_id))', t);
    execute format('drop policy if exists %1$s_edit on public.%1$s', t);
    execute format('create policy %1$s_edit on public.%1$s for all to authenticated using (pode(escritorio_id, ''analistas'', true)) with check (pode(escritorio_id, ''analistas'', true))', t);
  end loop;
end $$;

drop policy if exists analises_ler on public.analises;
create policy analises_ler on public.analises for select to authenticated using (analise_ve(id));
drop policy if exists analises_criar on public.analises;
create policy analises_criar on public.analises for insert to authenticated with check (
  enviado_por = auth.uid() and eh_membro(escritorio_id) and status = 'enviada'
  and resultado is null and decisao is null
  and (projeto_id is null or eh_do_projeto(projeto_id) or pode(escritorio_id, 'projetos')));
-- Resultado e status são gravados só pelo servidor (chave de serviço). Apagar: quem enviou
-- (antes da decisão) ou quem tem Analistas › editar.
drop policy if exists analises_apagar on public.analises;
create policy analises_apagar on public.analises for delete to authenticated using (
  pode(escritorio_id, 'analistas', true) or (enviado_por = auth.uid() and decisao is null));

grant select, insert, update, delete on public.analistas, public.analista_itens, public.analista_docs to authenticated;
grant select, insert, delete on public.analises to authenticated;

-- =========================================================
-- 4. Arquivos (bucket privado "analises")
--    escritorio/analistas/<analista>/arquivo  · referências e leis
--    escritorio/analises/<analise>/arquivo    · pranchas e renders enviados
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('analises', 'analises', false, 52428800)
on conflict (id) do nothing;

create or replace function public.analise_arq_ok(caminho text, escrever boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare partes text[]; esc uuid; ref uuid; dono uuid;
begin
  partes := string_to_array(caminho, '/');
  if coalesce(array_length(partes, 1), 0) < 4 then return false; end if;
  begin
    esc := partes[1]::uuid;
    ref := partes[3]::uuid;
  exception when others then return false;
  end;
  if not eh_membro(esc) then return false; end if;
  if partes[2] = 'analistas' then
    return (not escrever) or pode(esc, 'analistas', true);
  elsif partes[2] = 'analises' then
    select enviado_por into dono from analises where id = ref and escritorio_id = esc;
    if escrever then
      -- envio antes de criar a análise (o id é gerado na tela) ou por quem enviou
      return dono is null and not exists(select 1 from analises where id = ref) or dono = auth.uid() or pode(esc, 'analistas', true);
    end if;
    return analise_ve(ref);
  end if;
  return false;
end $$;

drop policy if exists analises_arq_ler on storage.objects;
create policy analises_arq_ler on storage.objects for select to authenticated
  using (bucket_id = 'analises' and public.analise_arq_ok(name, false));
drop policy if exists analises_arq_enviar on storage.objects;
create policy analises_arq_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'analises' and public.analise_arq_ok(name, true));
drop policy if exists analises_arq_apagar on storage.objects;
create policy analises_arq_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'analises' and public.analise_arq_ok(name, true));

-- =========================================================
-- 5. Analistas iniciais da EZE (vazios, prontos para alimentar)
-- =========================================================
with e as (select id from public.escritorios where slug = 'eze')
insert into public.analistas (escritorio_id, nome, camada, etapas, cidades, descricao, ordem)
select e.id, v.nome, v.camada, v.etapas, v.cidades, v.descricao, v.ordem from e, (values
  ('Base EZE', 'base', '{}'::text[], '{}'::text[], 'Padrões que valem para todo projeto: pranchas, carimbo, nomenclatura, premissas do escritório.', 1),
  ('Estudo de Viabilidade', 'etapa', '{EV}'::text[], '{}'::text[], 'O que um estudo de viabilidade EZE precisa conter e conferir.', 10),
  ('Anteprojeto', 'etapa', '{AP}'::text[], '{}'::text[], 'Checklist do anteprojeto.', 11),
  ('Projeto Legal (aprovativo)', 'etapa', '{PL}'::text[], '{}'::text[], 'Checklist do projeto para aprovação na prefeitura.', 12),
  ('Pré-Executivo', 'etapa', '{PB}'::text[], '{}'::text[], 'Checklist do pré-executivo.', 13),
  ('Projeto Executivo', 'etapa', '{PE}'::text[], '{}'::text[], 'Checklist do projeto executivo.', 14),
  ('Quantitativos e Detalhamentos', 'etapa', '{QD}'::text[], '{}'::text[], 'Checklist de quantitativos e detalhamentos.', 15),
  ('Interiores', 'etapa', '{IN}'::text[], '{}'::text[], 'Checklist de interiores.', 16),
  ('Bombinhas', 'municipio', '{EV,PL}'::text[], '{Bombinhas}'::text[], 'Plano diretor, código de obras e exigências da Prefeitura de Bombinhas.', 30),
  ('Itajaí', 'municipio', '{EV,PL}'::text[], '{Itajaí}'::text[], 'Plano diretor, código de obras e exigências da Prefeitura de Itajaí.', 31),
  ('Estética EZE', 'estetica', '{EV,AP}'::text[], '{}'::text[], 'Força criativa do projeto pelo conceito EZE.', 50)
) as v(nome, camada, etapas, cidades, descricao, ordem)
where not exists (select 1 from public.analistas a where a.escritorio_id = e.id and a.nome = v.nome);

-- Critérios estéticos (nota de 0 a 10), para o Eze descrever e ajustar os pesos
with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = 'Estética EZE')
insert into public.analista_itens (escritorio_id, analista_id, ordem, texto, tipo, peso)
select a.escritorio_id, a.id, v.ordem, v.texto, 'nota', 1 from a, (values
  (1, 'Ousadia'), (2, 'Volumetria'), (3, 'Composição de cor'), (4, 'Materialidade')
) as v(ordem, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

select 'ok' as resultado;
