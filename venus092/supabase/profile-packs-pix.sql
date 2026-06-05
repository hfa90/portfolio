insert into storage.buckets (id, name, public)
values ('pack-media', 'pack-media', false),
       ('pack-proofs', 'pack-proofs', false)
on conflict (id) do nothing;

create table if not exists public.profile_pix_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  pix_key text not null,
  pix_key_type text not null default 'aleatoria' check (pix_key_type in ('cpf','cnpj','email','telefone','aleatoria')),
  receiver_name text not null,
  receiver_city text not null default 'SAO PAULO',
  updated_at timestamptz not null default now()
);

alter table public.profile_pix_settings enable row level security;

create table if not exists public.profile_packs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  description text,
  price numeric(10,2) not null check (price > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profile_packs enable row level security;
create index if not exists profile_packs_profile_idx on public.profile_packs(profile_id, active, created_at desc);

create table if not exists public.profile_pack_media (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.profile_packs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image','video')),
  file_name text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profile_pack_media enable row level security;
create index if not exists profile_pack_media_pack_idx on public.profile_pack_media(pack_id, sort_order);
create index if not exists profile_pack_media_profile_idx on public.profile_pack_media(profile_id);

create table if not exists public.profile_pack_orders (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.profile_packs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  proof_storage_path text,
  proof_file_name text,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(pack_id, customer_id)
);

alter table public.profile_pack_orders enable row level security;
create index if not exists profile_pack_orders_profile_idx on public.profile_pack_orders(profile_id, status, created_at desc);
create index if not exists profile_pack_orders_customer_idx on public.profile_pack_orders(customer_id, created_at desc);

revoke all on public.profile_pix_settings from anon, authenticated;
grant select on public.profile_pix_settings to anon, authenticated;
grant insert, update, delete on public.profile_pix_settings to authenticated;

revoke all on public.profile_packs from anon, authenticated;
grant select on public.profile_packs to anon, authenticated;
grant insert, update, delete on public.profile_packs to authenticated;

revoke all on public.profile_pack_media from anon, authenticated;
grant select on public.profile_pack_media to authenticated;
grant insert, update, delete on public.profile_pack_media to authenticated;

revoke all on public.profile_pack_orders from anon, authenticated;
grant select, insert, update on public.profile_pack_orders to authenticated;

drop policy if exists "customers pack professional read" on public.customers;
create policy "customers pack professional read"
on public.customers for select
to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.profile_pack_orders o
    where o.customer_id = customers.id
      and o.profile_id = (select auth.uid())
  )
);

drop policy if exists "pix public active profile read" on public.profile_pix_settings;
drop policy if exists "pix public or owner read" on public.profile_pix_settings;
create policy "pix public or owner read"
on public.profile_pix_settings for select
to anon, authenticated
using (
  profile_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id = profile_id and p.status = 'active')
);

drop policy if exists "pix owner write" on public.profile_pix_settings;
drop policy if exists "pix owner insert" on public.profile_pix_settings;
create policy "pix owner insert"
on public.profile_pix_settings for insert
to authenticated
with check (profile_id = (select auth.uid()));

drop policy if exists "pix owner update" on public.profile_pix_settings;
create policy "pix owner update"
on public.profile_pix_settings for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists "pix owner delete" on public.profile_pix_settings;
create policy "pix owner delete"
on public.profile_pix_settings for delete
to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists "packs public active read" on public.profile_packs;
drop policy if exists "packs public active or owner read" on public.profile_packs;
create policy "packs public active or owner read"
on public.profile_packs for select
to anon, authenticated
using (active = true or profile_id = (select auth.uid()));

drop policy if exists "packs owner write" on public.profile_packs;
drop policy if exists "packs owner insert" on public.profile_packs;
create policy "packs owner insert"
on public.profile_packs for insert
to authenticated
with check (profile_id = (select auth.uid()));

drop policy if exists "packs owner update" on public.profile_packs;
create policy "packs owner update"
on public.profile_packs for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists "packs owner delete" on public.profile_packs;
create policy "packs owner delete"
on public.profile_packs for delete
to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists "pack media owner or approved read" on public.profile_pack_media;
create policy "pack media owner or approved read"
on public.profile_pack_media for select
to authenticated
using (
  profile_id = (select auth.uid())
  or exists (
    select 1 from public.profile_pack_orders o
    where o.pack_id = profile_pack_media.pack_id
      and o.customer_id = (select auth.uid())
      and o.status = 'approved'
  )
);

drop policy if exists "pack media owner write" on public.profile_pack_media;
drop policy if exists "pack media owner insert" on public.profile_pack_media;
create policy "pack media owner insert"
on public.profile_pack_media for insert
to authenticated
with check (profile_id = (select auth.uid()));

drop policy if exists "pack media owner update" on public.profile_pack_media;
create policy "pack media owner update"
on public.profile_pack_media for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists "pack media owner delete" on public.profile_pack_media;
create policy "pack media owner delete"
on public.profile_pack_media for delete
to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists "pack orders participants read" on public.profile_pack_orders;
create policy "pack orders participants read"
on public.profile_pack_orders for select
to authenticated
using (customer_id = (select auth.uid()) or profile_id = (select auth.uid()));

drop policy if exists "pack orders customer insert" on public.profile_pack_orders;
create policy "pack orders customer insert"
on public.profile_pack_orders for insert
to authenticated
with check (
  customer_id = (select auth.uid())
  and exists (select 1 from public.customers c where c.id = (select auth.uid()))
  and exists (select 1 from public.profile_packs p where p.id = pack_id and p.profile_id = profile_pack_orders.profile_id and p.active = true)
);

drop policy if exists "pack orders participants update" on public.profile_pack_orders;
create policy "pack orders participants update"
on public.profile_pack_orders for update
to authenticated
using (customer_id = (select auth.uid()) or profile_id = (select auth.uid()))
with check (customer_id = (select auth.uid()) or profile_id = (select auth.uid()));

drop policy if exists "pack_media_owner_upload" on storage.objects;
create policy "pack_media_owner_upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'pack-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "pack_media_owner_or_approved_read" on storage.objects;
create policy "pack_media_owner_or_approved_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'pack-media'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1
      from public.profile_pack_media m
      join public.profile_pack_orders o on o.pack_id = m.pack_id
      where m.storage_path = storage.objects.name
        and o.customer_id = (select auth.uid())
        and o.status = 'approved'
    )
  )
);

drop policy if exists "pack_media_owner_delete" on storage.objects;
create policy "pack_media_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'pack-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "pack_proofs_customer_upload" on storage.objects;
create policy "pack_proofs_customer_upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'pack-proofs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "pack_proofs_participants_read" on storage.objects;
create policy "pack_proofs_participants_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'pack-proofs'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.profile_pack_orders o
      where o.proof_storage_path = storage.objects.name
        and o.profile_id = (select auth.uid())
    )
  )
);
