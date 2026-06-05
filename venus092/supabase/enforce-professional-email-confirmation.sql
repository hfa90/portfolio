create schema if not exists internal;

create or replace function internal.enforce_profile_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = auth, public, pg_temp
as $$
begin
  if new.status = 'active' then
    if not exists (
      select 1
      from auth.users u
      where u.id = new.id
        and u.email_confirmed_at is not null
    ) then
      raise exception 'Confirme o e-mail antes de ativar o perfil profissional.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function internal.enforce_profile_email_confirmed() from public;

drop trigger if exists trg_profiles_email_confirmed_before_active on public.profiles;

create trigger trg_profiles_email_confirmed_before_active
before insert or update of status on public.profiles
for each row
execute function internal.enforce_profile_email_confirmed();
