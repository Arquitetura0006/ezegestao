-- EZE Gestão · 0014 · Método EZE (Manual do escritório do Gilson) nos analistas IA
-- Carrega o checklist do Manual do escritório (174 itens em 7 etapas, com os módulos
-- de 7 municípios) nos analistas da pré-análise, e alinha as etapas do Processo EZE:
--   EV → Estudo de Viabilidade · BV → Boas-vindas e Briefing (nova) · PP → Projeto
--   Preliminar (nova) · AP → Anteprojeto · PL → Projeto Legal · PRE → Pré-Executivo (PB)
--   · EXE → Projeto Executivo (PE). As siglas PB e PE continuam (dados do Desker).
-- Só preenche analistas que ainda não têm itens; não apaga nada. Pode rodar de novo.
-- Rodar uma vez no SQL Editor, depois da 0013.

-- 1. Etapas novas e ordem do processo
with e as (select id from public.escritorios where slug = 'eze')
insert into public.etapas_modelo (escritorio_id, sigla, nome, ordem, peso)
select e.id, v.sigla, v.nome, v.ordem, v.peso from e, (values
  ('BV', 'Boas-vindas e Briefing', 3, 1),
  ('PP', 'Projeto Preliminar', 4, 2)
) as v(sigla, nome, ordem, peso)
on conflict (escritorio_id, sigla) do nothing;

update public.etapas_modelo em set ordem = v.ordem
from (values ('DP',1),('EV',2),('BV',3),('PP',4),('AP',5),('PL',6),('GA',7),('PB',8),('PE',9),('QD',10),('IN',11),('PV',12)) as v(sigla, ordem),
     public.escritorios e
where e.slug = 'eze' and em.escritorio_id = e.id and em.sigla = v.sigla;

-- 2. Analistas que faltam
with e as (select id from public.escritorios where slug = 'eze')
insert into public.analistas (escritorio_id, nome, camada, etapas, cidades, descricao, ordem)
select e.id, v.nome, v.camada, v.etapas, v.cidades, v.descricao, v.ordem from e, (values
  ('Boas-vindas e Briefing', 'etapa', '{BV}'::text[], '{}'::text[], 'Checklist da etapa BV do Manual do escritório.', 11),
  ('Projeto Preliminar', 'etapa', '{PP}'::text[], '{}'::text[], 'Checklist da etapa PP do Manual do escritório.', 11),
  ('Porto Belo', 'municipio', '{EV,PL}'::text[], '{Porto Belo}'::text[], 'Módulo PL-PBE do Manual do escritório.', 32),
  ('Itapema', 'municipio', '{EV,PL}'::text[], '{Itapema}'::text[], 'Módulo PL-ITA do Manual do escritório.', 33),
  ('Balneário Camboriú', 'municipio', '{EV,PL}'::text[], '{Balneário Camboriú}'::text[], 'Módulo PL-BC do Manual do escritório.', 34),
  ('Camboriú', 'municipio', '{EV,PL}'::text[], '{Camboriú}'::text[], 'Módulo PL-CAM do Manual do escritório.', 35),
  ('Navegantes', 'municipio', '{EV,PL}'::text[], '{Navegantes}'::text[], 'Módulo PL-NAV do Manual do escritório.', 36)
) as v(nome, camada, etapas, cidades, descricao, ordem)
where not exists (select 1 from public.analistas a where a.escritorio_id = e.id and a.nome = v.nome);

-- 3. Checklists das etapas
-- EV · Estudo de Viabilidade
update public.analistas an set orientacoes = $q$Entrada e viabilidade: dos primeiros dados do terreno à definição do produto.
Condução: Sócios e equipe de arquitetura.
Conclusão da etapa: Estudo aprovado e contrato de arquitetura fechado.

Fonte: Manual do escritório EZE (método do Gilson), etapa EV. Confira o material entregue item por item contra o checklist. Valores marcados como "referência interna" ou "referência do escritório" são critério da EZE, não lei: se o projeto se afastar deles, marque "verificar" e explique, a não ser que a legislação cadastrada no analista de município diga o contrário. Itens de processo (registrar, enviar, arquivar, reunir) só podem ser conferidos se houver evidência no material; sem evidência, marque "verificar" e diga o que falta.$q$, descricao = $q$Entrada e viabilidade: dos primeiros dados do terreno à definição do produto.$q$, updated_at = now()
from public.escritorios e
where e.slug = 'eze' and an.escritorio_id = e.id and an.nome = $q$Estudo de Viabilidade$q$ and coalesce(trim(an.orientacoes), '') = '';

with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = $q$Estudo de Viabilidade$q$)
insert into public.analista_itens (escritorio_id, analista_id, ordem, grupo, texto, tipo)
select a.escritorio_id, a.id, v.ordem, v.grupo, v.texto, 'checklist' from a, (values
  (1, $q$Contato e triagem$q$, $q$Registrar cliente ou corretor, contato, localização do lote, estágio da negociação e objetivo do estudo.$q$),
  (2, $q$Contato e triagem$q$, $q$Identificar se existe cliente definido ou se o corretor usará o estudo para prospectar a construtora.$q$),
  (3, $q$Contato e triagem$q$, $q$Reunir matrícula, levantamento topográfico em DWG ou PDF e consulta de viabilidade, conforme disponibilidade. Registrar origem, data e pendências.$q$),
  (4, $q$Contato e triagem$q$, $q$Se houver apenas localização, levantar a base municipal no Geomais e identificar as premissas a confirmar em campo.$q$),
  (5, $q$Escolha do estudo$q$, $q$Definir o escopo com cliente ou corretor, considerando porte e importância do projeto para o escritório.$q$),
  (6, $q$Escolha do estudo$q$, $q$Estudo inicial de manchas — apresentar ocupação, acessos, volumetria e potencial preliminar com hipóteses identificadas.$q$),
  (7, $q$Escolha do estudo$q$, $q$Estudo completo — desenvolver análises do terreno, conceito, plantas e quadro de áreas em caderno de apresentação.$q$),
  (8, $q$Conceito e produto$q$, $q$Mapear tipologias e linguagem das edificações vizinhas, áreas verdes, equipamentos públicos, comércio, serviços, acessibilidade e fluxos viários.$q$),
  (9, $q$Conceito e produto$q$, $q$Descrever moradores, perfil socioeconômico, faixa etária, poder aquisitivo e estilo de vida do público-alvo.$q$),
  (10, $q$Conceito e produto$q$, $q$Definir tipologias, infraestrutura, equipamentos, vagas por unidade e linguagem arquitetônica. Selecionar referências coerentes.$q$),
  (11, $q$Parâmetros e condicionantes$q$, $q$Conferir zoneamento, dimensões, recuos, gabarito, índices, ocupação, áreas mínimas e estacionamento.$q$),
  (12, $q$Parâmetros e condicionantes$q$, $q$Estudar tipologia de escada, elevadores, rota de fuga e intenções de projeto.$q$),
  (13, $q$Parâmetros e condicionantes$q$, $q$Mapear topografia, geologia, cursos d’água, drenagens, nascentes, esgoto público, vegetação e risco de alagamento.$q$),
  (14, $q$Parâmetros e condicionantes$q$, $q$Estudar insolação, ventos predominantes, conforto térmico e vistas. Registrar a origem dos parâmetros.$q$),
  (15, $q$Caderno completo e entrega$q$, $q$Montar capa com escritório, projeto, revisão e data. Incluir imagem conceitual, nome do empreendimento, apresentação do escritório, história e foto da equipe.$q$),
  (16, $q$Caderno completo e entrega$q$, $q$Abrir análise/conceito com mapa do entorno. Apresentar contexto urbano, imagem e texto do público-alvo, moodboard do produto e referências de fachada.$q$),
  (17, $q$Caderno completo e entrega$q$, $q$Localizar o terreno em mapa com raio de 500 m. Apresentar insolação, ventos, conforto térmico, vistas, topografia, cursos d’água, vegetação e condicionantes legais.$q$),
  (18, $q$Caderno completo e entrega$q$, $q$Apresentar imagens conceituais, plantas de térreo, garagens, lazer e tipo e quadro de áreas.$q$),
  (19, $q$Caderno completo e entrega$q$, $q$Enviar o estudo ou apresentá-lo no escritório conforme combinado. Registrar aprovação e fechamento do contrato.$q$)
) as v(ordem, grupo, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

-- BV · Boas-vindas e Briefing
update public.analistas an set orientacoes = $q$Apresentar a equipe e transformar o estudo aprovado em orientações de projeto.
Condução: Sócio, arquiteto responsável e gestora de aprovações.
Conclusão da etapa: Cronograma, responsáveis e briefing registrados.

Fonte: Manual do escritório EZE (método do Gilson), etapa BV. Confira o material entregue item por item contra o checklist. Valores marcados como "referência interna" ou "referência do escritório" são critério da EZE, não lei: se o projeto se afastar deles, marque "verificar" e explique, a não ser que a legislação cadastrada no analista de município diga o contrário. Itens de processo (registrar, enviar, arquivar, reunir) só podem ser conferidos se houver evidência no material; sem evidência, marque "verificar" e diga o que falta.$q$, descricao = $q$Apresentar a equipe e transformar o estudo aprovado em orientações de projeto.$q$, updated_at = now()
from public.escritorios e
where e.slug = 'eze' and an.escritorio_id = e.id and an.nome = $q$Boas-vindas e Briefing$q$ and coalesce(trim(an.orientacoes), '') = '';

with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = $q$Boas-vindas e Briefing$q$)
insert into public.analista_itens (escritorio_id, analista_id, ordem, grupo, texto, tipo)
select a.escritorio_id, a.id, v.ordem, v.grupo, v.texto, 'checklist' from a, (values
  (1, $q$Boas-vindas$q$, $q$Apresentar equipe e papéis na assinatura ou em reunião de início.$q$),
  (2, $q$Boas-vindas$q$, $q$Entregar cronograma, combinar canais de comunicação e identificar quem valida cada entrega.$q$),
  (3, $q$Boas-vindas$q$, $q$Retomar a viabilidade aprovada e registrar decisões que ainda dependem do cliente.$q$),
  (4, $q$Briefing · Residências$q$, $q$Registrar composição da família, rotina, hóspedes, trabalho em casa e horizonte de uso.$q$),
  (5, $q$Briefing · Residências$q$, $q$Definir ambientes, suítes, convivência, lazer, serviço, veículos e equipamentos especiais.$q$),
  (6, $q$Briefing · Residências$q$, $q$Documentar privacidade, acessibilidade, vistas, integração interior/exterior, materiais, referências, prioridades, orçamento e prazo.$q$),
  (7, $q$Briefing · Multifamiliar ou misto$q$, $q$Confirmar produto, público-alvo, tipologias, mix de unidades, áreas e prioridades comerciais.$q$),
  (8, $q$Briefing · Multifamiliar ou misto$q$, $q$Definir térreo, lojas, acessos independentes, vagas, áreas comuns, lazer, operação e manutenção.$q$),
  (9, $q$Briefing · Multifamiliar ou misto$q$, $q$Confirmar referências de fachada, desempenho esperado, diretrizes da construtora, orçamento e responsáveis pelas decisões.$q$)
) as v(ordem, grupo, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

-- PP · Projeto Preliminar
update public.analistas an set orientacoes = $q$Resolver implantação, plantas e fachada criativa.
Condução: Arquiteto responsável e sócios.
Conclusão da etapa: Plantas, fachada e caderno validados pelo cliente.

Fonte: Manual do escritório EZE (método do Gilson), etapa PP. Confira o material entregue item por item contra o checklist. Valores marcados como "referência interna" ou "referência do escritório" são critério da EZE, não lei: se o projeto se afastar deles, marque "verificar" e explique, a não ser que a legislação cadastrada no analista de município diga o contrário. Itens de processo (registrar, enviar, arquivar, reunir) só podem ser conferidos se houver evidência no material; sem evidência, marque "verificar" e diga o que falta.$q$, descricao = $q$Resolver implantação, plantas e fachada criativa.$q$, updated_at = now()
from public.escritorios e
where e.slug = 'eze' and an.escritorio_id = e.id and an.nome = $q$Projeto Preliminar$q$ and coalesce(trim(an.orientacoes), '') = '';

with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = $q$Projeto Preliminar$q$)
insert into public.analista_itens (escritorio_id, analista_id, ordem, grupo, texto, tipo)
select a.escritorio_id, a.id, v.ordem, v.grupo, v.texto, 'checklist' from a, (values
  (1, $q$Terreno e layout$q$, $q$Conferir no levantamento DWG/PDF medidas, altimetria, confrontantes e norte. Comparar matrícula e área in loco.$q$),
  (2, $q$Terreno e layout$q$, $q$Desenvolver layout interno e conferir áreas mínimas, circulações, acessibilidade, apartamentos e vagas necessários.$q$),
  (3, $q$Terreno e layout$q$, $q$Conferir cotas, níveis e geometrias em planta e corte. Cruzar quadro de áreas com todas as plantas de áreas.$q$),
  (4, $q$Escadas e acessibilidade$q$, $q$Enquadrar ocupação e altura na tabela aplicável da IN 09 do CBMSC, incluindo notas sobre tipo e quantidade. Em outro estado, validar a regulamentação local.$q$),
  (5, $q$Escadas e acessibilidade$q$, $q$Referência interna inicial: largura de 1,25 m inclusive patamares, espelho de 16–18 cm e piso de 27–32 cm. Validar dimensionamento e fórmula de Blondel em corte.$q$),
  (6, $q$Escadas e acessibilidade$q$, $q$Verificar sequência de espelhos, abertura das portas, faixa livre de circulação, dutos, antecâmara, entradas e saídas de ar e elevador quando aplicável.$q$),
  (7, $q$Escadas e acessibilidade$q$, $q$Reservar módulo de referência para cadeirante conforme NBR 9050 e tipo de escada. Referências de estudo do escritório: 80 × 120 cm e 90 × 120 cm entre paredes. Confirmar solução aplicável.$q$),
  (8, $q$Rampas e elevadores$q$, $q$Rampa de veículos: referência interna de até 15% no primeiro e no último metro. Verificar inclinações e transições exigidas pelo município.$q$),
  (9, $q$Rampas e elevadores$q$, $q$Estudar largura de 3,50 m, preferencialmente 4,00 m. Usar gabarito de manobra, medir na curva a 50 cm do bordo interno e chanfrar quando viável.$q$),
  (10, $q$Rampas e elevadores$q$, $q$Conferir altura livre sob a rampa. Para garagens com mais de 100 veículos, avaliar mão dupla e referência interna de 6 m, sujeita à validação municipal.$q$),
  (11, $q$Rampas e elevadores$q$, $q$Pré-dimensionamento interno das caixas de elevador: até 30 m, 1,80 × 1,80 m; faixa de 30 a 70 m, 2,00 × 2,00 m; acima de 70 m, 2,25 × 2,25 m. Confirmar limites, tráfego, quantidade, fosso, última parada e áreas técnicas com fornecedor.$q$),
  (12, $q$Garagem, lazer e infraestrutura$q$, $q$Conferir número de bocas, vagas e manobras. Numerar cada posição individualmente e conferir a tabela de estacionamento.$q$),
  (13, $q$Garagem, lazer e infraestrutura$q$, $q$Prever vagas de moto e visitante, bicicletário e boxes de praia conforme programa.$q$),
  (14, $q$Garagem, lazer e infraestrutura$q$, $q$Conferir geometria de lazer, piscina e isolamento de segurança.$q$),
  (15, $q$Garagem, lazer e infraestrutura$q$, $q$Localizar central de gás, lixeira, entrada de energia, lajes técnicas, condensadoras, aquecedores, chaminés e alinhamento dos dutos de churrasqueiras.$q$),
  (16, $q$Garagem, lazer e infraestrutura$q$, $q$Desenhar telhado, pavimento técnico e reservatórios.$q$),
  (17, $q$Fachada e aprovação$q$, $q$Definir materialidade, esquadrias, alturas e dimensões das aberturas.$q$),
  (18, $q$Fachada e aprovação$q$, $q$Garagens de multifamiliares: conferir enquadramento da ventilação permanente com PPCI. Referência informada pela EZE para altura a partir de 21 m: 7% da área da laje do pavimento de garagem. Validar norma e área efetivamente livre no empreendimento.$q$),
  (19, $q$Fachada e aprovação$q$, $q$Geralmente validar as plantas antes dos renders. Preparar caderno com plantas, cortes necessários, imagens da fachada e quadro de áreas.$q$),
  (20, $q$Fachada e aprovação$q$, $q$Registrar revisão aprovada pelo cliente e reunir todos os projetistas para iniciar o AP.$q$)
) as v(ordem, grupo, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

-- AP · Anteprojeto
update public.analistas an set orientacoes = $q$Coordenar a arquitetura e os quatro modelos complementares (estrutural, hidrossanitário, preventivo de incêndio e elétrico).
Condução: Arquiteto responsável, com acompanhamento do Gilson.
Conclusão da etapa: Zero incompatibilidades em aberto e cinco revisões identificadas.

Fonte: Manual do escritório EZE (método do Gilson), etapa AP. Confira o material entregue item por item contra o checklist. Valores marcados como "referência interna" ou "referência do escritório" são critério da EZE, não lei: se o projeto se afastar deles, marque "verificar" e explique, a não ser que a legislação cadastrada no analista de município diga o contrário. Itens de processo (registrar, enviar, arquivar, reunir) só podem ser conferidos se houver evidência no material; sem evidência, marque "verificar" e diga o que falta.$q$, descricao = $q$Coordenar a arquitetura e os quatro modelos complementares (estrutural, hidrossanitário, preventivo de incêndio e elétrico).$q$, updated_at = now()
from public.escritorios e
where e.slug = 'eze' and an.escritorio_id = e.id and an.nome = $q$Anteprojeto$q$ and coalesce(trim(an.orientacoes), '') = '';

with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = $q$Anteprojeto$q$)
insert into public.analista_itens (escritorio_id, analista_id, ordem, grupo, texto, tipo)
select a.escritorio_id, a.id, v.ordem, v.grupo, v.texto, 'checklist' from a, (values
  (1, $q$AP-01 · Distribuir a base$q$, $q$Enviar simultaneamente a mesma revisão aprovada do PP a estrutural, hidrossanitário, PPCI e elétrico.$q$),
  (2, $q$AP-01 · Distribuir a base$q$, $q$Registrar arquivo, revisão, data, responsável, prazo e conteúdo da primeira devolutiva. Confirmar abertura da base.$q$),
  (3, $q$AP-02 · Modelar no Revit$q$, $q$Modelar na sequência: paredes completas → reboco → esquadrias → contrapiso → piso acabado → forro de gesso.$q$),
  (4, $q$AP-02 · Modelar no Revit$q$, $q$Conferir posição, alturas, limites de nível e espessuras das paredes; faces revestidas e larguras livres.$q$),
  (5, $q$AP-02 · Modelar no Revit$q$, $q$Conferir dimensões de esquadrias, vergas, peitoris e aberturas. Resolver rebaixos, soleiras, escadas, patamares e níveis acabados.$q$),
  (6, $q$AP-02 · Modelar no Revit$q$, $q$Modelar cada vaga, detalhes de fachada, telhado, barrilete e reservatórios. Conferir área livre após acabamentos.$q$),
  (7, $q$AP-03 · Ventilação permanente de gás$q$, $q$Identificar ambientes com o projetista e representar posição e dimensões das aberturas.$q$),
  (8, $q$AP-03 · Ventilação permanente de gás$q$, $q$Verificar área livre após grelhas, venezianas e elementos de fachada. Registrar critério e vista de conferência.$q$),
  (9, $q$AP-04 · IFC estrutural$q$, $q$Vincular IFC e conferir revisão, coordenadas e níveis.$q$),
  (10, $q$AP-04 · IFC estrutural$q$, $q$Conferir pilares e vigas com paredes, esquadrias, vagas e circulações. Cortar vigas de transição para verificar pé-direito e passagem das instalações.$q$),
  (11, $q$AP-04 · IFC estrutural$q$, $q$Confirmar detalhes de fachada incorporados à estrutura. Conferir aberturas de shafts, caixas de elevador e escadas.$q$),
  (12, $q$AP-04 · IFC estrutural$q$, $q$Comparar níveis de lajes, rebaixos e patamares com piso acabado.$q$),
  (13, $q$AP-05 · IFC hidrossanitário$q$, $q$Conferir localização, dimensão e continuidade de shafts e mochetas.$q$),
  (14, $q$AP-05 · IFC hidrossanitário$q$, $q$Conferir saídas dos vasos e ramais em relação às vigas e pontos hidráulicos junto a pilares.$q$),
  (15, $q$AP-05 · IFC hidrossanitário$q$, $q$Verificar desvios em corte com o IFC estrutural, diâmetros, caimentos, pé-direito e espaço acima do forro de gesso.$q$),
  (16, $q$AP-05 · IFC preventivo de incêndio$q$, $q$Conferir shafts e dimensões livres da central de gás.$q$),
  (17, $q$AP-05 · IFC preventivo de incêndio$q$, $q$Validar para cada garagem a área mínima e a ventilação livre projetada, descontando obstruções.$q$),
  (18, $q$AP-05 · IFC preventivo de incêndio$q$, $q$Verificar compartimentação vertical em fachadas, shafts e travessias de laje; conferir compartimentação horizontal em paredes, portas e passagens.$q$),
  (19, $q$AP-05 · IFC elétrico$q$, $q$Conferir continuidade, dimensões e acesso aos shafts elétricos.$q$),
  (20, $q$AP-05 · IFC elétrico$q$, $q$Verificar localização e espaço de acesso ao quadro de entrada.$q$),
  (21, $q$AP-05 · IFC elétrico$q$, $q$Conferir quadro de disjuntores em cada tipologia, abertura da tampa e interferências com pilares, portas, mobiliário e hidráulica.$q$),
  (22, $q$AP-06 · Liberar a base$q$, $q$Registrar ocorrência por pavimento, local, disciplinas, responsável, vista e revisão.$q$),
  (23, $q$AP-06 · Liberar a base$q$, $q$Vincular o IFC corrigido e verificar a solução contra a arquitetura e as demais disciplinas.$q$),
  (24, $q$AP-06 · Liberar a base$q$, $q$Se houver impacto no Projeto Legal, atualizar o caderno com a gestora de aprovações.$q$),
  (25, $q$AP-06 · Liberar a base$q$, $q$Encerrar todas as incompatibilidades e registrar data e revisões da arquitetura e dos quatro IFCs para o PRE.$q$)
) as v(ordem, grupo, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

-- PL · Projeto Legal (aprovativo)
update public.analistas an set orientacoes = $q$Em paralelo ao AP, aplicar o módulo do município e a consulta do terreno.
Condução: Arquiteto responsável e gestora de aprovações.
Conclusão da etapa: Caderno revisado, protocolo e respostas do analista registrados.

Fonte: Manual do escritório EZE (método do Gilson), etapa PL. Confira o material entregue item por item contra o checklist. Valores marcados como "referência interna" ou "referência do escritório" são critério da EZE, não lei: se o projeto se afastar deles, marque "verificar" e explique, a não ser que a legislação cadastrada no analista de município diga o contrário. Itens de processo (registrar, enviar, arquivar, reunir) só podem ser conferidos se houver evidência no material; sem evidência, marque "verificar" e diga o que falta.
A legislação de cada cidade fica no analista do município; aqui entra a base comum a todos.$q$, descricao = $q$Em paralelo ao AP, aplicar o módulo do município e a consulta do terreno.$q$, updated_at = now()
from public.escritorios e
where e.slug = 'eze' and an.escritorio_id = e.id and an.nome = $q$Projeto Legal (aprovativo)$q$ and coalesce(trim(an.orientacoes), '') = '';

with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = $q$Projeto Legal (aprovativo)$q$)
insert into public.analista_itens (escritorio_id, analista_id, ordem, grupo, texto, tipo)
select a.escritorio_id, a.id, v.ordem, v.grupo, v.texto, 'checklist' from a, (values
  (1, $q$Base comum · sete municípios$q$, $q$Registrar município, uso, cadastro, matrícula, levantamento, consulta, condicionantes e revisão do PP.$q$),
  (2, $q$Base comum · sete municípios$q$, $q$Para cada índice, registrar exigido, projetado, unidade, artigo, versão consultada, data e evidência. Validar o enquadramento do lote antes do protocolo.$q$),
  (3, $q$Base comum · sete municípios$q$, $q$Conferir implantação, alinhamentos, recuos, níveis, acessos, passeio, rota acessível, unidades, garagens, lazer, cobertura, cortes e elevações conforme o município.$q$),
  (4, $q$Base comum · sete municípios$q$, $q$Usar a tabela de estacionamento como referência. Conferir desenho, destinação e contagem. Cada posição recebe número único, inclusive em vagas agrupadas, sem sufixos A/B/C.$q$),
  (5, $q$Base comum · sete municípios$q$, $q$Compatibilizar projeto, quadros, documentos e memoriais. Rever todos os arquivos afetados por solicitações do analista.$q$),
  (6, $q$Base comum · sete municípios$q$, $q$Gestora confere documentos, registra protocolo, exigências e revisão final. Arquiteto responde pela revisão técnica.$q$)
) as v(ordem, grupo, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

-- PRE · Pré-Executivo
update public.analistas an set orientacoes = $q$Concluir acabamentos e emitir o arquitetônico com a estrutura.
Condução: Arquiteto responsável.
Conclusão da etapa: Cliente e construtora validam por e-mail a mesma revisão.

Fonte: Manual do escritório EZE (método do Gilson), etapa PRE. Confira o material entregue item por item contra o checklist. Valores marcados como "referência interna" ou "referência do escritório" são critério da EZE, não lei: se o projeto se afastar deles, marque "verificar" e explique, a não ser que a legislação cadastrada no analista de município diga o contrário. Itens de processo (registrar, enviar, arquivar, reunir) só podem ser conferidos se houver evidência no material; sem evidência, marque "verificar" e diga o que falta.$q$, descricao = $q$Concluir acabamentos e emitir o arquitetônico com a estrutura.$q$, updated_at = now()
from public.escritorios e
where e.slug = 'eze' and an.escritorio_id = e.id and an.nome = $q$Pré-Executivo$q$ and coalesce(trim(an.orientacoes), '') = '';

with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = $q$Pré-Executivo$q$)
insert into public.analista_itens (escritorio_id, analista_id, ordem, grupo, texto, tipo)
select a.escritorio_id, a.id, v.ordem, v.grupo, v.texto, 'checklist' from a, (values
  (1, $q$PRE-01 · Preparar$q$, $q$Identificar as cinco revisões liberadas no AP.$q$),
  (2, $q$PRE-01 · Preparar$q$, $q$Preparar índice e vistas por bloco e pavimento, com escalas e responsáveis.$q$),
  (3, $q$PRE-02 · Acabamentos$q$, $q$Rodapés: conferir altura, espessura e arremates junto a portas, soleiras e mudanças de piso.$q$),
  (4, $q$PRE-02 · Acabamentos$q$, $q$Acabamentos de janela: conferir marco, retornos internos e externos, peitoril e pingadeira.$q$),
  (5, $q$PRE-02 · Acabamentos$q$, $q$Vergas e contravergas: modelar posição e dimensões sem duplicar elementos do estrutural.$q$),
  (6, $q$PRE-02 · Acabamentos$q$, $q$Negativos e cortineiros: conferir largura, profundidade e encontros com vigas e esquadrias.$q$),
  (7, $q$PRE-02 · Acabamentos$q$, $q$Soleiras e pingadeiras: verificar transições, nível, caimento e projeção sobre a face acabada.$q$),
  (8, $q$PRE-02 · Acabamentos$q$, $q$Rebocar vigas expostas: conferir alinhamento e altura livre sob a viga acabada.$q$),
  (9, $q$PRE-02 · Acabamentos$q$, $q$Guarda-corpos: verificar alturas desde o piso acabado, continuidade e encontros.$q$),
  (10, $q$PRE-02 · Acabamentos$q$, $q$Revestimentos de fachada: verificar espessuras, mudanças de plano e arremates.$q$),
  (11, $q$PRE-02 · Acabamentos$q$, $q$Acabamentos de áreas técnicas: conferir pisos, paredes, tetos, acessos de manutenção e ventilação.$q$),
  (12, $q$PRE-03 · Emitir$q$, $q$Emitir arquitetura de todos os pavimentos, cortes e fachadas junto com a estrutura. Identificar repetições e diferenciados.$q$),
  (13, $q$PRE-03 · Emitir$q$, $q$Abrir PDF para conferir folhas, escala e legibilidade. Abrir DWGs para verificar unidades e estrutura visível.$q$),
  (14, $q$PRE-03 · Emitir$q$, $q$Abrir IFC em visualizador para verificar níveis, pavimentos e posicionamento com o estrutural. Garantir a mesma revisão em PDF, DWG e IFC.$q$),
  (15, $q$PRE-04 · Aceite por e-mail$q$, $q$Enviar a emissão à construtora e ao cliente com data e revisão.$q$),
  (16, $q$PRE-04 · Aceite por e-mail$q$, $q$Registrar solicitações, ajustar e reenviar quando necessário.$q$),
  (17, $q$PRE-04 · Aceite por e-mail$q$, $q$Arquivar os dois aceites por e-mail vinculados à mesma revisão antes de formatar o EXE.$q$)
) as v(ordem, grupo, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

-- EXE · Projeto Executivo
update public.analistas an set orientacoes = $q$Executivo final: sete conjuntos de entrega (arquitetônico, vedação, paginação, forro, esquadrias, detalhes e quantitativos), a partir da revisão validada do PRE.
Condução: Arquiteto responsável pela emissão.
Conclusão da etapa: Caderno conferido e quantitativos reunidos em PDF.

Fonte: Manual do escritório EZE (método do Gilson), etapa EXE. Confira o material entregue item por item contra o checklist. Valores marcados como "referência interna" ou "referência do escritório" são critério da EZE, não lei: se o projeto se afastar deles, marque "verificar" e explique, a não ser que a legislação cadastrada no analista de município diga o contrário. Itens de processo (registrar, enviar, arquivar, reunir) só podem ser conferidos se houver evidência no material; sem evidência, marque "verificar" e diga o que falta.$q$, descricao = $q$Executivo final: sete conjuntos de entrega (arquitetônico, vedação, paginação, forro, esquadrias, detalhes e quantitativos), a partir da revisão validada do PRE.$q$, updated_at = now()
from public.escritorios e
where e.slug = 'eze' and an.escritorio_id = e.id and an.nome = $q$Projeto Executivo$q$ and coalesce(trim(an.orientacoes), '') = '';

with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = $q$Projeto Executivo$q$)
insert into public.analista_itens (escritorio_id, analista_id, ordem, grupo, texto, tipo)
select a.escritorio_id, a.id, v.ordem, v.grupo, v.texto, 'checklist' from a, (values
  (1, $q$EXE-01 · Índice e revisão$q$, $q$Registrar o PRE aceito por cliente e construtora. Montar índice por conjunto, bloco, pavimento, número e escala.$q$),
  (2, $q$EXE-01 · Índice e revisão$q$, $q$Abrir PDFs na escala de impressão. Verificar chamada, folha e vista de destino. Registrar data, revisão e responsável pela emissão.$q$),
  (3, $q$01 · Arquitetônico · A01–A07$q$, $q$Conferir pavimentos, ambientes, áreas, materiais, cotas, níveis, estrutura e repetições. Cruzar códigos de portas e janelas e chamadas com as folhas de destino.$q$),
  (4, $q$01 · Arquitetônico · A01–A07$q$, $q$A01 térreo: seguir percurso do passeio até hall, lojas e garagem; conferir rebaixos, acessos, lixeiras, medição, boxes e bicicletário.$q$),
  (5, $q$01 · Arquitetônico · A01–A07$q$, $q$A02 garagem: conferir posições, tabela, rampas, ventilação e interferência com piscina e casa de máquinas acima.$q$),
  (6, $q$01 · Arquitetônico · A01–A07$q$, $q$A03 lazer: verificar níveis de deck, piscinas, ducha, rampas, isolamento e botoeira; cruzar projeções com garagem.$q$),
  (7, $q$01 · Arquitetônico · A01–A07$q$, $q$A04 tipo 7× e A05/A06 diferenciados: conferir áreas, sacadas, churrasqueiras, shafts, áreas técnicas e variações de fachada.$q$),
  (8, $q$01 · Arquitetônico · A01–A07$q$, $q$A07 cobertura: telhado, caimentos, calhas, rufos, impermeabilização, barrilete, reservatório e acesso de manutenção.$q$),
  (9, $q$02 · Vedação · V01–V07$q$, $q$Cotar paredes desde referência definida. Distinguir vedação em osso de face acabada e fechar cadeias de cotas.$q$),
  (10, $q$02 · Vedação · V01–V07$q$, $q$Diferenciar blocos cerâmicos, concreto, concreto celular e drywall; conferir espessura do componente e espessura final.$q$),
  (11, $q$02 · Vedação · V01–V07$q$, $q$Conferir vão de obra, peitoril, verga e contraverga com o mapa de esquadrias. Verificar estrutura, shafts e dimensões livres.$q$),
  (12, $q$02 · Vedação · V01–V07$q$, $q$V01/V02: acessos, muros baixos e garagem, aberturas e pele de vidro. V03: cotas de base e alturas dos muros do lazer.$q$),
  (13, $q$02 · Vedação · V01–V07$q$, $q$V04/V05/V06: conferir por tipologia as elevações dos vãos, mudanças na sacada e detalhes curvos. V07: conferir separadamente telhado e reservatório.$q$),
  (14, $q$03 · Paginação de piso e revestimentos · P01–P07$q$, $q$Associar hachura a material, dimensão, acabamento e aplicação. Indicar origem e sentido da paginação, recortes e transições.$q$),
  (15, $q$03 · Paginação de piso e revestimentos · P01–P07$q$, $q$Conferir níveis de piso acabado, espessuras de contrapiso, rebaixos, soleiras, bordas e caimentos aos ralos.$q$),
  (16, $q$03 · Paginação de piso e revestimentos · P01–P07$q$, $q$P01/P02: separar áreas sem contrapiso, pintura epóxi, áreas de serviço, rampas e soleiras de elevador.$q$),
  (17, $q$03 · Paginação de piso e revestimentos · P01–P07$q$, $q$P03: compatibilizar deck, bordas, pastilhas, ducha e níveis do lazer com interiores.$q$),
  (18, $q$03 · Paginação de piso e revestimentos · P01–P07$q$, $q$P04/P05/P06: conferir vinílico nos quartos, cerâmica, recortes, paginação dos boxes, eixo das esquadrias e nicho acabado com Vedações.$q$),
  (19, $q$03 · Paginação de piso e revestimentos · P01–P07$q$, $q$P07: identificar instruções específicas do telhado e reservatório. Conferir se notas, legendas e projeto de interiores usam a mesma especificação.$q$),
  (20, $q$04 · Forro · F01–F05$q$, $q$Indicar material e altura livre a partir do piso acabado. Distinguir gesso ST/RU, MDF, vinílico e laje tratada conforme cada ambiente.$q$),
  (21, $q$04 · Forro · F01–F05$q$, $q$Cotar negativos, cortineiros, sancas, arremates e nichos de ar-condicionado. Verificar esquadrias, instalações e manutenção.$q$),
  (22, $q$04 · Forro · F01–F05$q$, $q$F01 reúne térreo e garagem. F02 corresponde ao lazer (A03/P03). Cruzar pelo pavimento; conferir o encontro do gesso com revestimento e interiores.$q$),
  (23, $q$04 · Forro · F01–F05$q$, $q$F03 tipo 7×, F04 tipo 02 e F05 tipo 03: revisar perímetro de sacadas, cortineiros, nichos e hall social; verificar os cortes críticos com a estrutura.$q$),
  (24, $q$04 · Forro · F01–F05$q$, $q$Valores do exemplo Brizza: gesso a 2,50/2,60/2,70 m, negativo de 2,5 cm, cortineiro de 23 cm e sanca de 25 cm. Dimensionar para cada novo projeto.$q$),
  (25, $q$05 · Mapa de esquadrias · E01–E06$q$, $q$Conferir código e local da peça na planta, na elevação e na tabela. Distinguir vão de obra, vão acabado e dimensão de instalação.$q$),
  (26, $q$05 · Mapa de esquadrias · E01–E06$q$, $q$Conferir abertura, folhas fixas/móveis, perfil, vidro, material, acabamento, peitoril e verga. Compatibilizar persianas motorizadas com elétrico e cortineiros.$q$),
  (27, $q$05 · Mapa de esquadrias · E01–E06$q$, $q$E01/E02: hall, pele de vidro, controle de acesso, portões, boxes, brises e ventilação. Conferir área livre de grade com PPCI.$q$),
  (28, $q$05 · Mapa de esquadrias · E01–E06$q$, $q$E03: portas de lazer e continuidade da proteção da piscina. E04/E05/E06: esquadrias e guarda-corpos por final e tipo, áreas técnicas e teto do reservatório.$q$),
  (29, $q$05 · Mapa de esquadrias · E01–E06$q$, $q$Confirmar vãos dos elevadores com fornecedor e portas corta-fogo com PPCI. Conferir quantitativos por modelo e pavimento; distinguir grades, nichos e aberturas de churrasqueira.$q$),
  (30, $q$05 · Mapa de esquadrias · E01–E06$q$, $q$Revisar chamadas do modelo: notas do Arquitetônico remetem à E07; as folhas de referência recebidas são E01–E06. Confirmar destino antes de reutilizar.$q$),
  (31, $q$06 · Detalhes · D01–D07$q$, $q$D01/D02 cortes AA e BB: verificar linha de corte, níveis, pé-direito, patamares e encontro de laje, viga e forro.$q$),
  (32, $q$06 · Detalhes · D01–D07$q$, $q$D03/D04: conferir as quatro fachadas, materiais, cores e continuidade em esquinas. Cruzar alturas e vãos com cortes e esquadrias.$q$),
  (33, $q$06 · Detalhes · D01–D07$q$, $q$D05: localizar no mapa 3D as peles de vidro, portões, lixeira e central de gás. Vistas 6, 7 e 8: loja, jogos e hall.$q$),
  (34, $q$06 · Detalhes · D01–D07$q$, $q$D06: dimensionar lâminas, brises, curvas, floreiras, perfis e encontros com estrutura. Vincular o desenho de fabricação quando pertinente.$q$),
  (35, $q$06 · Detalhes · D01–D07$q$, $q$D07: conferir percurso, setorização, perfil e alimentação do LED e pontos de paisagismo com elétrico. No Brizza, fita de sobrepor a 3.000 K.$q$),
  (36, $q$07 · Quantitativo de materiais · Q01–Q13$q$, $q$Após modelagem, extrair as tabelas do Revit na revisão de emissão. Para cada material desenhado localizar sua linha. Para cada linha localizar os elementos no modelo.$q$),
  (37, $q$07 · Quantitativo de materiais · Q01–Q13$q$, $q$Detectar materiais sobrepostos, ausentes, filtrados ou classificados incorretamente. Distinguir duas camadas legítimas de duas instâncias do mesmo acabamento.$q$),
  (38, $q$07 · Quantitativo de materiais · Q01–Q13$q$, $q$Q01–Q03 portas e janelas: unidades por tipo, pavimento, largura, altura e peitoril. Separar aberturas de elevador, nichos, grades e churrasqueiras do fornecimento de esquadrias.$q$),
  (39, $q$07 · Quantitativo de materiais · Q01–Q13$q$, $q$Q04–Q08 paredes: m² por material, espessura e face. Separar bloco, drywall, reboco e acabamento. Confirmar descontos de vãos e continuidade das tabelas entre folhas.$q$),
  (40, $q$07 · Quantitativo de materiais · Q01–Q13$q$, $q$Q09–Q10 pisos: m² por ambiente, camada e espessura. Cruzar com P01–P07. Conferir superfícies com descrições repetidas e continuidade até o último nível no PDF.$q$),
  (41, $q$07 · Quantitativo de materiais · Q01–Q13$q$, $q$Q11–Q12 encunhamento: medir em metros os trechos efetivos por vedação; verificar filtros de brises, pele de vidro e paredes cortina.$q$),
  (42, $q$07 · Quantitativo de materiais · Q01–Q13$q$, $q$Q13: separar forro, telhado em m² e perfis (negativos, cortineiros, rodapés) em metros por tipo e altura.$q$),
  (43, $q$07 · Quantitativo de materiais · Q01–Q13$q$, $q$Conferir pavimentos repetidos já discriminados antes de multiplicar. Corrigir no modelo e atualizar a extração; se houver perdas, discriminar separadamente.$q$),
  (44, $q$07 · Quantitativo de materiais · Q01–Q13$q$, $q$Entregar UM PDF: capa com nome do empreendimento e título; segunda página com imagem da fachada; demais páginas com todas as tabelas. Verificar legibilidade, quebras e última linha de cada tabela contra o Revit.$q$),
  (45, $q$Fechamento da emissão$q$, $q$Cruzar plantas, detalhes e quantitativos com a mesma revisão. Registrar responsável, evidências e pendências encerradas.$q$),
  (46, $q$Fechamento da emissão$q$, $q$Referência Brizza: 52 folhas R05, distribuídas em 7 arquitetônicas, 7 de vedações, 7 de pisos, 5 de forro, 6 de esquadrias, 7 de detalhes e 13 de quantitativos. As 19 específicas da construtora ficam fora do padrão.$q$),
  (47, $q$Fechamento da emissão$q$, $q$Antes de reutilizar o exemplo, verificar continuidade da tabela de pisos após o nível 10, descrição de vinílico/laminado e referências de esquadrias. Adaptar número de folhas ao escopo contratado.$q$)
) as v(ordem, grupo, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

-- 4. Módulos de município (Projeto Legal)
-- PL-BOM · Bombinhas
update public.analistas an set orientacoes = $q$Base consultada pelo método: LC 369/2021 (plano diretor). Modelo de referência: apart-hotel na Rua Cardeal, em Bombas. Confirmar alterações posteriores e requisitos administrativos.
Só use como lei o que estiver nos documentos deste analista; as referências acima vêm do Manual do escritório e precisam ser confirmadas na versão vigente. Se o índice ou artigo não estiver cadastrado, marque "verificar" e diga o que falta.$q$, descricao = $q$Módulo PL-BOM do Manual do escritório. Base consultada pelo método: LC 369/2021 (plano diretor). Modelo de referência: apart-hotel na Rua Cardeal, em Bombas. Confirmar alterações posteriores e requisitos administrativos.$q$, updated_at = now()
from public.escritorios e
where e.slug = 'eze' and an.escritorio_id = e.id and an.nome = $q$Bombinhas$q$ and coalesce(trim(an.orientacoes), '') = '';

with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = $q$Bombinhas$q$)
insert into public.analista_itens (escritorio_id, analista_id, ordem, grupo, texto, tipo)
select a.escritorio_id, a.id, v.ordem, v.grupo, v.texto, 'checklist' from a, (values
  (1, $q$Projeto Legal$q$, $q$Modelo: apart-hotel na Rua Cardeal, em Bombas. Base consultada: LC 369/2021; validar alterações posteriores e requisitos administrativos.$q$),
  (2, $q$Projeto Legal$q$, $q$Demonstrar ocupação de embasamento e torre, áreas e pavimentos de outorga quando houver. Compatibilizar plantas, cortes, elevações e reservatórios.$q$),
  (3, $q$Projeto Legal$q$, $q$Para hospedagem, conferir acessibilidade das unidades e áreas comuns conforme enquadramento. Registrar parâmetros de iluminação, ventilação e dimensões com referência vigente.$q$)
) as v(ordem, grupo, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

-- PL-PBE · Porto Belo
update public.analistas an set orientacoes = $q$Referências: Código de Obras LC 34/2011 e Código Urbanístico LC 33/2011. Modelo de referência: Rua Brusque. Confirmar redação vigente.
Só use como lei o que estiver nos documentos deste analista; as referências acima vêm do Manual do escritório e precisam ser confirmadas na versão vigente. Se o índice ou artigo não estiver cadastrado, marque "verificar" e diga o que falta.$q$, descricao = $q$Módulo PL-PBE do Manual do escritório. Referências: Código de Obras LC 34/2011 e Código Urbanístico LC 33/2011. Modelo de referência: Rua Brusque. Confirmar redação vigente.$q$, updated_at = now()
from public.escritorios e
where e.slug = 'eze' and an.escritorio_id = e.id and an.nome = $q$Porto Belo$q$ and coalesce(trim(an.orientacoes), '') = '';

with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = $q$Porto Belo$q$)
insert into public.analista_itens (escritorio_id, analista_id, ordem, grupo, texto, tipo)
select a.escritorio_id, a.id, v.ordem, v.grupo, v.texto, 'checklist' from a, (values
  (1, $q$Projeto Legal$q$, $q$Referências: Código de Obras LC 34/2011 e Código Urbanístico LC 33/2011. Confirmar redação vigente.$q$),
  (2, $q$Projeto Legal$q$, $q$Modelo Rua Brusque: localização, implantação, passeio, embasamento, torre e cone de sombra quando aplicável.$q$),
  (3, $q$Projeto Legal$q$, $q$Conferir térreo comercial, garagens, tipo repetido, lazer, rooftop, barrilete e cortes. Distinguir áreas computáveis e não computáveis.$q$),
  (4, $q$Projeto Legal$q$, $q$Reconciliar vagas no memorial e na tabela do projeto; no exemplo constavam 222 no memorial e 230 na prancha de estacionamento. Atualizar o memorial a partir da tabela conferida.$q$)
) as v(ordem, grupo, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

-- PL-ITA · Itapema
update public.analistas an set orientacoes = $q$Referência: LC 008/2002 com alterações da LC 143/2024. Modelo de referência: Rua 129A (2023). Validar atualizações e modelo municipal.
Só use como lei o que estiver nos documentos deste analista; as referências acima vêm do Manual do escritório e precisam ser confirmadas na versão vigente. Se o índice ou artigo não estiver cadastrado, marque "verificar" e diga o que falta.$q$, descricao = $q$Módulo PL-ITA do Manual do escritório. Referência: LC 008/2002 com alterações da LC 143/2024. Modelo de referência: Rua 129A (2023). Validar atualizações e modelo municipal.$q$, updated_at = now()
from public.escritorios e
where e.slug = 'eze' and an.escritorio_id = e.id and an.nome = $q$Itapema$q$ and coalesce(trim(an.orientacoes), '') = '';

with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = $q$Itapema$q$)
insert into public.analista_itens (escritorio_id, analista_id, ordem, grupo, texto, tipo)
select a.escritorio_id, a.id, v.ordem, v.grupo, v.texto, 'checklist' from a, (values
  (1, $q$Projeto Legal$q$, $q$Referência: LC 008/2002 com alterações da LC 143/2024. O exemplo Rua 129A é de 2023. Validar atualizações e modelo municipal.$q$),
  (2, $q$Projeto Legal$q$, $q$Art. 14: comparar matrícula e levantamento. Art. 14-A: verificar ART/RRT aplicáveis, projeto em PDF e DXF e memorial de acabamentos em PDF.$q$),
  (3, $q$Projeto Legal$q$, $q$Art. 17-C: situação com ruas, referência de localização, norte e corpos hídricos. Implantação em escala mínima 1:100 com projeções, afastamentos, passeio, acessos e áreas não edificáveis.$q$),
  (4, $q$Projeto Legal$q$, $q$Perímetros de todos os pavimentos e esquema vertical em escala mínima 1:200 conforme texto consultado. Representar usos, circulação, acessibilidade, altura, pés-direitos e perfil natural.$q$),
  (5, $q$Projeto Legal$q$, $q$Conferir quadro estatístico, unidades, áreas úteis abertas e fechadas, privativas, lojas, áreas comuns, vagas, selo e declaração.$q$),
  (6, $q$Projeto Legal$q$, $q$Distinguir área matriculada, levantada, pública e base de índices; justificar exclusões, APP e rio. Verificar enquadramento de outorga e multiplicadores.$q$)
) as v(ordem, grupo, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

-- PL-BC · Balneário Camboriú
update public.analistas an set orientacoes = $q$Modelo de referência: comercial Rua Pernambuco. Quadro de áreas lançado no Aprova Fácil (ICON e ICAD). Validar critérios vigentes.
Só use como lei o que estiver nos documentos deste analista; as referências acima vêm do Manual do escritório e precisam ser confirmadas na versão vigente. Se o índice ou artigo não estiver cadastrado, marque "verificar" e diga o que falta.$q$, descricao = $q$Módulo PL-BC do Manual do escritório. Modelo de referência: comercial Rua Pernambuco. Quadro de áreas lançado no Aprova Fácil (ICON e ICAD). Validar critérios vigentes.$q$, updated_at = now()
from public.escritorios e
where e.slug = 'eze' and an.escritorio_id = e.id and an.nome = $q$Balneário Camboriú$q$ and coalesce(trim(an.orientacoes), '') = '';

with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = $q$Balneário Camboriú$q$)
insert into public.analista_itens (escritorio_id, analista_id, ordem, grupo, texto, tipo)
select a.escritorio_id, a.id, v.ordem, v.grupo, v.texto, 'checklist' from a, (values
  (1, $q$Projeto Legal$q$, $q$Modelo comercial Rua Pernambuco. Conferir cenário urbano com fachada, paisagismo, acessos e passeio projetados.$q$),
  (2, $q$Projeto Legal$q$, $q$Lançar o quadro de áreas diretamente no Aprova Fácil. Cadastrar pavimentos, tipo e repetições. Discriminar computáveis, não computáveis, vazios, ICON e ICAD.$q$),
  (3, $q$Projeto Legal$q$, $q$Comparar subtotais por pavimento e total com o modelo. Manter os cortes nas pranchas. Após ajuste do analista, revisar também os lançamentos e guardar comprovante da revisão.$q$),
  (4, $q$Projeto Legal$q$, $q$Distinguir piso permeável e cobertura vegetada. Validar critérios vigentes para o empreendimento.$q$)
) as v(ordem, grupo, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

-- PL-CAM · Camboriú
update public.analistas an set orientacoes = $q$Referências: LC 88/2017 e LC 89/2017 (Código consolidado até 16/12/2021). Modelo de referência: Rua Rio Imaruí. Confirmar alterações e o protocolo CTMGEO.
Só use como lei o que estiver nos documentos deste analista; as referências acima vêm do Manual do escritório e precisam ser confirmadas na versão vigente. Se o índice ou artigo não estiver cadastrado, marque "verificar" e diga o que falta.$q$, descricao = $q$Módulo PL-CAM do Manual do escritório. Referências: LC 88/2017 e LC 89/2017 (Código consolidado até 16/12/2021). Modelo de referência: Rua Rio Imaruí. Confirmar alterações e o protocolo CTMGEO.$q$, updated_at = now()
from public.escritorios e
where e.slug = 'eze' and an.escritorio_id = e.id and an.nome = $q$Camboriú$q$ and coalesce(trim(an.orientacoes), '') = '';

with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = $q$Camboriú$q$)
insert into public.analista_itens (escritorio_id, analista_id, ordem, grupo, texto, tipo)
select a.escritorio_id, a.id, v.ordem, v.grupo, v.texto, 'checklist' from a, (values
  (1, $q$Projeto Legal$q$, $q$Modelo Rua Rio Imaruí. LC 88/2017 e LC 89/2017. Texto do Código consultado com consolidação até 16/12/2021; confirmar alterações.$q$),
  (2, $q$Projeto Legal$q$, $q$Arts. 24–29: conferir consulta válida, titularidade, responsabilidades técnicas, taxas, arquitetônico e hidrossanitário. Conferir documentos de Bombeiros, resíduos, tráfego de elevadores e BR-101 quando aplicáveis.$q$),
  (3, $q$Projeto Legal$q$, $q$Arts. 34–35: conferir selo, declarações e quadro nas pranchas com áreas por pavimento, índices permitidos/utilizados e computáveis/não computáveis.$q$),
  (4, $q$Projeto Legal$q$, $q$Conferir material e área dos ambientes, tabelas de portas/janelas, ventilação forçada, passeio e acessos. Validar requisitos operacionais do protocolo CTMGEO.$q$)
) as v(ordem, grupo, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

-- PL-NAV · Navegantes
update public.analistas an set orientacoes = $q$Referência: LC 416/2023 alterada pela LC 454/2024 (compilação consultada até 26/06/2025). Modelo de referência: Stone, Gravatá.
Só use como lei o que estiver nos documentos deste analista; as referências acima vêm do Manual do escritório e precisam ser confirmadas na versão vigente. Se o índice ou artigo não estiver cadastrado, marque "verificar" e diga o que falta.$q$, descricao = $q$Módulo PL-NAV do Manual do escritório. Referência: LC 416/2023 alterada pela LC 454/2024 (compilação consultada até 26/06/2025). Modelo de referência: Stone, Gravatá.$q$, updated_at = now()
from public.escritorios e
where e.slug = 'eze' and an.escritorio_id = e.id and an.nome = $q$Navegantes$q$ and coalesce(trim(an.orientacoes), '') = '';

with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = $q$Navegantes$q$)
insert into public.analista_itens (escritorio_id, analista_id, ordem, grupo, texto, tipo)
select a.escritorio_id, a.id, v.ordem, v.grupo, v.texto, 'checklist' from a, (values
  (1, $q$Projeto Legal$q$, $q$Modelo Stone, Gravatá. Conferir cadastros, matrículas, frentes, deck, ciclovia e limites levantados.$q$),
  (2, $q$Projeto Legal$q$, $q$Demonstrar ocupação de base e torre, permeabilidade, aproveitamento, áreas computáveis/não computáveis, unidades, terraços e tipos diferenciados.$q$),
  (3, $q$Projeto Legal$q$, $q$Detalhar cada passeio; quando aplicável, indicar origem, cotas e cone de sombreamento em planta e corte.$q$),
  (4, $q$Projeto Legal$q$, $q$Vagas a 90° para automóveis — largura × comprimento / faixa de manobra: 2,40 × 4,60 m / 5,00 m; 2,70 × 4,60 m / 4,60 m; 3,00 × 4,60 m / 4,50 m.$q$),
  (5, $q$Projeto Legal$q$, $q$Referência: art. 150 da LC 416/2023 alterada pela LC 454/2024, compilação consultada até 26/06/2025. Verificar atualização e critérios para outros ângulos e vagas reservadas. No Stone foram adotados 4,80 m de comprimento.$q$)
) as v(ordem, grupo, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

-- PL-ITJ · Itajaí
update public.analistas an set orientacoes = $q$Referência: LC 467/2024 (arts. 36 e 37) e Decreto 13.477/2025; protocolo no Aprova Digital. Modelo de referência: Moratta R23, folhas 00–23.
Só use como lei o que estiver nos documentos deste analista; as referências acima vêm do Manual do escritório e precisam ser confirmadas na versão vigente. Se o índice ou artigo não estiver cadastrado, marque "verificar" e diga o que falta.$q$, descricao = $q$Módulo PL-ITJ do Manual do escritório. Referência: LC 467/2024 (arts. 36 e 37) e Decreto 13.477/2025; protocolo no Aprova Digital. Modelo de referência: Moratta R23, folhas 00–23.$q$, updated_at = now()
from public.escritorios e
where e.slug = 'eze' and an.escritorio_id = e.id and an.nome = $q$Itajaí$q$ and coalesce(trim(an.orientacoes), '') = '';

with a as (select an.id, an.escritorio_id from public.analistas an join public.escritorios e on e.id = an.escritorio_id
            where e.slug = 'eze' and an.nome = $q$Itajaí$q$)
insert into public.analista_itens (escritorio_id, analista_id, ordem, grupo, texto, tipo)
select a.escritorio_id, a.id, v.ordem, v.grupo, v.texto, 'checklist' from a, (values
  (1, $q$Projeto Legal$q$, $q$Modelo Moratta R23, folhas 00–23. Art. 36 da LC 467/2024: conferir consulta prévia, pareceres e documentos indicados.$q$),
  (2, $q$Projeto Legal$q$, $q$Art. 37: conferir padrões de apresentação, escalas, assinaturas, responsabilidade técnica e termo de acessibilidade e calçada. Conferir documentação no Aprova Digital e regulamento aplicável (Decreto 13.477/2025).$q$),
  (3, $q$Projeto Legal$q$, $q$Usar o quadro da prancha 00. Comparar ocupação máxima e projetada do embasamento e torre em % e m². Comparar permeabilidade mínima e projetada em % e m².$q$),
  (4, $q$Projeto Legal$q$, $q$Separar CA básico, de outorga e total, com coeficientes e áreas computáveis correspondentes. Buscar os valores da zona do novo empreendimento.$q$),
  (5, $q$Projeto Legal$q$, $q$Somar áreas por torre e contar a base comum uma única vez. Cruzar níveis, multiplicadores, cortes, fachadas e títulos das folhas.$q$)
) as v(ordem, grupo, texto)
where not exists (select 1 from public.analista_itens i where i.analista_id = a.id);

select 'ok' as resultado;