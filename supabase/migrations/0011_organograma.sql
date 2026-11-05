-- EZE Gestão · 0011 · Organograma do projeto (quadro livre, estilo Miro)
-- Um organograma por projeto: cards (pessoa, vaga, função, empresa, nota) e vínculos tipados,
-- guardados como JSON. Ele alimenta a coordenação (0010):
-- - Pessoa da equipe ligada ao card de função "Coordenação" vira o coordenador do projeto.
-- - Pessoas da equipe no organograma entram na equipe do projeto (só soma, não remove ninguém).
-- - Pessoas ligadas a um card de função com disciplina (ex.: Estrutura) são sugeridas como
--   responsáveis dos apontamentos daquela disciplina.
-- Quem edita: o coordenador do projeto (coord_coordena). Quem vê: quem vê a coordenação (coord_ve).
-- Rodar depois da 0010. Pode rodar de novo sem problema.

create table if not exists public.projeto_organogramas (
  projeto_id uuid primary key references public.projetos(id) on delete cascade,
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nos jsonb not null default '[]'::jsonb,
  arestas jsonb not null default '[]'::jsonb,
  atualizado_por uuid references public.perfis(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.projeto_organogramas enable row level security;
drop policy if exists org_ler on public.projeto_organogramas;
create policy org_ler on public.projeto_organogramas for select to authenticated using (coord_ve(projeto_id));
grant select on public.projeto_organogramas to authenticated;
-- Gravação só pela função abaixo (aplica as regras e sincroniza a equipe)

create or replace function public.salvar_organograma(proj uuid, p_nos jsonb, p_arestas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  esc uuid;
  coord_no text;
  coords uuid[];
  equipe uuid[];
  novo_coord uuid := null;
begin
  if not coord_coordena(proj) then raise exception 'Só a coordenação edita o organograma'; end if;
  if jsonb_typeof(p_nos) <> 'array' or jsonb_typeof(p_arestas) <> 'array' then raise exception 'Organograma inválido'; end if;
  select escritorio_id into esc from projetos where id = proj;

  insert into projeto_organogramas (projeto_id, escritorio_id, nos, arestas, atualizado_por, updated_at)
  values (proj, esc, p_nos, p_arestas, auth.uid(), now())
  on conflict (projeto_id) do update
    set nos = excluded.nos, arestas = excluded.arestas, atualizado_por = excluded.atualizado_por, updated_at = now();

  -- Pessoas da equipe (membros ativos do escritório) que estão no organograma
  select coalesce(array_agg(distinct (n -> 'data' ->> 'perfil_id')::uuid), '{}')
    into equipe
    from jsonb_array_elements(p_nos) n
    join membros m on m.escritorio_id = esc and m.ativo and m.perfil_id::text = n -> 'data' ->> 'perfil_id'
   where n ->> 'type' = 'pessoa' and coalesce(n -> 'data' ->> 'perfil_id', '') <> '';

  insert into projeto_membros (projeto_id, perfil_id, escritorio_id)
  select proj, x, esc from unnest(equipe) x
  on conflict do nothing;

  -- Coordenador: pessoa da equipe ligada (em qualquer sentido) ao card de função "coordenacao"
  select coalesce(array_agg(distinct pid), '{}') into coords
    from (
      select (p -> 'data' ->> 'perfil_id')::uuid pid
        from jsonb_array_elements(p_nos) f
        join jsonb_array_elements(p_arestas) a
          on a ->> 'source' = f ->> 'id' or a ->> 'target' = f ->> 'id'
        join jsonb_array_elements(p_nos) p
          on p ->> 'id' = case when a ->> 'source' = f ->> 'id' then a ->> 'target' else a ->> 'source' end
       where f ->> 'type' = 'funcao' and f -> 'data' ->> 'papel' = 'coordenacao'
         and p ->> 'type' = 'pessoa' and coalesce(p -> 'data' ->> 'perfil_id', '') <> ''
    ) s
   where pid = any(equipe);

  if cardinality(coords) = 1 then
    novo_coord := coords[1];
    update projetos set coordenador_id = novo_coord where id = proj and coordenador_id is distinct from novo_coord;
  end if;

  return jsonb_build_object('equipe', cardinality(equipe), 'coordenador', novo_coord, 'coordenadores', cardinality(coords));
end $$;
grant execute on function public.salvar_organograma(uuid, jsonb, jsonb) to authenticated;

-- Projetos que já têm organograma (para "copiar estrutura de outro projeto")
create or replace function public.organogramas_disponiveis(proj uuid)
returns table (projeto_id uuid, codigo int, nome text, nos int)
language plpgsql stable security definer set search_path = public as $$
declare esc uuid;
begin
  select escritorio_id into esc from projetos where id = proj;
  if not coord_coordena(proj) then raise exception 'Sem permissão'; end if;
  return query
    select o.projeto_id, p.codigo, p.nome, jsonb_array_length(o.nos)
      from projeto_organogramas o join projetos p on p.id = o.projeto_id
     where o.escritorio_id = esc and o.projeto_id <> proj and jsonb_array_length(o.nos) > 0
     order by o.updated_at desc;
end $$;

create or replace function public.organograma_de(origem uuid, proj uuid)
returns table (nos jsonb, arestas jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not coord_coordena(proj) then raise exception 'Sem permissão'; end if;
  return query
    select o.nos, o.arestas from projeto_organogramas o
      join projetos a on a.id = o.projeto_id
      join projetos b on b.id = proj
     where o.projeto_id = origem and a.escritorio_id = b.escritorio_id;
end $$;
grant execute on function public.organogramas_disponiveis(uuid), public.organograma_de(uuid, uuid) to authenticated;

-- =========================================================
-- Contratação (legenda dos cards): quem contratou ou responde por cada pessoa/empresa
-- Editável por escritório. Cada categoria tem uma cor (selo e borda do card) e um estilo:
-- cheio | contorno | tracejado | cinza
-- =========================================================
create table if not exists public.org_contratacoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text not null,                 -- ex.: Contratado pelo cliente
  sigla text not null,                -- texto curto no selo do card
  estilo text not null default 'contorno' check (estilo in ('cheio','contorno','tracejado','cinza')),
  descricao text,
  cor text not null default '#16181d' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  ordem int not null default 0,
  ativo boolean not null default true,
  unique (escritorio_id, nome)
);
alter table public.org_contratacoes add column if not exists cor text not null default '#16181d';
alter table public.org_contratacoes enable row level security;
drop policy if exists orgc_ler on public.org_contratacoes;
create policy orgc_ler on public.org_contratacoes for select to authenticated
  using (eh_membro(escritorio_id)
         or exists (select 1 from coord_convidados c where c.escritorio_id = org_contratacoes.escritorio_id and c.perfil_id = auth.uid() and c.ativo));
drop policy if exists orgc_edit on public.org_contratacoes;
create policy orgc_edit on public.org_contratacoes for all to authenticated
  using (pode(escritorio_id, 'projetos', true)) with check (pode(escritorio_id, 'projetos', true));
grant select, insert, update, delete on public.org_contratacoes to authenticated;

insert into public.org_contratacoes (escritorio_id, nome, sigla, estilo, descricao, cor, ordem)
select e.id, t.nome, t.sigla, t.estilo, t.descricao, t.cor, t.ordem
  from public.escritorios e
  cross join (values
    ('Contratado pelo cliente', 'Cliente', 'cheio', 'Contrato direto entre o cliente e o profissional', '#2563eb', 1),
    ('Contratado EZE Gestão', 'EZE Gestão', 'cheio', 'Serviço vendido pela EZE: a EZE gerencia e responde pela entrega', '#16a34a', 2),
    ('Orçamento EZE Gestão', 'Orçamento', 'tracejado', 'Proposta da EZE em negociação com o cliente', '#d97706', 3),
    ('Equipe interna EZE', 'Interna', 'cheio', 'Profissional da equipe EZE', '#16181d', 4)
  ) as t(nome, sigla, estilo, descricao, cor, ordem)
on conflict (escritorio_id, nome) do nothing;

select 'ok' as resultado;
