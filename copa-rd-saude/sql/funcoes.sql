-- ============================================================================
-- COPA RD SAÚDE CD-AM — Funções (aplicar depois de schema.sql)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- registrar_resultado_partida
-- Registra o placar/vencedor de uma partida e propaga o resultado:
--  - manda o vencedor para a próxima partida (proxima_partida_vencedor_id)
--  - manda o perdedor para a repescagem, se for da WB (proxima_partida_perdedor_id)
--  - resolve em cascata partidas marcadas como avanco_automatico (bye)
--  - trata a Grande Final: se o lado da loser bracket vencer o jogo 1,
--    ativa automaticamente o "reset" (jogo 2) da grande final
-- Segurança: SECURITY INVOKER (respeita as policies de RLS — só admin
-- consegue de fato alterar "partidas", conforme policy partidas_admin_all).
-- ----------------------------------------------------------------------------
create or replace function registrar_resultado_partida(
  p_partida_id uuid,
  p_placar1 int,
  p_placar2 int,
  p_wo boolean default false
)
returns void
language plpgsql
security invoker
as $$
declare
  v_partida partidas%rowtype;
  v_vencedor_id uuid;
  v_perdedor_id uuid;
  v_destino partidas%rowtype;
  v_fila uuid[] := '{}';
  v_atual_id uuid;
begin
  select * into v_partida from partidas where id = p_partida_id for update;
  if not found then
    raise exception 'Partida % não encontrada', p_partida_id;
  end if;
  if v_partida.atleta1_id is null or v_partida.atleta2_id is null then
    raise exception 'Partida ainda não tem os dois participantes definidos';
  end if;
  if p_placar1 = p_placar2 and not p_wo then
    raise exception 'Não pode haver empate — informe o vencedor por W.O. ou corrija o placar';
  end if;

  if p_placar1 > p_placar2 then
    v_vencedor_id := v_partida.atleta1_id;
    v_perdedor_id := v_partida.atleta2_id;
  else
    v_vencedor_id := v_partida.atleta2_id;
    v_perdedor_id := v_partida.atleta1_id;
  end if;

  update partidas set
    placar1 = p_placar1,
    placar2 = p_placar2,
    vencedor_id = v_vencedor_id,
    perdedor_id = v_perdedor_id,
    status = case when p_wo then 'wo' else 'finalizada' end
  where id = p_partida_id;

  -- --- Grande Final: tratamento especial ---
  if v_partida.fase = 'GF' and v_partida.rodada = 1 then
    if v_vencedor_id = v_partida.atleta1_id then
      -- lado da Winner Bracket venceu de primeira -> campeão definido, sem reset
      update chaves set status = 'finalizada', finalizada_em = now(),
             campeao_id = v_vencedor_id, vice_id = v_perdedor_id
      where id = v_partida.chave_id;
    else
      -- lado da Loser Bracket venceu -> ativa o reset (jogo 2 da grande final)
      update partidas set
        atleta1_id = v_partida.atleta1_id,  -- ex-invicto, agora com 1 derrota
        atleta2_id = v_partida.atleta2_id,  -- vindo da loser bracket
        status = 'pronta'
      where chave_id = v_partida.chave_id and fase = 'GF' and rodada = 2;
    end if;
    return;
  end if;

  if v_partida.fase = 'GF' and v_partida.rodada = 2 then
    update chaves set status = 'finalizada', finalizada_em = now(),
           campeao_id = v_vencedor_id, vice_id = v_perdedor_id
    where id = v_partida.chave_id;
    return;
  end if;

  -- --- Propaga o vencedor para a próxima partida ---
  if v_partida.proxima_partida_vencedor_id is not null then
    select * into v_destino from partidas where id = v_partida.proxima_partida_vencedor_id for update;
    if v_destino.origem_atleta1_partida_id = v_partida.id then
      update partidas set atleta1_id = v_vencedor_id where id = v_destino.id;
    else
      update partidas set atleta2_id = v_vencedor_id where id = v_destino.id;
    end if;
    v_fila := array_append(v_fila, v_destino.id);
  end if;

  -- --- Propaga o perdedor para a repescagem (só existe em partidas da WB) ---
  if v_partida.proxima_partida_perdedor_id is not null then
    select * into v_destino from partidas where id = v_partida.proxima_partida_perdedor_id for update;
    if v_destino.origem_atleta1_partida_id = v_partida.id then
      update partidas set atleta1_id = v_perdedor_id where id = v_destino.id;
    else
      update partidas set atleta2_id = v_perdedor_id where id = v_destino.id;
    end if;
    v_fila := array_append(v_fila, v_destino.id);
  end if;

  -- --- Resolve status das partidas que acabaram de receber um participante ---
  -- (fila em cascata: um bye pode liberar outro bye em sequência)
  while array_length(v_fila, 1) is not null and array_length(v_fila, 1) > 0 loop
    v_atual_id := v_fila[1];
    v_fila := v_fila[2:array_length(v_fila,1)];

    select * into v_destino from partidas where id = v_atual_id for update;

    if v_destino.status in ('finalizada','wo') then
      continue; -- já resolvida (pode acontecer se veio de dois avanços na mesma chamada)
    end if;

    if v_destino.atleta1_id is not null and v_destino.atleta2_id is not null then
      update partidas set status = 'pronta' where id = v_destino.id;

    elsif v_destino.avanco_automatico then
      -- Verifica se o lado ainda vazio é um "poço seco" definitivo: a partida de
      -- origem daquele lado já terminou e não vai gerar ninguém para cá (ou
      -- porque era um BYE sem perdedor real, ou por ausência de vencedor —
      -- este último caso não deveria ocorrer na prática, mas é checado por segurança).
      declare
        v_origem_id uuid;
        v_origem partidas%rowtype;
        v_e_slot_vazio_definitivo boolean := false;
        v_vencedor_final uuid;
      begin
        if v_destino.atleta1_id is not null and v_destino.atleta2_id is null then
          v_origem_id := v_destino.origem_atleta2_partida_id;
          v_vencedor_final := v_destino.atleta1_id;
        elsif v_destino.atleta2_id is not null and v_destino.atleta1_id is null then
          v_origem_id := v_destino.origem_atleta1_partida_id;
          v_vencedor_final := v_destino.atleta2_id;
        end if;

        if v_origem_id is not null then
          select * into v_origem from partidas where id = v_origem_id;
          if v_origem.status in ('finalizada','wo') then
            if v_origem.proxima_partida_perdedor_id = v_destino.id and v_origem.perdedor_id is null then
              v_e_slot_vazio_definitivo := true;
            elsif v_origem.proxima_partida_vencedor_id = v_destino.id and v_origem.vencedor_id is null then
              v_e_slot_vazio_definitivo := true;
            end if;
          end if;
        end if;

        if v_e_slot_vazio_definitivo then
          update partidas set status = 'finalizada', vencedor_id = v_vencedor_final, perdedor_id = null
          where id = v_destino.id;

          if v_destino.proxima_partida_vencedor_id is not null then
            declare
              v_prox_id uuid := v_destino.proxima_partida_vencedor_id;
              v_destino_prox partidas%rowtype;
            begin
              select * into v_destino_prox from partidas where id = v_prox_id for update;
              if v_destino_prox.origem_atleta1_partida_id = v_destino.id then
                update partidas set atleta1_id = v_vencedor_final where id = v_destino_prox.id;
              else
                update partidas set atleta2_id = v_vencedor_final where id = v_destino_prox.id;
              end if;
              v_fila := array_append(v_fila, v_destino_prox.id);
            end;
          end if;
        end if;
      end;
    end if;
  end loop;
end;
$$;

comment on function registrar_resultado_partida is
  'Registra placar/vencedor de uma partida e propaga o resultado pela chave, incluindo avanços automáticos por bye e o reset da grande final.';

-- ----------------------------------------------------------------------------
-- fn_gerar_txid_pix — gera um identificador curto e único para o payload Pix
-- ----------------------------------------------------------------------------
create or replace function fn_gerar_txid_pix()
returns text language sql as $$
  select 'RDCDAM' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 19));
$$;
