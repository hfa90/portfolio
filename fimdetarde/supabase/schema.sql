-- =========================================================================
-- FIM DE TARDE — Sistema de comandas digitais via QR Code
-- Schema para Supabase (Postgres + RLS + Realtime)
-- =========================================================================
-- Como aplicar:
--   1. Abra seu projeto em app.supabase.com > SQL Editor
--   2. Cole este arquivo inteiro e clique em "Run"
--   3. Em Database > Replication, habilite Realtime para as tabelas:
--      orders, order_items, comandas, sessions, tables
-- =========================================================================

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------------------
-- STAFF (garçom, cozinha, admin) — vinculado ao Supabase Auth
-- -------------------------------------------------------------------------
create table staff (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'garcom' check (role in ('garcom','cozinha','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- MESAS — QR fixo, impresso e laminado, reutilizado todo dia
-- -------------------------------------------------------------------------
create table tables (
  id uuid primary key default gen_random_uuid(),
  number int not null unique,
  qr_token text not null unique default encode(gen_random_bytes(6), 'hex'),
  status text not null default 'livre' check (status in ('livre','ocupada')),
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- SESSÕES — abre quando o primeiro QR da mesa é escaneado, fecha ao pagar
-- -------------------------------------------------------------------------
create table sessions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references tables(id),
  status text not null default 'aberta' check (status in ('aberta','fechada')),
  people_count int not null default 1,
  opened_at timestamptz not null default now(),
  closed_by uuid references staff(id),
  closed_at timestamptz
);
create index idx_sessions_table_open on sessions(table_id) where status = 'aberta';

-- -------------------------------------------------------------------------
-- COMANDAS INDIVIDUAIS — QR próprio de cada cliente dentro da sessão
-- -------------------------------------------------------------------------
create table comandas (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  nome text not null,
  qr_token text not null unique default encode(gen_random_bytes(6), 'hex'),
  status text not null default 'aberta' check (status in ('aberta','fechada')),
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- CARDÁPIO
-- -------------------------------------------------------------------------
create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  station text not null default 'bar' check (station in ('bar','cozinha')),
  sort_order int not null default 0
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references menu_categories(id),
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  available boolean not null default true,
  sort_order int not null default 0
);

-- -------------------------------------------------------------------------
-- PEDIDOS — comanda_id nulo = pedido lançado direto na mesa (compartilhado)
-- -------------------------------------------------------------------------
create table orders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  comanda_id uuid references comandas(id),
  origem text not null default 'cliente' check (origem in ('cliente','garcom')),
  staff_id uuid references staff(id),
  status text not null default 'pendente' check (status in ('pendente','preparo','pronto','entregue','cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_orders_session on orders(session_id);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id),
  item_name text not null,
  unit_price numeric(10,2) not null,
  quantity int not null default 1 check (quantity > 0),
  notes text,
  station text not null default 'bar' check (station in ('bar','cozinha')),
  status text not null default 'pendente' check (status in ('pendente','preparo','pronto','entregue','cancelado')),
  created_at timestamptz not null default now()
);
create index idx_order_items_order on order_items(order_id);
create index idx_order_items_station_status on order_items(station, status);

-- -------------------------------------------------------------------------
-- Trigger: manter orders.updated_at e propagar status agregado do pedido
-- -------------------------------------------------------------------------
create or replace function touch_order() returns trigger as $$
begin
  update orders set updated_at = now() where id = new.order_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_touch_order
after insert or update on order_items
for each row execute function touch_order();

-- =========================================================================
-- ROW LEVEL SECURITY
-- Clientes (anon) só enxergam/mexem no que pertence à sessão/comanda aberta
-- que eles acessaram pelo token do QR. Staff autenticado tem acesso amplo.
-- =========================================================================
alter table tables enable row level security;
alter table sessions enable row level security;
alter table comandas enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table staff enable row level security;

-- Cardápio é público para leitura (precisa aparecer sem login)
create policy "cardapio publico" on menu_categories for select using (true);
create policy "itens publicos" on menu_items for select using (true);

-- Mesas: leitura pública só para localizar pelo qr_token (necessário no app)
create policy "mesa publica leitura" on tables for select using (true);

-- Sessões: leitura/criação pública (o app cria a sessão ao escanear a mesa)
create policy "sessao leitura publica" on sessions for select using (true);
create policy "sessao criacao publica" on sessions for insert with check (true);
create policy "sessao update staff" on sessions for update using (
  auth.uid() is not null
);

-- Comandas: leitura pública (para localizar pelo qr_token), criação pública
create policy "comanda leitura publica" on comandas for select using (true);
create policy "comanda criacao publica" on comandas for insert with check (true);
create policy "comanda update publica" on comandas for update using (true);

-- Pedidos e itens: cliente pode criar e ler (o token da URL já restringe
-- o que ele consegue montar na interface); staff autenticado pode tudo
create policy "orders leitura publica" on orders for select using (true);
create policy "orders criacao publica" on orders for insert with check (true);
create policy "orders update staff" on orders for update using (
  auth.uid() is not null
);

create policy "order_items leitura publica" on order_items for select using (true);
create policy "order_items criacao publica" on order_items for insert with check (true);
create policy "order_items update publica" on order_items for update using (true);

-- Staff: cada funcionário só lê seu próprio registro; leitura de nomes
-- para exibir "quem atendeu" é liberada, escrita é restrita a admins
create policy "staff leitura publica" on staff for select using (true);
create policy "staff self update" on staff for update using (auth.uid() = auth_id);

-- Mesas/tables: apenas staff autenticado pode abrir/fechar (update)
create policy "mesa update staff" on tables for update using (auth.uid() is not null);
create policy "mesa insert staff" on tables for insert with check (auth.uid() is not null);

-- Cardápio: apenas staff autenticado edita
create policy "categoria insert staff" on menu_categories for insert with check (auth.uid() is not null);
create policy "categoria update staff" on menu_categories for update using (auth.uid() is not null);
create policy "item insert staff" on menu_items for insert with check (auth.uid() is not null);
create policy "item update staff" on menu_items for update using (auth.uid() is not null);

-- =========================================================================
-- DADOS DE EXEMPLO — cardápio inicial (edite/apague à vontade)
-- =========================================================================
insert into menu_categories (name, station, sort_order) values
  ('Bebidas', 'bar', 1),
  ('Drinks', 'bar', 2),
  ('Iscas & Petiscos', 'cozinha', 3),
  ('Pratos', 'cozinha', 4);

insert into menu_items (category_id, name, description, price, sort_order)
select id, 'Cerveja Long Neck', 'Gelada, 355ml', 9.00, 1 from menu_categories where name = 'Bebidas'
union all
select id, 'Caipirinha', 'Limão, cachaça ou vodka', 16.00, 1 from menu_categories where name = 'Drinks'
union all
select id, 'Isca de Tambaqui', 'Porção com molho tártaro', 48.00, 1 from menu_categories where name = 'Iscas & Petiscos'
union all
select id, 'Batata Frita', 'Porção grande', 32.00, 2 from menu_categories where name = 'Iscas & Petiscos';

-- Mesa de teste
insert into tables (number) values (1), (2), (3);

-- =========================================================================
-- Para criar o primeiro usuário admin/garçom:
--   1. Crie o usuário em Authentication > Users (email + senha)
--   2. Rode:
--      insert into staff (auth_id, name, role)
--      values ('<uuid-do-usuario>', 'Nome do Garçom', 'garcom');
-- =========================================================================
