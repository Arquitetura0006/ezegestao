-- EZE Gestão · 0010 · Coordenação de projetos (IFC + apontamentos)
-- Ambiente único de coordenação por projeto: modelos IFC por disciplina (com revisões),
-- apontamentos ancorados no modelo, conversa por apontamento e convidados externos.
--
-- Regras (decisões do Eze, 05/11/2026):
-- - Só o coordenador cria, edita e valida apontamentos. Coordenador = quem tem Projetos › editar
--   (Dono/Administrador incluídos) ou o coordenador do projeto.
-- - Responsáveis (equipe ou convidados) mudam só o status: Em correção / Respondido.
-- - Convidados (cliente, engenharia do cliente, projetistas) não são membros do escritório:
--   veem só o projeto em que foram convidados, os modelos liberados e os apontamentos compartilhados.
-- - Etapas vêm de Cadastros › Processo EZE (as do Desker, editáveis). Tipos editáveis aqui.
-- Rodar uma vez no SQL Editor. Pode rodar de novo sem problema.

-- =========================================================
-- 1. Tabelas
-- =========================================================
create table if not exists public.coord_tipos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text not null,
  ordem int not null default 0,
  ativo boolean not null default true,
  unique (escritorio_id, nome)
);

create table if not exists public.coord_modelos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  disciplina_id uuid references public.disciplinas(id) on delete set null,
  nome text not null,                       -- ex.: Arquitetura, Estrutura
  ordem int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists cmod_proj on public.coord_modelos (projeto_id, ordem);

create table if not exists public.coord_revisoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  modelo_id uuid not null references public.coord_modelos(id) on delete cascade,
  numero int not null default 0,            -- R00, R01…
  arquivo text not null,                    -- nome original do IFC
  ifc_caminho text not null,                -- Storage: original
  frag_caminho text,                        -- Storage: convertido (abre rápido)
  tamanho bigint,
  nota text,
  enviado_por uuid references public.perfis(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (modelo_id, numero)
);

create table if not exists public.coord_convidados (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  email text not null,
  nome text,
  empresa text,
  funcao text not null default 'cliente' check (funcao in ('cliente','eng_cliente','projetista','outro')),
  modelos uuid[] not null default '{}',     -- vazio = todos os modelos do projeto
  perfil_id uuid references public.perfis(id) on delete set null,
  ativo boolean not null default true,
  convidado_por uuid references public.perfis(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (projeto_id, email)
);
create index if not exists cconv_perfil on public.coord_convidados (perfil_id) where perfil_id is not null;

create table if not exists public.coord_itens (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  numero int not null default 0,
  titulo text not null,
  descricao text,
  modelo_id uuid references public.coord_modelos(id) on delete set null,   -- disciplina
  revisao_id uuid references public.coord_revisoes(id) on delete set null,
  etapa text,                                -- sigla (Cadastros › Processo EZE)
  tipo text,
  prioridade text not null default 'media' check (prioridade in ('baixa','media','alta','critica')),
  prazo date,
  status text not null default 'aberto' check (status in ('aberto','em_correcao','respondido','validado')),
  interno boolean not null default false,    -- só a equipe EZE vê
  camera jsonb,                              -- {p:[x,y,z], t:[x,y,z]}
  ponto jsonb,                               -- [x,y,z]
  elemento jsonb,                            -- {modelo, localId, nome, categoria, guid}
  print_caminho text,
  visiveis uuid[] not null default '{}',     -- modelos visíveis quando o apontamento foi criado
  criado_por uuid references public.perfis(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fechado_em timestamptz,
  unique (projeto_id, numero)
);
create index if not exists citem_proj on public.coord_itens (projeto_id, status, numero desc);

create table if not exists public.coord_responsaveis (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  item_id uuid not null references public.coord_itens(id) on delete cascade,
  perfil_id uuid references public.perfis(id) on delete cascade,
  convidado_id uuid references public.coord_convidados(id) on delete cascade,
  check ((perfil_id is null) <> (convidado_id is null))
);
create unique index if not exists cresp_perfil on public.coord_responsaveis (item_id, perfil_id) where perfil_id is not null;
create unique index if not exists cresp_conv on public.coord_responsaveis (item_id, convidado_id) where convidado_id is not null;

create table if not exists public.coord_mensagens (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  item_id uuid not null references public.coord_itens(id) on delete cascade,
  autor_id uuid references public.perfis(id) on delete set null default auth.uid(),
  tipo text not null default 'msg' check (tipo in ('msg','status','decisao')),
  texto text not null,
  anexo_caminho text,
  anexo_nome text,
  created_at timestamptz not null default now()
);
create index if not exists cmsg_item on public.coord_mensagens (item_id, created_at);

-- =========================================================
-- 2. Quem pode o quê (security definer: não recursa no RLS)
-- =========================================================
create or replace function public.coord_coordena(proj uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare esc uuid; coord uuid;
begin
  select escritorio_id, coordenador_id into esc, coord from projetos where id = proj;
  if esc is null then return false; end if;
  return pode(esc, 'projetos', true) or (coord = auth.uid() and eh_membro(esc));
end $$;

-- Equipe do escritório com acesso ao projeto
create or replace function public.coord_equipe(proj uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare esc uuid;
begin
  select escritorio_id into esc from projetos where id = proj;
  if esc is null or not eh_membro(esc) then return false; end if;
  return pode(esc, 'projetos') or eh_do_projeto(proj) or coord_coordena(proj);
end $$;

create or replace function public.coord_convite(proj uuid) returns public.coord_convidados
language sql stable security definer set search_path = public as $$
  select * from coord_convidados where projeto_id = proj and perfil_id = auth.uid() and ativo limit 1;
$$;

create or replace function public.coord_ve(proj uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coord_equipe(proj) or (coord_convite(proj)).id is not null;
$$;

create or replace function public.coord_ve_modelo(modelo uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare proj uuid; c coord_convidados;
begin
  select m.projeto_id into proj from coord_modelos m where m.id = modelo;
  if proj is null then return false; end if;
  if coord_equipe(proj) then return true; end if;
  c := coord_convite(proj);
  return c.id is not null and (cardinality(c.modelos) = 0 or modelo = any(c.modelos));
end $$;

create or replace function public.coord_sou_resp(item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from coord_responsaveis r
      left join coord_convidados c on c.id = r.convidado_id
     where r.item_id = item
       and (r.perfil_id = auth.uid() or (c.perfil_id = auth.uid() and c.ativo)));
$$;

create or replace function public.coord_ve_item(item uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare i coord_itens;
begin
  select * into i from coord_itens where id = item;
  if i.id is null then return false; end if;
  if coord_equipe(i.projeto_id) then return true; end if;
  if i.interno or (coord_convite(i.projeto_id)).id is null then return false; end if;
  return i.modelo_id is null or coord_ve_modelo(i.modelo_id) or coord_sou_resp(item);
end $$;

grant execute on function public.coord_coordena(uuid), public.coord_equipe(uuid), public.coord_ve(uuid),
  public.coord_ve_modelo(uuid), public.coord_sou_resp(uuid), public.coord_ve_item(uuid) to authenticated;

-- =========================================================
-- 3. Políticas
-- =========================================================
alter table public.coord_tipos enable row level security;
alter table public.coord_modelos enable row level security;
alter table public.coord_revisoes enable row level security;
alter table public.coord_convidados enable row level security;
alter table public.coord_itens enable row level security;
alter table public.coord_responsaveis enable row level security;
alter table public.coord_mensagens enable row level security;

drop policy if exists ctipo_ler on public.coord_tipos;
create policy ctipo_ler on public.coord_tipos for select to authenticated using (eh_membro(escritorio_id));
drop policy if exists ctipo_edit on public.coord_tipos;
create policy ctipo_edit on public.coord_tipos for all to authenticated
  using (pode(escritorio_id, 'projetos', true)) with check (pode(escritorio_id, 'projetos', true));

drop policy if exists cmod_ler on public.coord_modelos;
create policy cmod_ler on public.coord_modelos for select to authenticated using (coord_ve_modelo(id));
drop policy if exists cmod_edit on public.coord_modelos;
create policy cmod_edit on public.coord_modelos for all to authenticated
  using (coord_coordena(projeto_id)) with check (coord_coordena(projeto_id));

drop policy if exists crev_ler on public.coord_revisoes;
create policy crev_ler on public.coord_revisoes for select to authenticated using (coord_ve_modelo(modelo_id));
drop policy if exists crev_edit on public.coord_revisoes;
create policy crev_edit on public.coord_revisoes for all to authenticated
  using (coord_coordena(projeto_id)) with check (coord_coordena(projeto_id));

drop policy if exists cconv_ler on public.coord_convidados;
create policy cconv_ler on public.coord_convidados for select to authenticated
  using (coord_equipe(projeto_id) or perfil_id = auth.uid());
drop policy if exists cconv_edit on public.coord_convidados;
create policy cconv_edit on public.coord_convidados for all to authenticated
  using (coord_coordena(projeto_id)) with check (coord_coordena(projeto_id));

drop policy if exists citem_ler on public.coord_itens;
create policy citem_ler on public.coord_itens for select to authenticated using (
  coord_equipe(projeto_id)
  or (not interno and (coord_convite(projeto_id)).id is not null
      and (modelo_id is null or coord_ve_modelo(modelo_id) or coord_sou_resp(id))));
drop policy if exists citem_criar on public.coord_itens;
create policy citem_criar on public.coord_itens for insert to authenticated with check (coord_coordena(projeto_id));
drop policy if exists citem_mudar on public.coord_itens;
create policy citem_mudar on public.coord_itens for update to authenticated
  using (coord_coordena(projeto_id) or coord_sou_resp(id))
  with check (coord_coordena(projeto_id) or coord_sou_resp(id));
drop policy if exists citem_apagar on public.coord_itens;
create policy citem_apagar on public.coord_itens for delete to authenticated using (coord_coordena(projeto_id));

drop policy if exists cresp_ler on public.coord_responsaveis;
create policy cresp_ler on public.coord_responsaveis for select to authenticated using (coord_ve_item(item_id));
drop policy if exists cresp_edit on public.coord_responsaveis;
create policy cresp_edit on public.coord_responsaveis for all to authenticated
  using (exists (select 1 from coord_itens i where i.id = item_id and coord_coordena(i.projeto_id)))
  with check (exists (select 1 from coord_itens i where i.id = item_id and coord_coordena(i.projeto_id)));

drop policy if exists cmsg_ler on public.coord_mensagens;
create policy cmsg_ler on public.coord_mensagens for select to authenticated using (coord_ve_item(item_id));
drop policy if exists cmsg_criar on public.coord_mensagens;
create policy cmsg_criar on public.coord_mensagens for insert to authenticated
  with check (autor_id = auth.uid() and tipo <> 'status' and coord_ve_item(item_id)
              and (tipo = 'msg' or coord_coordena(projeto_id)));
drop policy if exists cmsg_apagar on public.coord_mensagens;
create policy cmsg_apagar on public.coord_mensagens for delete to authenticated
  using (autor_id = auth.uid() and tipo = 'msg');

grant select, insert, update, delete on public.coord_tipos, public.coord_modelos, public.coord_revisoes,
  public.coord_convidados, public.coord_itens, public.coord_responsaveis, public.coord_mensagens to authenticated;

-- =========================================================
-- 4. Gatilhos: número do apontamento, trava de quem não coordena, histórico de status
-- =========================================================
create or replace function public.coord_item_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext(new.projeto_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero from coord_itens where projeto_id = new.projeto_id;
    select escritorio_id into new.escritorio_id from projetos where id = new.projeto_id;
    return new;
  end if;
  new.updated_at := now();
  if auth.uid() is not null and not coord_coordena(old.projeto_id) then
    -- Responsável: só status, e só para Em correção ou Respondido
    if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
      raise exception 'Só o coordenador altera o apontamento';
    end if;
    if new.status not in ('em_correcao','respondido') or old.status = 'validado' then
      raise exception 'Só o coordenador valida ou reabre o apontamento';
    end if;
  end if;
  if new.status = 'validado' and old.status <> 'validado' then new.fechado_em := now(); end if;
  if new.status <> 'validado' then new.fechado_em := null; end if;
  return new;
end $$;
drop trigger if exists coord_item_antes on public.coord_itens;
create trigger coord_item_antes before insert or update on public.coord_itens
  for each row execute function public.coord_item_antes();

create or replace function public.coord_item_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare rot text;
begin
  if new.status is distinct from old.status then
    rot := case new.status when 'aberto' then 'Reaberto' when 'em_correcao' then 'Em correção'
                           when 'respondido' then 'Respondido' else 'Validado' end;
    insert into coord_mensagens (escritorio_id, projeto_id, item_id, autor_id, tipo, texto)
      values (new.escritorio_id, new.projeto_id, new.id, auth.uid(), 'status', rot);
  end if;
  return new;
end $$;
drop trigger if exists coord_item_depois on public.coord_itens;
create trigger coord_item_depois after update on public.coord_itens
  for each row execute function public.coord_item_depois();

-- Escritório sempre o do projeto (evita gravar dado em outro escritório)
create or replace function public.coord_esc_do_projeto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select escritorio_id into new.escritorio_id from projetos where id = new.projeto_id;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['coord_modelos','coord_revisoes','coord_convidados','coord_mensagens'] loop
    execute format('drop trigger if exists %1$s_esc on public.%1$s', t);
    execute format('create trigger %1$s_esc before insert on public.%1$s for each row execute function public.coord_esc_do_projeto()', t);
  end loop;
end $$;

create or replace function public.coord_resp_esc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select escritorio_id into new.escritorio_id from coord_itens where id = new.item_id;
  return new;
end $$;
drop trigger if exists coord_responsaveis_esc on public.coord_responsaveis;
create trigger coord_responsaveis_esc before insert on public.coord_responsaveis
  for each row execute function public.coord_resp_esc();

-- E-mail do convidado sempre em minúsculas
create or replace function public.coord_conv_email() returns trigger
language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  return new;
end $$;
drop trigger if exists coord_conv_email on public.coord_convidados;
create trigger coord_conv_email before insert or update on public.coord_convidados
  for each row execute function public.coord_conv_email();

-- =========================================================
-- 5. Funções para a tela (convidados não leem projetos nem perfis direto)
-- =========================================================
-- Liga o convite ao login (chamar ao entrar)
create or replace function public.coord_aplicar_convites() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; em text;
begin
  select lower(email) into em from auth.users where id = auth.uid();
  if em is null then return 0; end if;
  insert into perfis (id, email) values (auth.uid(), em) on conflict (id) do nothing;
  update coord_convidados set perfil_id = auth.uid() where email = em and perfil_id is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Projetos que a pessoa coordena, participa ou foi convidada (com pendências)
create or replace function public.coord_meus_projetos()
returns table (id uuid, codigo int, nome text, escritorio text, cliente text, como text,
               abertos bigint, meus bigint, modelos bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.codigo, p.nome, e.nome, cl.nome,
         case when coord_coordena(p.id) then 'coordenador' when coord_equipe(p.id) then 'equipe' else 'convidado' end,
         (select count(*) from coord_itens i where i.projeto_id = p.id and i.status <> 'validado' and coord_ve_item(i.id)),
         (select count(*) from coord_itens i where i.projeto_id = p.id and i.status in ('aberto','em_correcao') and coord_sou_resp(i.id)),
         (select count(*) from coord_modelos m where m.projeto_id = p.id)
    from projetos p
    join escritorios e on e.id = p.escritorio_id
    left join clientes cl on cl.id = p.cliente_id
   where p.ativo
     and (exists (select 1 from coord_convidados c where c.projeto_id = p.id and c.perfil_id = auth.uid() and c.ativo)
          or (coord_equipe(p.id) and exists (select 1 from coord_modelos m where m.projeto_id = p.id)))
   order by 8 desc, p.nome;
$$;

-- Cabeçalho da tela de coordenação
create or replace function public.coord_projeto(proj uuid)
returns table (id uuid, codigo int, nome text, escritorio_id uuid, escritorio text, cliente text,
               coordena boolean, equipe boolean, convidado boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not coord_ve(proj) then raise exception 'Sem acesso a este projeto'; end if;
  return query
    select p.id, p.codigo, p.nome, p.escritorio_id, e.nome, cl.nome,
           coord_coordena(p.id), coord_equipe(p.id), (coord_convite(p.id)).id is not null
      from projetos p
      join escritorios e on e.id = p.escritorio_id
      left join clientes cl on cl.id = p.cliente_id
     where p.id = proj;
end $$;

-- Pessoas do projeto: equipe EZE com acesso + convidados (para nomes, fotos e responsáveis)
create or replace function public.coord_pessoas(proj uuid)
returns table (perfil_id uuid, convidado_id uuid, nome text, foto text, email text, empresa text, grupo text)
language plpgsql stable security definer set search_path = public as $$
declare esc uuid; eq boolean;
begin
  if not coord_ve(proj) then raise exception 'Sem acesso a este projeto'; end if;
  select escritorio_id into esc from projetos where id = proj;
  eq := coord_equipe(proj);
  return query
    select pf.id, null::uuid, coalesce(pf.nome, pf.email), pf.foto_url, case when eq then pf.email end, e.nome, 'equipe'
      from membros m join perfis pf on pf.id = m.perfil_id join escritorios e on e.id = m.escritorio_id
     where m.escritorio_id = esc and m.ativo and m.papel <> 'recepcao'
       and (eq or m.papel in ('dono','admin') or exists (select 1 from projeto_membros pm where pm.projeto_id = proj and pm.perfil_id = m.perfil_id)
            or exists (select 1 from projetos p where p.id = proj and p.coordenador_id = m.perfil_id))
    union all
    select c.perfil_id, c.id, coalesce(nullif(c.nome, ''), pf.nome, c.email), pf.foto_url, c.email, c.empresa, c.funcao
      from coord_convidados c left join perfis pf on pf.id = c.perfil_id
     where c.projeto_id = proj and c.ativo;
end $$;

grant execute on function public.coord_aplicar_convites(), public.coord_meus_projetos(),
  public.coord_projeto(uuid), public.coord_pessoas(uuid) to authenticated;

-- =========================================================
-- 6. Tipos padrão (editáveis em Coordenação › Ajustes)
-- =========================================================
insert into public.coord_tipos (escritorio_id, nome, ordem)
select e.id, t.nome, t.ordem
  from public.escritorios e
  cross join (values ('Incompatibilidade', 1), ('Falta de informação', 2), ('Dúvida', 3),
                     ('Solicitação do cliente', 4), ('Erro de desenho', 5)) as t(nome, ordem)
on conflict (escritorio_id, nome) do nothing;

-- =========================================================
-- 7. Arquivos (bucket privado "coordenacao")
-- Caminhos: escritorio/projeto/modelos/<modelo>/<arquivo>  ·  escritorio/projeto/itens/<item>/<arquivo>
-- Limite por arquivo: 500 MB (confira também o limite global em Storage › Settings)
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('coordenacao', 'coordenacao', false, 524288000)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- modo: 'ler' | 'enviar' | 'apagar'
drop function if exists public.coord_arquivo_ok(text, boolean);
create or replace function public.coord_arquivo_ok(caminho text, modo text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare partes text[]; proj uuid; alvo uuid;
begin
  partes := string_to_array(caminho, '/');
  if coalesce(array_length(partes, 1), 0) < 5 then return false; end if;
  begin
    proj := partes[2]::uuid;
    alvo := partes[4]::uuid;
  exception when others then
    return false;
  end;
  if not exists (select 1 from projetos where id = proj and escritorio_id::text = partes[1]) then return false; end if;
  if modo = 'apagar' then return coord_coordena(proj); end if;
  if partes[3] = 'modelos' then
    if modo = 'enviar' then return coord_coordena(proj); end if;
    return coord_ve_modelo(alvo);
  elsif partes[3] = 'itens' then
    return coord_ve_item(alvo);
  end if;
  return false;
end $$;
grant execute on function public.coord_arquivo_ok(text, text) to authenticated;

drop policy if exists coord_arq_ler on storage.objects;
create policy coord_arq_ler on storage.objects for select to authenticated
  using (bucket_id = 'coordenacao' and public.coord_arquivo_ok(name, 'ler'));
drop policy if exists coord_arq_enviar on storage.objects;
create policy coord_arq_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'coordenacao' and public.coord_arquivo_ok(name, 'enviar'));
drop policy if exists coord_arq_apagar on storage.objects;
create policy coord_arq_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'coordenacao' and public.coord_arquivo_ok(name, 'apagar'));

-- =========================================================
-- 8. Tempo real
-- =========================================================
do $$ begin alter publication supabase_realtime add table public.coord_itens; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.coord_mensagens; exception when duplicate_object then null; end $$;

select 'ok' as resultado;
