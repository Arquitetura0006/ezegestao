-- Lugares fora do escritório (em trânsito, em viagem, em obra): a pessoa segue alcançável.
alter table public.ambientes drop constraint if exists ambientes_tipo_check;
alter table public.ambientes add constraint ambientes_tipo_check check (tipo in ('sala','reuniao','recepcao','jardim','projetos','fora'));

with e as (select id from public.escritorios where slug = 'eze')
insert into public.ambientes (escritorio_id, chave, nome, tipo, ordem)
select e.id, v.chave, v.nome, 'fora', v.ordem from e, (values
  ('transito','Em trânsito',20),('viagem','Em viagem',21),('obra','Em obra ou visita',22)
) as v(chave, nome, ordem)
on conflict (escritorio_id, chave) do nothing;
