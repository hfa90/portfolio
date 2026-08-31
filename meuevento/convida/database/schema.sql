-- ============================================================
-- CONVIDA — Schema do banco de dados (Supabase / PostgreSQL)
-- Cole este arquivo inteiro no SQL Editor do seu projeto Supabase
-- e clique em "Run". Pode rodar de uma vez só.
-- ============================================================

-- ------------------------------------------------------------
-- EXTENSÕES
-- ------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- PERFIS (1 por usuário autenticado)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: dono pode ver e editar"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- cria o perfil automaticamente quando alguém se cadastra
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- CONVITES
-- categoria define quais "campos inteligentes" aparecem no front-end
-- ------------------------------------------------------------
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text unique not null,                 -- usado na URL pública /convite.html?c=slug
  category text not null,                    -- infantil_menino | infantil_menina | adolescente_15 | adulto | idoso | encontro | casamento | outro
  title text not null,                       -- "Aniversário da Helena"
  honoree_name text,                         -- nome do(a) aniversariante / noivos / anfitrião
  host_names text,                           -- quem está organizando/convidando
  event_date date not null,
  event_time text,
  location_name text,
  location_address text,
  location_maps_url text,
  cover_image_url text,
  theme_color text not null default '#4A2545',
  message text,                              -- recado personalizado do convite
  dynamic_fields jsonb not null default '{}'::jsonb,   -- respostas dos campos extras da categoria
  rsvp_deadline date,
  allow_companions boolean not null default true,
  max_companions int not null default 3,
  gift_list_enabled boolean not null default false,
  financial_enabled boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invites enable row level security;

create policy "invites: qualquer um pode ver convite publicado"
  on public.invites for select
  using (is_published = true or auth.uid() = owner_id);

create policy "invites: dono pode criar"
  on public.invites for insert
  with check (auth.uid() = owner_id);

create policy "invites: dono pode editar"
  on public.invites for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "invites: dono pode apagar"
  on public.invites for delete
  using (auth.uid() = owner_id);

-- ------------------------------------------------------------
-- CONVIDADOS (RSVP)
-- ------------------------------------------------------------
create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invites(id) on delete cascade,
  name text not null,
  phone text,
  status text not null default 'pendente' check (status in ('pendente','confirmado','recusado')),
  num_companions int not null default 0,
  dynamic_answers jsonb not null default '{}'::jsonb,  -- ex: {"o_que_vai_levar": "Refrigerante"}
  guest_message text,
  added_by text not null default 'convidado' check (added_by in ('convidado','anfitriao')),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.guests enable row level security;

create policy "guests: dono do convite ve tudo"
  on public.guests for select
  using (
    exists (select 1 from public.invites i where i.id = invite_id and i.owner_id = auth.uid())
  );

create policy "guests: qualquer um pode confirmar presenca"
  on public.guests for insert
  with check (true);

create policy "guests: dono do convite pode editar/apagar"
  on public.guests for update
  using (exists (select 1 from public.invites i where i.id = invite_id and i.owner_id = auth.uid()));

create policy "guests: dono do convite pode apagar"
  on public.guests for delete
  using (exists (select 1 from public.invites i where i.id = invite_id and i.owner_id = auth.uid()));

-- ------------------------------------------------------------
-- LISTA DE PRESENTES (opcional)
-- ------------------------------------------------------------
create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invites(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2),
  image_url text,
  status text not null default 'disponivel' check (status in ('disponivel','reservado','recebido')),
  reserved_by_name text,
  reserved_by_phone text,
  created_at timestamptz not null default now()
);

alter table public.gifts enable row level security;

create policy "gifts: qualquer um com o link pode ver"
  on public.gifts for select
  using (true);

create policy "gifts: dono pode criar"
  on public.gifts for insert
  with check (exists (select 1 from public.invites i where i.id = invite_id and i.owner_id = auth.uid()));

create policy "gifts: qualquer um pode reservar (atualizar status)"
  on public.gifts for update
  using (true);

create policy "gifts: dono pode apagar"
  on public.gifts for delete
  using (exists (select 1 from public.invites i where i.id = invite_id and i.owner_id = auth.uid()));

-- ------------------------------------------------------------
-- PLANEJAMENTO FINANCEIRO (privado, só o anfitrião vê)
-- ------------------------------------------------------------
create table if not exists public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null unique references public.invites(id) on delete cascade,
  goal_amount numeric(10,2) not null default 0,
  deadline date,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.financial_goals enable row level security;

create policy "financial_goals: somente o dono"
  on public.financial_goals for all
  using (exists (select 1 from public.invites i where i.id = invite_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from public.invites i where i.id = invite_id and i.owner_id = auth.uid()));

create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invites(id) on delete cascade,
  description text not null,
  amount numeric(10,2) not null,
  entry_type text not null check (entry_type in ('receita','despesa')),
  entry_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.financial_entries enable row level security;

create policy "financial_entries: somente o dono"
  on public.financial_entries for all
  using (exists (select 1 from public.invites i where i.id = invite_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from public.invites i where i.id = invite_id and i.owner_id = auth.uid()));

-- ------------------------------------------------------------
-- JOGOS — Perguntas e Respostas sobre o(a) aniversariante
-- ------------------------------------------------------------
create table if not exists public.game_questions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invites(id) on delete cascade,
  question text not null,
  options jsonb not null default '[]'::jsonb,   -- ["op1","op2","op3","op4"]
  correct_index int not null default 0,
  penalty text,                                  -- "quem errar paga uma prenda: imitar um animal"
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.game_questions enable row level security;

create policy "game_questions: qualquer um com o link pode ver (para jogar)"
  on public.game_questions for select
  using (true);

create policy "game_questions: dono pode gerenciar"
  on public.game_questions for insert
  with check (exists (select 1 from public.invites i where i.id = invite_id and i.owner_id = auth.uid()));

create policy "game_questions: dono pode editar"
  on public.game_questions for update
  using (exists (select 1 from public.invites i where i.id = invite_id and i.owner_id = auth.uid()));

create policy "game_questions: dono pode apagar"
  on public.game_questions for delete
  using (exists (select 1 from public.invites i where i.id = invite_id and i.owner_id = auth.uid()));

-- ------------------------------------------------------------
-- Índices úteis
-- ------------------------------------------------------------
create index if not exists idx_invites_owner on public.invites(owner_id);
create index if not exists idx_guests_invite on public.guests(invite_id);
create index if not exists idx_gifts_invite on public.gifts(invite_id);
create index if not exists idx_financial_entries_invite on public.financial_entries(invite_id);
create index if not exists idx_game_questions_invite on public.game_questions(invite_id);

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
