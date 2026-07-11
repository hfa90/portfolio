create extension if not exists pgcrypto;

create table if not exists public.banco_games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  bank_token text not null unique,
  name text not null default 'Partida',
  state jsonb not null,
  player_tokens jsonb not null default '[]'::jsonb,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists banco_games_bank_token_idx
  on public.banco_games (bank_token);

create index if not exists banco_games_updated_at_idx
  on public.banco_games (updated_at desc);

alter table public.banco_games enable row level security;

revoke all on public.banco_games from anon, authenticated;

drop policy if exists "Public can read game rooms" on public.banco_games;
drop policy if exists "Public can create game rooms" on public.banco_games;
drop policy if exists "Public can update game rooms" on public.banco_games;
drop policy if exists "Public can delete game rooms" on public.banco_games;

create or replace function public.banco_private_response(
  p_game public.banco_games,
  p_role text,
  p_player_id text default null,
  p_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb := p_game.state;
  v_visible_state jsonb := p_game.state;
  v_player_links jsonb := '[]'::jsonb;
begin
  if p_role = 'bank' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', player_item->>'name',
      'token', token_item->>'token'
    )), '[]'::jsonb)
    into v_player_links
    from jsonb_array_elements(p_game.player_tokens) as token_item
    join jsonb_array_elements(v_state->'players') as player_item
      on player_item->>'id' = token_item->>'player_id';

    return jsonb_build_object(
      'role', 'bank',
      'token', coalesce(p_token, p_game.bank_token),
      'state', v_state,
      'playerLinks', v_player_links
    );
  end if;

  select jsonb_set(v_visible_state, '{players}', coalesce(jsonb_agg(
    case
      when player_item->>'id' = p_player_id then player_item
      else jsonb_build_object(
        'id', player_item->>'id',
        'name', player_item->>'name',
        'color', player_item->>'color',
        'balance', 0,
        'startingBalance', 0
      )
    end
  ), '[]'::jsonb))
  into v_visible_state
  from jsonb_array_elements(v_state->'players') as player_item;

  select jsonb_set(v_visible_state, '{history}', coalesce(jsonb_agg(event_item), '[]'::jsonb))
  into v_visible_state
  from jsonb_array_elements(v_state->'history') as event_item
  where event_item->>'playerId' = p_player_id
    or exists (
      select 1
      from jsonb_array_elements(coalesce(event_item->'entries', '[]'::jsonb)) as entry_item
      where entry_item->>'id' = p_player_id
    );

  return jsonb_build_object(
    'role', 'player',
    'token', p_token,
    'playerId', p_player_id,
    'state', v_visible_state,
    'playerLinks', '[]'::jsonb
  );
end;
$$;

create or replace function public.banco_create_game(
  p_name text,
  p_players jsonb,
  p_starting_balance integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_code text := lower(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  v_bank_token text := encode(gen_random_bytes(24), 'hex');
  v_players jsonb := '[]'::jsonb;
  v_player_tokens jsonb := '[]'::jsonb;
  v_player jsonb;
  v_player_id text;
  v_game public.banco_games;
begin
  if jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) < 2 then
    raise exception 'At least two players are required';
  end if;

  for v_player in select * from jsonb_array_elements(p_players)
  loop
    v_player_id := encode(gen_random_bytes(6), 'hex');
    v_players := v_players || jsonb_build_array(jsonb_build_object(
      'id', v_player_id,
      'name', coalesce(nullif(v_player->>'name', ''), 'Jogador'),
      'color', coalesce(nullif(v_player->>'color', ''), '#168c84'),
      'balance', greatest(coalesce(p_starting_balance, 1500), 0),
      'startingBalance', greatest(coalesce(p_starting_balance, 1500), 0)
    ));
    v_player_tokens := v_player_tokens || jsonb_build_array(jsonb_build_object(
      'player_id', v_player_id,
      'token', encode(gen_random_bytes(24), 'hex')
    ));
  end loop;

  insert into public.banco_games (room_code, bank_token, name, state, player_tokens, revision)
  values (
    v_room_code,
    v_bank_token,
    coalesce(nullif(p_name, ''), 'Partida'),
    jsonb_build_object(
      'id', v_room_code,
      'name', coalesce(nullif(p_name, ''), 'Partida'),
      'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'revision', 1,
      'players', v_players,
      'history', '[]'::jsonb
    ),
    v_player_tokens,
    1
  )
  returning * into v_game;

  return public.banco_private_response(v_game, 'bank', null, v_bank_token);
end;
$$;

create or replace function public.banco_get_bank_game(p_bank_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.banco_games;
begin
  select * into v_game
  from public.banco_games
  where bank_token = p_bank_token;

  if v_game.id is null then
    return null;
  end if;

  return public.banco_private_response(v_game, 'bank', null, p_bank_token);
end;
$$;

create or replace function public.banco_get_player_wallet(p_player_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.banco_games;
  v_player_id text;
begin
  select game.*
  into v_game
  from public.banco_games as game
  where exists (
    select 1
    from jsonb_array_elements(game.player_tokens) as token_item
    where token_item->>'token' = p_player_token
  )
  limit 1;

  if v_game.id is null then
    return null;
  end if;

  select token_item->>'player_id'
  into v_player_id
  from jsonb_array_elements(v_game.player_tokens) as token_item
  where token_item->>'token' = p_player_token
  limit 1;

  return public.banco_private_response(v_game, 'player', v_player_id, p_player_token);
end;
$$;

create or replace function public.banco_apply_bank_transaction(
  p_access_token text,
  p_player_id text,
  p_type text,
  p_amount integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.banco_games;
  v_role text := 'bank';
  v_token_player_id text;
  v_delta integer;
  v_state jsonb;
  v_players jsonb := '[]'::jsonb;
  v_player jsonb;
  v_player_name text;
  v_revision integer;
  v_event jsonb;
begin
  if coalesce(p_amount, 0) <= 0 or p_type not in ('receive', 'pay') then
    return null;
  end if;

  select * into v_game
  from public.banco_games
  where bank_token = p_access_token
     or exists (
       select 1 from jsonb_array_elements(player_tokens) as token_item
       where token_item->>'token' = p_access_token
     )
  for update;

  if v_game.id is null then
    return null;
  end if;

  if v_game.bank_token <> p_access_token then
    v_role := 'player';
    select token_item->>'player_id'
    into v_token_player_id
    from jsonb_array_elements(v_game.player_tokens) as token_item
    where token_item->>'token' = p_access_token
    limit 1;

    if v_token_player_id is null or v_token_player_id <> p_player_id then
      return null;
    end if;
  end if;

  v_delta := case when p_type = 'receive' then p_amount else -p_amount end;
  v_state := v_game.state;

  for v_player in select * from jsonb_array_elements(v_state->'players')
  loop
    if v_player->>'id' = p_player_id then
      v_player_name := v_player->>'name';
      v_player := jsonb_set(v_player, '{balance}', to_jsonb(coalesce((v_player->>'balance')::integer, 0) + v_delta));
    end if;
    v_players := v_players || jsonb_build_array(v_player);
  end loop;

  if v_player_name is null then
    return null;
  end if;

  v_event := jsonb_build_object(
    'id', encode(gen_random_bytes(6), 'hex'),
    'kind', 'bank',
    'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'playerId', p_player_id,
    'amount', v_delta,
    'title', v_player_name || case when p_type = 'receive' then ' recebeu do banco' else ' pagou ao banco' end,
    'detail', coalesce(nullif(p_note, ''), case when p_type = 'receive' then 'Credito do banco' else 'Pagamento ao banco' end),
    'entries', jsonb_build_array(jsonb_build_object('id', p_player_id, 'amount', v_delta)),
    'reverse', jsonb_build_array(jsonb_build_object('id', p_player_id, 'amount', -v_delta))
  );

  v_revision := coalesce((v_state->>'revision')::integer, 0) + 1;
  v_state := jsonb_set(v_state, '{players}', v_players);
  v_state := jsonb_set(v_state, '{history}', coalesce(v_state->'history', '[]'::jsonb) || jsonb_build_array(v_event));
  v_state := jsonb_set(v_state, '{revision}', to_jsonb(v_revision));
  v_state := jsonb_set(v_state, '{savedAt}', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));

  update public.banco_games
  set state = v_state,
      revision = v_revision,
      updated_at = now()
  where id = v_game.id
  returning * into v_game;

  return public.banco_private_response(v_game, v_role, coalesce(v_token_player_id, p_player_id), p_access_token);
end;
$$;

create or replace function public.banco_transfer(
  p_access_token text,
  p_from_player_id text,
  p_to_player_id text,
  p_amount integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.banco_games;
  v_role text := 'bank';
  v_token_player_id text;
  v_state jsonb;
  v_players jsonb := '[]'::jsonb;
  v_player jsonb;
  v_from_name text;
  v_to_name text;
  v_revision integer;
  v_event jsonb;
begin
  if coalesce(p_amount, 0) <= 0 or p_from_player_id = p_to_player_id then
    return null;
  end if;

  select * into v_game
  from public.banco_games
  where bank_token = p_access_token
     or exists (
       select 1 from jsonb_array_elements(player_tokens) as token_item
       where token_item->>'token' = p_access_token
     )
  for update;

  if v_game.id is null then
    return null;
  end if;

  if v_game.bank_token <> p_access_token then
    v_role := 'player';
    select token_item->>'player_id'
    into v_token_player_id
    from jsonb_array_elements(v_game.player_tokens) as token_item
    where token_item->>'token' = p_access_token
    limit 1;

    if v_token_player_id is null or v_token_player_id <> p_from_player_id then
      return null;
    end if;
  end if;

  v_state := v_game.state;

  for v_player in select * from jsonb_array_elements(v_state->'players')
  loop
    if v_player->>'id' = p_from_player_id then
      v_from_name := v_player->>'name';
      v_player := jsonb_set(v_player, '{balance}', to_jsonb(coalesce((v_player->>'balance')::integer, 0) - p_amount));
    elsif v_player->>'id' = p_to_player_id then
      v_to_name := v_player->>'name';
      v_player := jsonb_set(v_player, '{balance}', to_jsonb(coalesce((v_player->>'balance')::integer, 0) + p_amount));
    end if;
    v_players := v_players || jsonb_build_array(v_player);
  end loop;

  if v_from_name is null or v_to_name is null then
    return null;
  end if;

  v_event := jsonb_build_object(
    'id', encode(gen_random_bytes(6), 'hex'),
    'kind', 'transfer',
    'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'playerId', p_from_player_id,
    'amount', -p_amount,
    'title', v_from_name || ' enviou para ' || v_to_name,
    'detail', coalesce(nullif(p_note, ''), 'Pagamento por carteira'),
    'entries', jsonb_build_array(
      jsonb_build_object('id', p_from_player_id, 'amount', -p_amount),
      jsonb_build_object('id', p_to_player_id, 'amount', p_amount)
    ),
    'reverse', jsonb_build_array(
      jsonb_build_object('id', p_from_player_id, 'amount', p_amount),
      jsonb_build_object('id', p_to_player_id, 'amount', -p_amount)
    )
  );

  v_revision := coalesce((v_state->>'revision')::integer, 0) + 1;
  v_state := jsonb_set(v_state, '{players}', v_players);
  v_state := jsonb_set(v_state, '{history}', coalesce(v_state->'history', '[]'::jsonb) || jsonb_build_array(v_event));
  v_state := jsonb_set(v_state, '{revision}', to_jsonb(v_revision));
  v_state := jsonb_set(v_state, '{savedAt}', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));

  update public.banco_games
  set state = v_state,
      revision = v_revision,
      updated_at = now()
  where id = v_game.id
  returning * into v_game;

  return public.banco_private_response(v_game, v_role, coalesce(v_token_player_id, p_from_player_id), p_access_token);
end;
$$;

create or replace function public.banco_delete_game(p_bank_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.banco_games
  where bank_token = p_bank_token;
  return found;
end;
$$;

revoke all on function public.banco_private_response(public.banco_games, text, text, text) from public;

revoke all on function public.banco_create_game(text, jsonb, integer) from public;
revoke all on function public.banco_get_bank_game(text) from public;
revoke all on function public.banco_get_player_wallet(text) from public;
revoke all on function public.banco_apply_bank_transaction(text, text, text, integer, text) from public;
revoke all on function public.banco_transfer(text, text, text, integer, text) from public;
revoke all on function public.banco_delete_game(text) from public;

grant execute on function public.banco_create_game(text, jsonb, integer) to anon;
grant execute on function public.banco_get_bank_game(text) to anon;
grant execute on function public.banco_get_player_wallet(text) to anon;
grant execute on function public.banco_apply_bank_transaction(text, text, text, integer, text) to anon;
grant execute on function public.banco_transfer(text, text, text, integer, text) to anon;
grant execute on function public.banco_delete_game(text) to anon;
