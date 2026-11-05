-- EZE Gestão · 0009 · Pessoas: permissões por módulo, centro de custos e documentos
-- Página de cada pessoa no padrão do Desker (Lista, Métricas, Timesheet, Calendário,
-- Quadro, Timeline, Centro de Custos, Documentos, Permissões).
--
-- Permissões: cada membro ganha um mapa módulo → 'ver' | 'editar'. As regras novas
-- só SOMAM acesso às que já existem (políticas permissivas): quem não tiver nada
-- marcado continua exatamente como hoje. Dono e Administrador continuam com tudo
-- (o financeiro segue exigindo permissão própria, como na 0008).
-- Módulos: equipe, comercial, projetos, planejamento, horas, financeiro, padroes,
-- sensiveis (valores/hora e custos).
-- Rodar uma vez no SQL Editor. Pode rodar de novo sem problema.

-- =========================================================
-- 1. Permissões
-- =========================================================
alter table public.membros add column if not exists permissoes jsonb not null default '{}'::jsonb;

create or replace function public.pode(esc uuid, modulo text, editar boolean default false) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from membros m
     where m.escritorio_id = esc and m.perfil_id = auth.uid() and m.ativo
       and (
         m.papel = 'dono'
         or (m.papel = 'admin' and modulo <> 'financeiro')
         or (modulo = 'financeiro' and m.acesso_financeiro)
         or m.permissoes ->> modulo = 'editar'
         or (not editar and m.permissoes ->> modulo = 'ver')
       ));
$$;
grant execute on function public.pode(uuid, text, boolean) to authenticated;

-- Financeiro: ler com 'ver', gravar com 'editar' (acesso_financeiro antigo = editar)
create or replace function public.pode_financeiro(esc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pode(esc, 'financeiro', false);
$$;

do $$ declare t text; begin
  foreach t in array array['caixas','fin_categorias','fornecedores','lancamentos'] loop
    execute format('drop policy if exists %1$s_fin on public.%1$s', t);
    execute format('drop policy if exists %1$s_fin_ler on public.%1$s', t);
    execute format('drop policy if exists %1$s_fin_ins on public.%1$s', t);
    execute format('drop policy if exists %1$s_fin_upd on public.%1$s', t);
    execute format('drop policy if exists %1$s_fin_del on public.%1$s', t);
    execute format('create policy %1$s_fin_ler on public.%1$s for select to authenticated using (pode(escritorio_id, ''financeiro''))', t);
    execute format('create policy %1$s_fin_ins on public.%1$s for insert to authenticated with check (pode(escritorio_id, ''financeiro'', true))', t);
    execute format('create policy %1$s_fin_upd on public.%1$s for update to authenticated using (pode(escritorio_id, ''financeiro'', true)) with check (pode(escritorio_id, ''financeiro'', true))', t);
    execute format('create policy %1$s_fin_del on public.%1$s for delete to authenticated using (pode(escritorio_id, ''financeiro'', true))', t);
  end loop;
end $$;

-- Equipe (editar): convidar e ajustar cadastro. Papel, permissões e financeiro
-- continuam só com Dono/Administrador (trava abaixo).
drop policy if exists convites_equipe on public.convites;
create policy convites_equipe on public.convites for all to authenticated
  using (pode(escritorio_id, 'equipe', true))
  with check (pode(escritorio_id, 'equipe', true) and (papel not in ('dono','admin') or eh_admin(escritorio_id)));
drop policy if exists membros_equipe on public.membros;
create policy membros_equipe on public.membros for update to authenticated
  using (pode(escritorio_id, 'equipe', true)) with check (pode(escritorio_id, 'equipe', true));

create or replace function public.membro_trava() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or eh_admin(new.escritorio_id) then return new; end if;
  if old.papel in ('dono','admin')
     or new.papel is distinct from old.papel
     or new.permissoes is distinct from old.permissoes
     or new.acesso_financeiro is distinct from old.acesso_financeiro then
    raise exception 'Só Dono ou Administrador muda papel e permissões';
  end if;
  return new;
end $$;
drop trigger if exists membro_trava on public.membros;
create trigger membro_trava before update on public.membros for each row execute function public.membro_trava();

-- Comercial
drop policy if exists prop_perm_ler on public.propostas;
create policy prop_perm_ler on public.propostas for select to authenticated using (pode(escritorio_id, 'comercial'));
drop policy if exists prop_perm_edit on public.propostas;
create policy prop_perm_edit on public.propostas for all to authenticated using (pode(escritorio_id, 'comercial', true)) with check (pode(escritorio_id, 'comercial', true));
drop policy if exists pativ_perm_ler on public.proposta_atividades;
create policy pativ_perm_ler on public.proposta_atividades for select to authenticated using (pode(escritorio_id, 'comercial'));
drop policy if exists pativ_perm_edit on public.proposta_atividades;
create policy pativ_perm_edit on public.proposta_atividades for all to authenticated using (pode(escritorio_id, 'comercial', true)) with check (pode(escritorio_id, 'comercial', true));
drop policy if exists clientes_perm_edit on public.clientes;
create policy clientes_perm_edit on public.clientes for all to authenticated
  using (pode(escritorio_id, 'comercial', true) or pode(escritorio_id, 'projetos', true))
  with check (pode(escritorio_id, 'comercial', true) or pode(escritorio_id, 'projetos', true));

-- Projetos (e o que pertence a eles)
drop policy if exists proj_perm_ler on public.projetos;
create policy proj_perm_ler on public.projetos for select to authenticated using (pode(escritorio_id, 'projetos') or pode(escritorio_id, 'planejamento'));
drop policy if exists proj_perm_edit on public.projetos;
create policy proj_perm_edit on public.projetos for all to authenticated using (pode(escritorio_id, 'projetos', true)) with check (pode(escritorio_id, 'projetos', true));
do $$ declare t text; begin
  foreach t in array array['projeto_etapas','projeto_membros','tarefas','checklist_itens'] loop
    execute format('drop policy if exists %1$s_perm_ler on public.%1$s', t);
    execute format('create policy %1$s_perm_ler on public.%1$s for select to authenticated using (pode(escritorio_id, ''projetos'') or pode(escritorio_id, ''planejamento''))', t);
    execute format('drop policy if exists %1$s_perm_edit on public.%1$s', t);
    execute format('create policy %1$s_perm_edit on public.%1$s for all to authenticated using (pode(escritorio_id, ''projetos'', true) or pode(escritorio_id, ''planejamento'', true)) with check (pode(escritorio_id, ''projetos'', true) or pode(escritorio_id, ''planejamento'', true))', t);
  end loop;
end $$;
drop policy if exists rec_perm_ler on public.recados;
create policy rec_perm_ler on public.recados for select to authenticated using (pode(escritorio_id, 'projetos'));
drop policy if exists rec_perm_criar on public.recados;
create policy rec_perm_criar on public.recados for insert to authenticated with check (autor_id = auth.uid() and pode(escritorio_id, 'projetos'));

-- Horas
drop policy if exists ap_perm_ler on public.apontamentos;
create policy ap_perm_ler on public.apontamentos for select to authenticated using (pode(escritorio_id, 'horas'));
drop policy if exists ap_perm_edit on public.apontamentos;
create policy ap_perm_edit on public.apontamentos for all to authenticated using (pode(escritorio_id, 'horas', true)) with check (pode(escritorio_id, 'horas', true));

-- Dados sensíveis: valor/hora
drop policy if exists vh_sensiveis on public.valores_hora;
create policy vh_sensiveis on public.valores_hora for select to authenticated using (pode(escritorio_id, 'sensiveis'));

-- Padrões (treinamento e manual)
do $$ declare t text; begin
  foreach t in array array['habilidades','trilhas','aulas','manual_docs'] loop
    execute format('drop policy if exists %1$s_perm_edit on public.%1$s', t);
    execute format('create policy %1$s_perm_edit on public.%1$s for all to authenticated using (pode(escritorio_id, ''padroes'', true)) with check (pode(escritorio_id, ''padroes'', true))', t);
  end loop;
end $$;

-- Funções que olhavam só "admin" passam a respeitar as permissões
create or replace function public.horas_projeto(proj uuid)
returns table (tarefa_id uuid, perfil_id uuid, pessoa text, minutos bigint, custo numeric)
language plpgsql stable security definer set search_path = public as $$
declare esc uuid; sens boolean;
begin
  select escritorio_id into esc from projetos where id = proj;
  if not (pode(esc, 'projetos') or pode(esc, 'horas') or eh_do_projeto(proj)) then raise exception 'Sem permissão'; end if;
  sens := pode(esc, 'sensiveis');
  return query
    select a.tarefa_id, a.perfil_id, coalesce(pf.nome, a.pessoa_nome), sum(a.minutos)::bigint,
           case when sens then round(sum(a.minutos / 60.0 * coalesce(a.valor_hora, 0)), 2) end
    from apontamentos a left join perfis pf on pf.id = a.perfil_id
    where a.projeto_id = proj
    group by a.tarefa_id, a.perfil_id, coalesce(pf.nome, a.pessoa_nome);
end $$;

create or replace function public.horas_periodo(esc uuid, de date, ate date)
returns table (projeto_id uuid, perfil_id uuid, pessoa text, minutos bigint, custo numeric)
language plpgsql stable security definer set search_path = public as $$
declare sens boolean;
begin
  if not pode(esc, 'horas') then raise exception 'Sem permissão'; end if;
  sens := pode(esc, 'sensiveis');
  return query
    select a.projeto_id, a.perfil_id, coalesce(pf.nome, a.pessoa_nome), sum(a.minutos)::bigint,
           case when sens then round(sum(a.minutos / 60.0 * coalesce(a.valor_hora, 0)), 2) end
    from apontamentos a left join perfis pf on pf.id = a.perfil_id
    where a.escritorio_id = esc and a.data between de and ate
    group by a.projeto_id, a.perfil_id, coalesce(pf.nome, a.pessoa_nome);
end $$;

create or replace function public.custo_projetos(esc uuid)
returns table (projeto_id uuid, minutos bigint, custo numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not pode(esc, 'sensiveis') then raise exception 'Sem permissão'; end if;
  return query
    select a.projeto_id, sum(a.minutos)::bigint, round(sum(a.minutos / 60.0 * coalesce(a.valor_hora, 0)), 2)
    from apontamentos a where a.escritorio_id = esc and a.projeto_id is not null
    group by a.projeto_id;
end $$;

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
  if esc is null or not (pode(esc, 'projetos', true) or pode(esc, 'comercial', true)) then raise exception 'Sem permissão'; end if;
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

create or replace function public.aprovar_proposta(prop uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare p propostas; proj uuid;
begin
  select * into p from propostas where id = prop;
  if p.id is null or not pode(p.escritorio_id, 'comercial', true) then raise exception 'Sem permissão'; end if;
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

-- =========================================================
-- 2. Centro de custos: liga a pessoa ao cadastro dela no financeiro
-- =========================================================
alter table public.fornecedores add column if not exists perfil_id uuid references public.perfis(id) on delete set null;
create unique index if not exists forn_perfil on public.fornecedores (escritorio_id, perfil_id) where perfil_id is not null;

-- Liga automaticamente quem tem o mesmo e-mail ou o mesmo nome (só onde ainda não há vínculo)
update public.fornecedores f set perfil_id = x.perfil_id
  from (
    select distinct on (y.id) y.id, y.perfil_id from (
      select distinct on (m.perfil_id) f2.id, m.perfil_id
        from public.fornecedores f2
        join public.membros m on m.escritorio_id = f2.escritorio_id
        join public.perfis p on p.id = m.perfil_id
       where f2.perfil_id is null
         and ((f2.email is not null and lower(f2.email) = lower(p.email))
              or (p.nome is not null and lower(trim(f2.nome)) = lower(trim(p.nome))))
       order by m.perfil_id, (lower(f2.email) = lower(p.email)) desc nulls last, f2.created_at
    ) y order by y.id
  ) x
 where f.id = x.id
   and not exists (select 1 from public.fornecedores o where o.escritorio_id = f.escritorio_id and o.perfil_id = x.perfil_id);

-- =========================================================
-- 3. Documentos da pessoa (contrato, documentos pessoais, certificados)
-- Arquivos no Storage (bucket privado "pessoas"), caminho: escritorio/pessoa/arquivo
-- Quem vê: a própria pessoa e quem tem Equipe › editar (Dono/Administrador incluídos)
-- =========================================================
create table if not exists public.pessoa_documentos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  nome text not null,
  tipo text not null default 'outro' check (tipo in ('contrato','pessoal','certificado','outro')),
  caminho text,          -- arquivo no Storage
  link text,             -- ou link externo (Drive)
  tamanho bigint,
  criado_por uuid references public.perfis(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (caminho is not null or link is not null)
);
create index if not exists pdoc_pessoa on public.pessoa_documentos (escritorio_id, perfil_id, created_at desc);
alter table public.pessoa_documentos enable row level security;
drop policy if exists pdoc_ler on public.pessoa_documentos;
create policy pdoc_ler on public.pessoa_documentos for select to authenticated
  using ((perfil_id = auth.uid() and eh_membro(escritorio_id)) or pode(escritorio_id, 'equipe', true));
drop policy if exists pdoc_editar on public.pessoa_documentos;
create policy pdoc_editar on public.pessoa_documentos for all to authenticated
  using (pode(escritorio_id, 'equipe', true)) with check (pode(escritorio_id, 'equipe', true));
grant select, insert, update, delete on public.pessoa_documentos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('pessoas', 'pessoas', false, 52428800)
on conflict (id) do nothing;

-- Confere o caminho "escritorio/pessoa/arquivo" sem quebrar com nomes inválidos
create or replace function public.doc_pessoa_ok(caminho text, escrever boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare partes text[]; esc uuid; pessoa uuid;
begin
  partes := string_to_array(caminho, '/');
  if coalesce(array_length(partes, 1), 0) < 3 then return false; end if;
  begin
    esc := partes[1]::uuid;
    pessoa := partes[2]::uuid;
  exception when others then
    return false;
  end;
  if pode(esc, 'equipe', true) then return true; end if;
  return not escrever and pessoa = auth.uid() and eh_membro(esc);
end $$;
grant execute on function public.doc_pessoa_ok(text, boolean) to authenticated;

drop policy if exists pessoas_ler on storage.objects;
create policy pessoas_ler on storage.objects for select to authenticated
  using (bucket_id = 'pessoas' and public.doc_pessoa_ok(name, false));
drop policy if exists pessoas_enviar on storage.objects;
create policy pessoas_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'pessoas' and public.doc_pessoa_ok(name, true));
drop policy if exists pessoas_apagar on storage.objects;
create policy pessoas_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'pessoas' and public.doc_pessoa_ok(name, true));

select 'ok' as resultado;
