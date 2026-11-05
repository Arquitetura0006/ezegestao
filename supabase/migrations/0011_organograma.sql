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

select 'ok' as resultado;
