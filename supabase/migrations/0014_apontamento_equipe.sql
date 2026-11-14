-- EZE Gestão · 0014 · Equipe interna cria apontamentos na Coordenação 3D
-- Antes: só o coordenador criava apontamentos.
-- Agora: qualquer pessoa da equipe interna com acesso ao projeto (coord_equipe) cria.
--   · O autor edita, define responsáveis e exclui o próprio apontamento enquanto não foi validado.
--   · Validar, reabrir e registrar decisão continuam só com o coordenador.
--   · Convidados (cliente, engenharia do cliente, projetistas) continuam sem criar.
-- Rodar uma vez no SQL Editor, depois da 0013. Pode rodar de novo sem problema.

-- Sou o autor (e ainda faço parte da equipe do projeto)
create or replace function public.coord_sou_autor(item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from coord_itens i
     where i.id = item and i.criado_por = auth.uid() and coord_equipe(i.projeto_id));
$$;
grant execute on function public.coord_sou_autor(uuid) to authenticated;

-- Itens
drop policy if exists citem_criar on public.coord_itens;
create policy citem_criar on public.coord_itens for insert to authenticated
  with check (coord_equipe(projeto_id));

drop policy if exists citem_mudar on public.coord_itens;
create policy citem_mudar on public.coord_itens for update to authenticated
  using (coord_coordena(projeto_id) or coord_sou_resp(id) or coord_sou_autor(id))
  with check (coord_coordena(projeto_id) or coord_sou_resp(id) or coord_sou_autor(id));

drop policy if exists citem_apagar on public.coord_itens;
create policy citem_apagar on public.coord_itens for delete to authenticated
  using (coord_coordena(projeto_id) or (coord_sou_autor(id) and status <> 'validado'));

-- Responsáveis: coordenador ou autor do apontamento
drop policy if exists cresp_edit on public.coord_responsaveis;
create policy cresp_edit on public.coord_responsaveis for all to authenticated
  using (exists (select 1 from coord_itens i where i.id = item_id
                  and (coord_coordena(i.projeto_id) or (coord_sou_autor(i.id) and i.status <> 'validado'))))
  with check (exists (select 1 from coord_itens i where i.id = item_id
                  and (coord_coordena(i.projeto_id) or (coord_sou_autor(i.id) and i.status <> 'validado'))));

-- Gatilho: autor sempre quem cria; regras de quem não coordena
create or replace function public.coord_item_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare autor boolean;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext(new.projeto_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero from coord_itens where projeto_id = new.projeto_id;
    select escritorio_id into new.escritorio_id from projetos where id = new.projeto_id;
    if auth.uid() is not null then new.criado_por := auth.uid(); end if;
    if new.status <> 'aberto' and auth.uid() is not null and not coord_coordena(new.projeto_id) then
      new.status := 'aberto';
    end if;
    return new;
  end if;
  new.updated_at := now();
  if auth.uid() is not null and not coord_coordena(old.projeto_id) then
    if new.projeto_id is distinct from old.projeto_id or new.numero is distinct from old.numero
       or new.criado_por is distinct from old.criado_por or new.escritorio_id is distinct from old.escritorio_id then
      raise exception 'Campo não pode ser alterado';
    end if;
    autor := old.criado_por = auth.uid() and coord_equipe(old.projeto_id);
    if old.status = 'validado' then
      raise exception 'Só o coordenador altera um apontamento validado';
    end if;
    if not autor then
      -- Responsável: só status
      if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
        raise exception 'Só o coordenador ou o autor altera o apontamento';
      end if;
    end if;
    if new.status is distinct from old.status then
      if new.status = 'validado' then
        raise exception 'Só o coordenador valida o apontamento';
      end if;
      if not autor and new.status not in ('em_correcao','respondido') then
        raise exception 'Só o coordenador reabre o apontamento';
      end if;
    end if;
  end if;
  if new.status = 'validado' and old.status <> 'validado' then new.fechado_em := now(); end if;
  if new.status <> 'validado' then new.fechado_em := null; end if;
  return new;
end $$;
