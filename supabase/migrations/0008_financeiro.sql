-- EZE Gestão · 0008 · Financeiro (só da EZE Arquitetura)
-- Caixas, plano de contas em dois níveis com linha de DRE, fornecedores/Partners,
-- lançamentos (receita, despesa, transferência) com parcelas e recorrência,
-- ligados a projeto e caixa. Acesso por permissão própria: dono + quem tiver
-- acesso_financeiro (decisão do Eze: ele e o Gilson).

alter table public.membros add column if not exists acesso_financeiro boolean not null default false;

create or replace function public.pode_financeiro(esc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from membros where escritorio_id = esc and perfil_id = auth.uid() and ativo
                 and (papel = 'dono' or acesso_financeiro));
$$;
grant execute on function public.pode_financeiro(uuid) to authenticated;

-- Quem cuida do financeiro precisa ver todos os projetos para ligar os lançamentos
drop policy if exists proj_fin_ler on public.projetos;
create policy proj_fin_ler on public.projetos for select to authenticated using (pode_financeiro(escritorio_id));

-- =========================================================
-- Cadastros do financeiro
-- =========================================================
create table if not exists public.caixas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text not null,
  tipo text not null default 'banco' check (tipo in ('banco','dinheiro','investimento','cartao')),
  banco text,
  saldo_inicial numeric not null default 0,
  saldo_inicial_em date not null default current_date,
  ativo boolean not null default true,
  ordem int not null default 0,
  unique (escritorio_id, nome)
);

create table if not exists public.fin_categorias (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  tipo text not null check (tipo in ('receita','despesa')),
  grupo text not null,
  nome text not null,
  dre text not null check (dre in ('receita','deducao','custo','pessoal','administrativa','comercial','financeira','nao_operacional')),
  ativo boolean not null default true,
  ordem int not null default 0,
  unique (escritorio_id, tipo, grupo, nome)
);

create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text not null,
  tipo text not null default 'fornecedor' check (tipo in ('fornecedor','partner','colaborador','governo','banco','outro')),
  documento text,
  email text,
  telefone text,
  pix text,
  obs text,
  ativo boolean not null default true,
  origem_desker text,
  created_at timestamptz not null default now()
);
create index if not exists forn_esc on public.fornecedores (escritorio_id, nome);

-- =========================================================
-- Lançamentos
-- =========================================================
create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  tipo text not null check (tipo in ('receita','despesa','transferencia')),
  descricao text not null,
  valor numeric not null check (valor > 0),
  vencimento date not null,
  pago_em date,
  caixa_id uuid references public.caixas(id) on delete set null,
  caixa_destino_id uuid references public.caixas(id) on delete set null,   -- transferência
  categoria_id uuid references public.fin_categorias(id) on delete set null,
  projeto_id uuid references public.projetos(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  grupo_id uuid,                 -- mesmo parcelamento ou recorrência
  parcela int,
  parcelas int,
  recorrente boolean not null default false,
  documento text,                -- nº da nota fiscal, boleto
  observacao text,
  anexo_url text,
  origem text not null default 'manual' check (origem in ('manual','parcelas','recorrencia','proposta','importado','ofx')),
  origem_desker text,
  criado_por uuid references public.perfis(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tipo <> 'transferencia' or (caixa_id is not null and caixa_destino_id is not null and caixa_id <> caixa_destino_id))
);
create index if not exists lanc_venc on public.lancamentos (escritorio_id, vencimento);
create index if not exists lanc_pago on public.lancamentos (escritorio_id, pago_em);
create index if not exists lanc_proj on public.lancamentos (projeto_id);
create index if not exists lanc_grupo on public.lancamentos (grupo_id);
create unique index if not exists lanc_desker on public.lancamentos (escritorio_id, origem_desker) where origem_desker is not null;

create or replace function public.lancamento_carimbo() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists lancamento_carimbo on public.lancamentos;
create trigger lancamento_carimbo before update on public.lancamentos for each row execute function public.lancamento_carimbo();

-- =========================================================
-- Saldos e resumos (no banco, para não depender do limite de 1000 linhas da API)
-- =========================================================
-- Saldo de cada caixa numa data: saldo inicial + entradas pagas − saídas pagas (transferências movem entre caixas)
create or replace function public.saldo_caixas(esc uuid, ate date default current_date)
returns table (caixa_id uuid, saldo numeric, previsto numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not pode_financeiro(esc) then raise exception 'Sem permissão'; end if;
  return query
  with mov as (
    select l.caixa_id as cx, l.pago_em as d, l.vencimento as v, l.pago_em is not null as pago,
           case when l.tipo = 'receita' then l.valor else -l.valor end as val
      from lancamentos l where l.escritorio_id = esc and l.caixa_id is not null
    union all
    select l.caixa_destino_id, l.pago_em, l.vencimento, l.pago_em is not null, l.valor
      from lancamentos l where l.escritorio_id = esc and l.tipo = 'transferencia'
  )
  select c.id,
         c.saldo_inicial + coalesce(sum(m.val) filter (where m.pago and m.d >= c.saldo_inicial_em and m.d <= ate), 0),
         c.saldo_inicial + coalesce(sum(m.val) filter (where (m.pago and m.d >= c.saldo_inicial_em) or (not m.pago and m.v >= c.saldo_inicial_em)), 0)
  from caixas c left join mov m on m.cx = c.id
  where c.escritorio_id = esc
  group by c.id, c.saldo_inicial;
end $$;
grant execute on function public.saldo_caixas(uuid, date) to authenticated;

-- Totais por mês, categoria, projeto e caixa num período (base dos relatórios e do DRE)
create or replace function public.fin_resumo(esc uuid, de date, ate date, por_pagamento boolean default true)
returns table (mes text, tipo text, categoria_id uuid, projeto_id uuid, caixa_id uuid, fornecedor_id uuid, total numeric, qtd bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not pode_financeiro(esc) then raise exception 'Sem permissão'; end if;
  return query
  select to_char(case when por_pagamento then l.pago_em else l.vencimento end, 'YYYY-MM'), l.tipo, l.categoria_id, l.projeto_id, l.caixa_id, l.fornecedor_id,
         sum(l.valor), count(*)
  from lancamentos l
  where l.escritorio_id = esc and l.tipo <> 'transferencia'
    and (case when por_pagamento then l.pago_em else l.vencimento end) between de and ate
    and (not por_pagamento or l.pago_em is not null)
  group by 1, 2, 3, 4, 5, 6;
end $$;
grant execute on function public.fin_resumo(uuid, date, date, boolean) to authenticated;

-- =========================================================
-- Segurança
-- =========================================================
alter table public.caixas enable row level security;
alter table public.fin_categorias enable row level security;
alter table public.fornecedores enable row level security;
alter table public.lancamentos enable row level security;
do $$ declare t text; begin
  foreach t in array array['caixas','fin_categorias','fornecedores','lancamentos'] loop
    execute format('drop policy if exists %1$s_fin on public.%1$s', t);
    execute format('create policy %1$s_fin on public.%1$s for all to authenticated using (pode_financeiro(escritorio_id)) with check (pode_financeiro(escritorio_id))', t);
  end loop;
end $$;
grant select, insert, update, delete on public.caixas, public.fin_categorias, public.fornecedores, public.lancamentos to authenticated;

-- =========================================================
-- Dados iniciais da EZE
-- =========================================================
-- Gilson com acesso ao financeiro
update public.membros m set acesso_financeiro = true
  from public.perfis p, public.escritorios e
 where p.id = m.perfil_id and e.id = m.escritorio_id and e.slug = 'eze' and lower(p.email) = 'gilson@ezearquitetura.com.br';

with e as (select id from public.escritorios where slug = 'eze')
insert into public.caixas (escritorio_id, nome, tipo, ordem)
select e.id, v.nome, v.tipo, v.ordem from e, (values
  ('Caixa diário', 'banco', 1), ('Caixa físico', 'dinheiro', 2), ('Caixa investimento', 'investimento', 3)
) as v(nome, tipo, ordem)
on conflict (escritorio_id, nome) do nothing;

-- Plano de contas de escritório de arquitetura (Lucro Presumido)
with e as (select id from public.escritorios where slug = 'eze')
insert into public.fin_categorias (escritorio_id, tipo, grupo, nome, dre, ordem)
select e.id, v.tipo, v.grupo, v.nome, v.dre, v.ordem from e, (values
  ('receita','Honorários','Projeto arquitetônico','receita',1),
  ('receita','Honorários','Interiores','receita',2),
  ('receita','Honorários','Estudo de viabilidade','receita',3),
  ('receita','Honorários','Engenharia e responsabilidade técnica','receita',4),
  ('receita','Honorários','Gestão de obra','receita',5),
  ('receita','Honorários','Consultoria','receita',6),
  ('receita','Honorários','Aditivos e alterações','receita',7),
  ('receita','Outras receitas','Reembolso e rateio','nao_operacional',10),
  ('receita','Outras receitas','Rendimento de aplicação','financeira',11),
  ('receita','Outras receitas','Empréstimo recebido','nao_operacional',12),
  ('receita','Outras receitas','Outras receitas','nao_operacional',13),
  ('despesa','Impostos sobre faturamento','ISS','deducao',20),
  ('despesa','Impostos sobre faturamento','PIS e COFINS','deducao',21),
  ('despesa','Impostos sobre faturamento','IRPJ','deducao',22),
  ('despesa','Impostos sobre faturamento','CSLL','deducao',23),
  ('despesa','Impostos sobre faturamento','Outros impostos (DARF, DAS)','deducao',24),
  ('despesa','Custos dos projetos','Partners (PJ)','custo',30),
  ('despesa','Custos dos projetos','Projetos complementares','custo',31),
  ('despesa','Custos dos projetos','Taxas, RRT e ART','custo',32),
  ('despesa','Custos dos projetos','Impressão e plotagem','custo',33),
  ('despesa','Custos dos projetos','Maquetes e renderização','custo',34),
  ('despesa','Custos dos projetos','Viagens e visitas a obra','custo',35),
  ('despesa','Pessoal','Salários','pessoal',40),
  ('despesa','Pessoal','13º salário','pessoal',41),
  ('despesa','Pessoal','Férias','pessoal',42),
  ('despesa','Pessoal','FGTS e INSS','pessoal',43),
  ('despesa','Pessoal','Benefícios','pessoal',44),
  ('despesa','Pessoal','Bonificações','pessoal',45),
  ('despesa','Pessoal','Pró-labore','pessoal',46),
  ('despesa','Administrativas','Aluguel','administrativa',50),
  ('despesa','Administrativas','Condomínio e IPTU','administrativa',51),
  ('despesa','Administrativas','Energia','administrativa',52),
  ('despesa','Administrativas','Água','administrativa',53),
  ('despesa','Administrativas','Internet e telefone','administrativa',54),
  ('despesa','Administrativas','Limpeza','administrativa',55),
  ('despesa','Administrativas','Contabilidade','administrativa',56),
  ('despesa','Administrativas','Jurídico','administrativa',57),
  ('despesa','Administrativas','Softwares e sistemas','administrativa',58),
  ('despesa','Administrativas','Material de escritório','administrativa',59),
  ('despesa','Administrativas','Manutenção','administrativa',60),
  ('despesa','Administrativas','Seguros','administrativa',61),
  ('despesa','Administrativas','Conselhos e associações','administrativa',62),
  ('despesa','Administrativas','Cursos e treinamentos','administrativa',63),
  ('despesa','Administrativas','Consultoria','administrativa',64),
  ('despesa','Administrativas','Outras administrativas','administrativa',65),
  ('despesa','Comerciais','Marketing','comercial',70),
  ('despesa','Comerciais','Comissões e indicações','comercial',71),
  ('despesa','Comerciais','Relacionamento e eventos','comercial',72),
  ('despesa','Comerciais','Alimentação com clientes','comercial',73),
  ('despesa','Financeiras','Tarifas bancárias','financeira',80),
  ('despesa','Financeiras','Juros, multas e IOF','financeira',81),
  ('despesa','Financeiras','Cartão de crédito (fatura)','financeira',82),
  ('despesa','Investimentos e outros','Equipamentos','nao_operacional',90),
  ('despesa','Investimentos e outros','Imóvel e galpão','nao_operacional',91),
  ('despesa','Investimentos e outros','Pagamento de empréstimo','nao_operacional',92),
  ('despesa','Investimentos e outros','Distribuição de lucros','nao_operacional',93),
  ('despesa','Investimentos e outros','Doações','nao_operacional',94),
  ('despesa','Investimentos e outros','Outras despesas','nao_operacional',95)
) as v(tipo, grupo, nome, dre, ordem)
on conflict (escritorio_id, tipo, grupo, nome) do nothing;

select 'ok' as resultado;
