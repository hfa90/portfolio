-- ============================================================================
-- COPA RD SAÚDE CD-AM — Schema Supabase (PostgreSQL)
-- Torneio interno: Tênis de Mesa, Damas e Dominó — formato Eliminação Dupla
-- ============================================================================
-- Como aplicar:
--   1. Supabase Dashboard > SQL Editor > cole este arquivo inteiro > Run
--   2. Crie um bucket de Storage chamado "comprovantes" (ver seção STORAGE no fim)
--   3. Ajuste o e-mail do admin em "auth_admins" (ver seção ADMIN no fim)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type status_inscricao as enum (
  'aguardando_pagamento',  -- inscrição criada, aguardando pix
  'em_analise',             -- comprovante enviado, aguardando confirmação do admin
  'confirmada',             -- pagamento validado, atleta entra no chaveamento
  'rejeitada',              -- comprovante recusado
  'cancelada'
);

create type status_pagamento as enum (
  'pendente',
  'em_analise',
  'aprovado',
  'rejeitado'
);

create type status_chave as enum (
  'aguardando_inscricoes',
  'sorteio_realizado',
  'em_andamento',
  'finalizada'
);

create type fase_partida as enum (
  'WB',           -- winner bracket (chave de vencedores)
  'LB',           -- loser bracket (chave de perdedores / repescagem)
  'GF'            -- grand final (+ reset, se necessário)
);

create type status_partida as enum (
  'aguardando',     -- esperando definição dos dois participantes
  'pronta',         -- os dois participantes já estão definidos
  'em_andamento',
  'finalizada',
  'wo'              -- vitória por W.O.
);

-- ----------------------------------------------------------------------------
-- MODALIDADES (Tênis de Mesa, Damas, Dominó)
-- ----------------------------------------------------------------------------
create table modalidades (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,           -- 'tenis-de-mesa' | 'damas' | 'domino'
  nome          text not null,
  icone         text,                           -- nome/emoji do ícone para a UI
  max_inscritos int,                             -- opcional: teto de vagas
  valor_inscricao numeric(10,2) not null default 10.00,
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now()
);

comment on table modalidades is 'As três modalidades da Copa RD Saúde CD-AM';

-- ----------------------------------------------------------------------------
-- ATLETAS (pessoa física, pode se inscrever em mais de uma modalidade)
-- ----------------------------------------------------------------------------
create table atletas (
  id              uuid primary key default gen_random_uuid(),
  nome_completo   text not null,
  email           text not null,
  whatsapp        text not null,                 -- formato: DDD+numero, ex: 92995258724
  loja_filial     text,                           -- loja/setor da RD Saúde onde trabalha
  matricula       text,                           -- opcional: matrícula do colaborador
  user_id         uuid references auth.users(id), -- preenchido se o atleta usar login (opcional)
  criado_em       timestamptz not null default now(),
  constraint email_valido check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

create index idx_atletas_email on atletas (lower(email));
create index idx_atletas_whatsapp on atletas (whatsapp);

-- ----------------------------------------------------------------------------
-- INSCRIÇÕES (um atleta + uma modalidade = uma inscrição)
-- ----------------------------------------------------------------------------
create table inscricoes (
  id              uuid primary key default gen_random_uuid(),
  atleta_id       uuid not null references atletas(id) on delete cascade,
  modalidade_id   uuid not null references modalidades(id) on delete restrict,
  status          status_inscricao not null default 'aguardando_pagamento',
  seed            int,                              -- posição no sorteio (definida na geração da chave)
  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (atleta_id, modalidade_id)                  -- não permite inscrição duplicada na mesma modalidade
);

create index idx_inscricoes_modalidade on inscricoes (modalidade_id, status);

-- ----------------------------------------------------------------------------
-- PAGAMENTOS (1 pagamento por inscrição — pix de R$10,00)
-- ----------------------------------------------------------------------------
create table pagamentos (
  id                  uuid primary key default gen_random_uuid(),
  inscricao_id        uuid not null references inscricoes(id) on delete cascade unique,
  valor               numeric(10,2) not null default 10.00,
  chave_pix           text not null default 'haydenfernandes.ti@gmail.com',
  txid                text not null,                     -- identificador único do pix (usado no payload BR Code)
  pix_copia_e_cola    text,                               -- payload EMV gerado
  comprovante_url     text,                               -- caminho no Storage (bucket "comprovantes")
  comprovante_enviado_em timestamptz,
  enviado_whatsapp    boolean not null default false,     -- se o atleta confirmou envio via WhatsApp
  status              status_pagamento not null default 'pendente',
  revisado_por        text,                                -- e-mail/nome do admin que confirmou
  revisado_em         timestamptz,
  motivo_rejeicao     text,
  criado_em           timestamptz not null default now()
);

create index idx_pagamentos_status on pagamentos (status);

-- ----------------------------------------------------------------------------
-- CHAVES (uma chave de eliminação dupla por modalidade)
-- ----------------------------------------------------------------------------
create table chaves (
  id              uuid primary key default gen_random_uuid(),
  modalidade_id   uuid not null references modalidades(id) on delete cascade,
  tamanho         int not null,                    -- próxima potência de 2 >= nº de inscritos confirmados
  status          status_chave not null default 'aguardando_inscricoes',
  gerada_em       timestamptz,
  finalizada_em   timestamptz,
  campeao_id      uuid references atletas(id),
  vice_id         uuid references atletas(id),
  criado_em       timestamptz not null default now(),
  unique (modalidade_id)                            -- 1 chave ativa por modalidade
);

-- ----------------------------------------------------------------------------
-- PARTIDAS (nós do grafo de eliminação dupla)
-- Cada partida aponta para a próxima partida do vencedor e, quando aplicável,
-- para a próxima partida do perdedor (drop da winner bracket para a loser bracket).
-- ----------------------------------------------------------------------------
create table partidas (
  id                    uuid primary key default gen_random_uuid(),
  chave_id              uuid not null references chaves(id) on delete cascade,
  fase                  fase_partida not null,
  rodada                int not null,               -- nº da rodada dentro da fase (1, 2, 3...)
  posicao               int not null,                -- posição da partida dentro da rodada (ordem visual)
  atleta1_id            uuid references atletas(id),
  atleta2_id            uuid references atletas(id),
  origem_atleta1_partida_id uuid references partidas(id), -- de onde vem o participante 1 (histórico/rastreio)
  origem_atleta2_partida_id uuid references partidas(id),
  placar1               int,
  placar2               int,
  vencedor_id           uuid references atletas(id),
  perdedor_id           uuid references atletas(id),
  status                status_partida not null default 'aguardando',
  proxima_partida_vencedor_id uuid references partidas(id), -- para onde o vencedor avança
  proxima_partida_perdedor_id uuid references partidas(id), -- para onde o perdedor cai (só existe em partidas da WB)
  avanco_automatico     boolean not null default false, -- true = se o lado que faltar preencher for um "bye" definitivo, avança sozinho sem precisar jogar
  agendada_em           timestamptz,
  mesa_local            text,                          -- ex: "Mesa 1 - Refeitório"
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create index idx_partidas_chave on partidas (chave_id, fase, rodada, posicao);
create index idx_partidas_status on partidas (chave_id, status);

-- ----------------------------------------------------------------------------
-- TRIGGERS: atualizado_em automático
-- ----------------------------------------------------------------------------
create or replace function set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger trg_inscricoes_atualizado_em
  before update on inscricoes
  for each row execute function set_atualizado_em();

create trigger trg_partidas_atualizado_em
  before update on partidas
  for each row execute function set_atualizado_em();

-- Quando o pagamento é aprovado, a inscrição vira "confirmada" automaticamente.
-- SECURITY DEFINER é necessário aqui: quem dispara esse trigger na prática é o
-- próprio atleta (anônimo) ao anexar o comprovante (pagamentos.status vira
-- 'em_analise'), e ele não tem permissão de RLS para alterar "inscricoes"
-- diretamente. O trigger, rodando com o privilégio do dono da função,
-- contorna isso de forma controlada (só faz essa sincronização específica).
create or replace function sync_status_inscricao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'aprovado' and (old.status is distinct from 'aprovado') then
    update inscricoes set status = 'confirmada' where id = new.inscricao_id;
  elsif new.status = 'rejeitado' and (old.status is distinct from 'rejeitado') then
    update inscricoes set status = 'rejeitada' where id = new.inscricao_id;
  elsif new.status = 'em_analise' and (old.status is distinct from 'em_analise') then
    update inscricoes set status = 'em_analise' where id = new.inscricao_id;
  end if;
  return new;
end;
$$;

create trigger trg_sync_status_inscricao
  after update on pagamentos
  for each row execute function sync_status_inscricao();

-- Protege os campos sensíveis do pagamento (valor, chave pix, txid, payload,
-- dados da revisão) contra alteração por quem não é admin — o visitante só
-- pode mexer em comprovante_url / comprovante_enviado_em / enviado_whatsapp
-- e mover o status entre 'pendente' e 'em_analise' (já garantido pela RLS).
create or replace function proteger_campos_pagamento()
returns trigger language plpgsql as $$
begin
  if not is_admin() and (
    new.valor is distinct from old.valor or
    new.chave_pix is distinct from old.chave_pix or
    new.txid is distinct from old.txid or
    new.pix_copia_e_cola is distinct from old.pix_copia_e_cola or
    new.inscricao_id is distinct from old.inscricao_id or
    new.revisado_por is distinct from old.revisado_por or
    new.revisado_em is distinct from old.revisado_em or
    new.motivo_rejeicao is distinct from old.motivo_rejeicao
  ) then
    raise exception 'Você não tem permissão para alterar esses campos do pagamento';
  end if;
  return new;
end;
$$;

create trigger trg_proteger_campos_pagamento
  before update on pagamentos
  for each row execute function proteger_campos_pagamento();

-- ----------------------------------------------------------------------------
-- VIEW: placar/andamento simplificado por modalidade (facilita o front-end)
-- ----------------------------------------------------------------------------
create view vw_inscricoes_confirmadas as
select
  i.id as inscricao_id,
  m.slug as modalidade_slug,
  m.nome as modalidade_nome,
  a.id as atleta_id,
  a.nome_completo,
  a.loja_filial,
  i.seed,
  i.status
from inscricoes i
join atletas a on a.id = i.atleta_id
join modalidades m on m.id = i.modalidade_id
where i.status = 'confirmada';

create view vw_partidas_completas as
select
  p.*,
  m.slug as modalidade_slug,
  m.nome as modalidade_nome,
  a1.nome_completo as atleta1_nome,
  a2.nome_completo as atleta2_nome,
  av.nome_completo as vencedor_nome
from partidas p
join chaves c on c.id = p.chave_id
join modalidades m on m.id = c.modalidade_id
left join atletas a1 on a1.id = p.atleta1_id
left join atletas a2 on a2.id = p.atleta2_id
left join atletas av on av.id = p.vencedor_id;

-- ============================================================================
-- ROW LEVEL SECURITY
-- Estratégia: leitura pública (site institucional/chaveamento é público),
-- escrita pública controlada apenas para o fluxo de inscrição/pagamento,
-- e ações administrativas (aprovar pagamento, gerar chave, lançar resultado)
-- restritas a usuários autenticados marcados como admin em "auth_admins".
-- ============================================================================

create table auth_admins (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  email     text not null,
  criado_em timestamptz not null default now()
);

create or replace function is_admin()
returns boolean language sql stable as $$
  select exists (
    select 1 from auth_admins where user_id = auth.uid()
  );
$$;

alter table modalidades enable row level security;
alter table atletas enable row level security;
alter table inscricoes enable row level security;
alter table pagamentos enable row level security;
alter table chaves enable row level security;
alter table partidas enable row level security;
alter table auth_admins enable row level security;

-- modalidades: leitura pública, escrita só admin
create policy "modalidades_select_publica" on modalidades for select using (true);
create policy "modalidades_admin_all" on modalidades for all using (is_admin()) with check (is_admin());

-- atletas: qualquer um pode se cadastrar (insert), leitura pública dos dados
-- não sensíveis é aceitável aqui pois é evento interno; update/delete só admin
create policy "atletas_select_publica" on atletas for select using (true);
create policy "atletas_insert_publica" on atletas for insert with check (true);
create policy "atletas_update_admin" on atletas for update using (is_admin());
create policy "atletas_delete_admin" on atletas for delete using (is_admin());

-- inscricoes: leitura pública (chaveamento), criação pública, mudança de status só admin
create policy "inscricoes_select_publica" on inscricoes for select using (true);
create policy "inscricoes_insert_publica" on inscricoes for insert with check (true);
create policy "inscricoes_update_admin" on inscricoes for update using (is_admin());
create policy "inscricoes_delete_admin" on inscricoes for delete using (is_admin());

-- pagamentos: criação pública (gerar pix), atleta pode atualizar só para anexar
-- comprovante (sem poder aprovar a si mesmo); aprovação é só admin
create policy "pagamentos_select_publica" on pagamentos for select using (true);
create policy "pagamentos_insert_publica" on pagamentos for insert with check (true);
create policy "pagamentos_update_anexo_comprovante" on pagamentos for update
  using (status = 'pendente' or status = 'em_analise')
  with check (status in ('pendente','em_analise'));
create policy "pagamentos_admin_all" on pagamentos for all using (is_admin()) with check (is_admin());

-- chaves e partidas: leitura pública, escrita só admin
create policy "chaves_select_publica" on chaves for select using (true);
create policy "chaves_admin_all" on chaves for all using (is_admin()) with check (is_admin());

create policy "partidas_select_publica" on partidas for select using (true);
create policy "partidas_admin_all" on partidas for all using (is_admin()) with check (is_admin());

-- auth_admins: só o próprio admin lê sua linha; gestão de admins via dashboard/service role
create policy "auth_admins_select_self" on auth_admins for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- SEED: as 3 modalidades da Copa
-- ----------------------------------------------------------------------------
insert into modalidades (slug, nome, icone, valor_inscricao) values
  ('tenis-de-mesa', 'Tênis de Mesa', '🏓', 10.00),
  ('damas',         'Damas',         '⚫',  10.00),
  ('domino',        'Dominó',        '🁵',  10.00);

-- ============================================================================
-- STORAGE (executar separadamente, ou via Dashboard > Storage)
-- ============================================================================
-- 1. Criar bucket "comprovantes" (privado, não público)
-- 2. Policies do bucket (SQL Editor, após criar o bucket):
--
-- create policy "comprovantes_insert_publica"
--   on storage.objects for insert
--   with check (bucket_id = 'comprovantes');
--
-- create policy "comprovantes_select_admin"
--   on storage.objects for select
--   using (bucket_id = 'comprovantes' and is_admin());
--
-- (o app gera uma signed URL para o atleta ver o próprio comprovante logo
--  após o upload; para consultas futuras, só o admin lista o bucket)

-- ============================================================================
-- ADMIN (executar depois de criar o usuário admin em Authentication > Users)
-- ============================================================================
-- insert into auth_admins (user_id, email)
-- values ('COLE-AQUI-O-UUID-DO-USUARIO', 'seu-email-admin@empresa.com');
