-- EZE Gestão · 0013 · Briefing do projeto
-- Cada projeto tem um briefing em três partes:
--   cliente      objetivos, programa, o que gosta e não gosta, referências (o cliente
--                preenche por um link, sem conta; a equipe revisa e completa)
--   responsável  leitura da reunião, restrições, conceito, referências
--   objetivos    lista curta com prioridade (essencial, importante, desejável): é a
--                régua da camada "Cliente" na pré-análise IA
-- A pré-análise guarda uma cópia do briefing usado (analises.briefing), então cada
-- parecer fica ligado à versão que valia naquela entrega.
-- Rodar uma vez no SQL Editor, depois da 0012. Pode rodar de novo sem problema.

-- =========================================================
-- 1. Tabelas
-- =========================================================
create table if not exists public.projeto_briefings (
  projeto_id uuid primary key references public.projetos(id) on delete cascade,
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  cliente jsonb not null default '{}'::jsonb,       -- {objetivos, programa, gosta, nao_gosta, publico, prazo, orcamento, outros}
  responsavel jsonb not null default '{}'::jsonb,   -- {leitura, restricoes, conceito, outros}
  link_token uuid not null default gen_random_uuid(),
  link_ativo boolean not null default false,
  cliente_nome text,                                -- quem respondeu pelo link
  cliente_enviado_em timestamptz,
  versao int not null default 1,
  updated_at timestamptz not null default now(),
  atualizado_por uuid references public.perfis(id) on delete set null
);
create unique index if not exists briefing_token on public.projeto_briefings (link_token);

create table if not exists public.briefing_objetivos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  ordem int not null default 0,
  texto text not null,
  prioridade text not null default 'importante' check (prioridade in ('essencial','importante','desejavel')),
  origem text not null default 'responsavel' check (origem in ('cliente','responsavel')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists briefing_obj_proj on public.briefing_objetivos (projeto_id, ordem);

create table if not exists public.briefing_refs (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  origem text not null default 'responsavel' check (origem in ('cliente','responsavel')),
  tipo text not null default 'referencia' check (tipo in ('gosta','nao_gosta','referencia')),
  titulo text,
  comentario text,
  caminho text,                                     -- arquivo no bucket "briefing"
  mime text,
  tamanho bigint,
  link text,
  enviar boolean not null default true,             -- vai junto na pré-análise
  created_at timestamptz not null default now()
);
create index if not exists briefing_refs_proj on public.briefing_refs (projeto_id, created_at);

-- Pré-análise: nota de aderência aos objetivos e cópia do briefing usado
alter table public.analises add column if not exists nota_cliente numeric;
alter table public.analises add column if not exists briefing jsonb;

-- Versão sobe a cada mudança no briefing
create or replace function public.briefing_versao() returns trigger
language plpgsql as $$
begin
  if new.cliente is distinct from old.cliente or new.responsavel is distinct from old.responsavel then
    new.versao := old.versao + 1;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists briefing_versao on public.projeto_briefings;
create trigger briefing_versao before update on public.projeto_briefings for each row execute function public.briefing_versao();

-- =========================================================
-- 2. Regras de acesso (equipe)
-- =========================================================
create or replace function public.briefing_ve(proj uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from projetos p where p.id = proj and eh_membro(p.escritorio_id)
                and (eh_do_projeto(proj) or pode(p.escritorio_id, 'projetos')));
$$;
create or replace function public.briefing_edita(proj uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from projetos p where p.id = proj and eh_membro(p.escritorio_id)
                and (eh_do_projeto(proj) or pode(p.escritorio_id, 'projetos', true)));
$$;
grant execute on function public.briefing_ve(uuid), public.briefing_edita(uuid) to authenticated;

alter table public.projeto_briefings enable row level security;
alter table public.briefing_objetivos enable row level security;
alter table public.briefing_refs enable row level security;

do $$ declare t text; begin
  foreach t in array array['projeto_briefings','briefing_objetivos','briefing_refs'] loop
    execute format('drop policy if exists %1$s_ler on public.%1$s', t);
    execute format('create policy %1$s_ler on public.%1$s for select to authenticated using (briefing_ve(projeto_id))', t);
    execute format('drop policy if exists %1$s_edit on public.%1$s', t);
    execute format('create policy %1$s_edit on public.%1$s for all to authenticated using (briefing_edita(projeto_id)) with check (briefing_edita(projeto_id) and eh_membro(escritorio_id))', t);
  end loop;
end $$;
grant select, insert, update, delete on public.projeto_briefings, public.briefing_objetivos, public.briefing_refs to authenticated;

-- =========================================================
-- 3. Link do cliente (sem conta)
-- =========================================================
create or replace function public.briefing_publico(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'projeto', p.nome,
    'escritorio', e.nome,
    'escritorio_id', e.id,
    'projeto_id', p.id,
    'cliente', b.cliente,
    'cliente_nome', b.cliente_nome,
    'enviado_em', b.cliente_enviado_em,
    'refs', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'tipo', r.tipo, 'titulo', r.titulo, 'comentario', r.comentario,
                                                          'caminho', r.caminho, 'mime', r.mime, 'link', r.link) order by r.created_at)
                      from briefing_refs r where r.projeto_id = b.projeto_id and r.origem = 'cliente'), '[]'::jsonb))
  from projeto_briefings b join projetos p on p.id = b.projeto_id join escritorios e on e.id = b.escritorio_id
  where b.link_token = p_token and b.link_ativo;
$$;

create or replace function public.briefing_cliente_salvar(p_token uuid, p_cliente jsonb, p_nome text, p_enviar boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare c jsonb := '{}'::jsonb; k text;
begin
  if not exists(select 1 from projeto_briefings where link_token = p_token and link_ativo) then
    raise exception 'Link inválido ou desativado';
  end if;
  -- só os campos do cliente, cada um com até 8.000 caracteres
  foreach k in array array['objetivos','programa','gosta','nao_gosta','publico','prazo','orcamento','outros'] loop
    if p_cliente ? k then c := c || jsonb_build_object(k, left(coalesce(p_cliente ->> k, ''), 8000)); end if;
  end loop;
  update projeto_briefings
     set cliente = cliente || c,
         cliente_nome = coalesce(nullif(left(trim(p_nome), 120), ''), cliente_nome),
         cliente_enviado_em = case when p_enviar then now() else cliente_enviado_em end
   where link_token = p_token;
end $$;

create or replace function public.briefing_cliente_ref(p_token uuid, p_tipo text, p_titulo text, p_comentario text,
                                                       p_caminho text, p_mime text, p_tamanho bigint, p_link text)
returns uuid language plpgsql security definer set search_path = public as $$
declare b projeto_briefings; novo uuid;
begin
  select * into b from projeto_briefings where link_token = p_token and link_ativo;
  if b.projeto_id is null then raise exception 'Link inválido ou desativado'; end if;
  if p_tipo not in ('gosta','nao_gosta','referencia') then raise exception 'Tipo inválido'; end if;
  if p_caminho is not null and p_caminho not like b.escritorio_id || '/' || b.projeto_id || '/cliente/' || p_token || '/%' then
    raise exception 'Arquivo inválido';
  end if;
  if p_caminho is null and coalesce(trim(p_link), '') = '' then raise exception 'Envie um arquivo ou um link'; end if;
  if (select count(*) from briefing_refs where projeto_id = b.projeto_id and origem = 'cliente') >= 60 then
    raise exception 'Limite de 60 referências';
  end if;
  insert into briefing_refs (escritorio_id, projeto_id, origem, tipo, titulo, comentario, caminho, mime, tamanho, link)
  values (b.escritorio_id, b.projeto_id, 'cliente', p_tipo, left(p_titulo, 200), left(p_comentario, 2000), p_caminho,
          left(p_mime, 80), p_tamanho, left(nullif(trim(p_link), ''), 1000))
  returning id into novo;
  return novo;
end $$;

create or replace function public.briefing_cliente_tirar(p_token uuid, p_ref uuid)
returns text language plpgsql security definer set search_path = public as $$
declare cam text;
begin
  delete from briefing_refs r using projeto_briefings b
   where r.id = p_ref and r.origem = 'cliente' and b.projeto_id = r.projeto_id and b.link_token = p_token and b.link_ativo
  returning r.caminho into cam;
  return cam;
end $$;

grant execute on function public.briefing_publico(uuid) to anon, authenticated;
grant execute on function public.briefing_cliente_salvar(uuid, jsonb, text, boolean) to anon, authenticated;
grant execute on function public.briefing_cliente_ref(uuid, text, text, text, text, text, bigint, text) to anon, authenticated;
grant execute on function public.briefing_cliente_tirar(uuid, uuid) to anon, authenticated;

-- =========================================================
-- 4. Arquivos (bucket privado "briefing")
--    escritorio/projeto/cliente/<token>/arquivo  · enviados pelo cliente
--    escritorio/projeto/equipe/arquivo           · enviados pela equipe
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('briefing', 'briefing', false, 26214400)
on conflict (id) do nothing;

create or replace function public.briefing_arq_ok(caminho text, escrever boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare partes text[]; esc uuid; proj uuid; tok uuid;
begin
  partes := string_to_array(caminho, '/');
  if coalesce(array_length(partes, 1), 0) < 4 then return false; end if;
  begin
    esc := partes[1]::uuid;
    proj := partes[2]::uuid;
  exception when others then return false;
  end;
  if not exists(select 1 from projetos where id = proj and escritorio_id = esc) then return false; end if;
  -- equipe do projeto
  if auth.uid() is not null and (case when escrever then briefing_edita(proj) else briefing_ve(proj) end) then return true; end if;
  -- cliente pelo link
  if partes[3] = 'cliente' and array_length(partes, 1) >= 5 then
    begin tok := partes[4]::uuid; exception when others then return false; end;
    return exists(select 1 from projeto_briefings where projeto_id = proj and link_token = tok and link_ativo);
  end if;
  return false;
end $$;
grant execute on function public.briefing_arq_ok(text, boolean) to anon, authenticated;

drop policy if exists briefing_arq_ler on storage.objects;
create policy briefing_arq_ler on storage.objects for select to anon, authenticated
  using (bucket_id = 'briefing' and public.briefing_arq_ok(name, false));
drop policy if exists briefing_arq_enviar on storage.objects;
create policy briefing_arq_enviar on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'briefing' and public.briefing_arq_ok(name, true));
drop policy if exists briefing_arq_apagar on storage.objects;
create policy briefing_arq_apagar on storage.objects for delete to anon, authenticated
  using (bucket_id = 'briefing' and public.briefing_arq_ok(name, true));

select 'ok' as resultado;
