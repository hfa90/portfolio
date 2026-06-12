(function () {
  const SUPABASE_URL = 'https://wykmukfohehtpoezojwg.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5a211a2ZvaGVodHBvZXpvandnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNTc0NjcsImV4cCI6MjA5NTczMzQ2N30.mlfxsXSirX-0MXOreyShuS2kn5JDh_nMEp1onsBL9-0';
  const GUEST_ID_KEY = 'venus_chat_guest_id';
  const NICK_KEY = 'venus_chat_nickname';
  const ADULT_OK_KEY = 'venus_chat_adult_ok';
  const ROOM_COLUMNS = 'id,title,description,visibility,topic,mood,city,tags,min_age,max_participants,creator_id,creator_nickname,is_active,is_featured,message_count,last_message_at,created_at';

  const state = {
    sb: null,
    user: null,
    displayName: '',
    nickname: '',
    guestId: '',
    rooms: [],
    activeRoom: null,
    roomFilter: 'all',
    roomSub: null,
    messageSub: null,
    presenceTimer: null,
    setupBlocked: false
  };

  const $ = id => document.getElementById(id);

  function toast(msg, tipo = 'info') {
    if (window.toast) {
      window.toast(msg, tipo);
      return;
    }

    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `
      position:fixed;right:18px;bottom:18px;z-index:9999;max-width:340px;
      padding:12px 16px;border-radius:12px;color:#fff;font-size:.88rem;
      background:${tipo === 'erro' ? '#9f2f25' : tipo === 'ok' ? '#247a4a' : '#252535'};
      box-shadow:0 14px 38px rgba(0,0,0,.34);`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[char]);
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function initials(name) {
    const parts = String(name || 'V').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || 'V') + (parts[1]?.[0] || '')).toUpperCase();
  }

  function formatTime(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  function relativeTime(value) {
    if (!value) return 'agora';
    const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h`;
    return `${Math.round(hours / 24)} d`;
  }

  function getGuestId() {
    let id = localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      id = `guest_${crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(16).slice(2)}`;
      localStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
  }

  function getLoginUrl() {
    return `login.html?redirect=${encodeURIComponent('chat-comunidade.html')}`;
  }

  function openModal(id) {
    const modal = $(id);
    if (modal) modal.hidden = false;
  }

  function closeModal(id) {
    const modal = $(id);
    if (modal) modal.hidden = true;
  }

  function setIdentity() {
    const name = state.user ? state.displayName : state.nickname;
    $('identityName').textContent = name || 'Visitante';
    $('identityAvatar').textContent = initials(name);
    $('identityStatus').textContent = state.user ? 'Conta cadastrada' : 'Entrando sem senha';

    const privateLogin = $('privateLoginBtn');
    if (privateLogin && state.user) {
      privateLogin.innerHTML = '<i class="ti ti-lock-open"></i> Privadas';
      privateLogin.href = '#';
    }
  }

  function renderSetupWarning(error) {
    state.setupBlocked = true;
    $('roomsList').innerHTML = `
      <div class="setup-warning">
        <strong>Configure o banco para liberar o chat.</strong>
        <p>Execute o SQL em <code>supabase/community-chat-rooms.sql</code> no Supabase. Erro atual: ${escapeHtml(error?.message || 'tabela indisponivel')}.</p>
      </div>
    `;
  }

  function roomIcon(room) {
    if (room.visibility === 'private') return 'ti-lock';
    if (room.topic === 'seguranca') return 'ti-shield-heart';
    if (room.topic === 'profissionais') return 'ti-id-badge-2';
    if (room.topic === 'fantasias') return 'ti-sparkles';
    if (room.topic === 'encontros') return 'ti-map-heart';
    return 'ti-messages';
  }

  function filteredRooms() {
    const query = normalize($('roomSearch')?.value);
    return state.rooms.filter(room => {
      const byFilter = state.roomFilter === 'all' || room.visibility === state.roomFilter;
      if (!byFilter) return false;
      if (!query) return true;
      return normalize([
        room.title,
        room.description,
        room.city,
        room.topic,
        room.mood,
        (room.tags || []).join(' ')
      ].join(' ')).includes(query);
    });
  }

  function sortRooms(rooms) {
    return [...rooms].sort((a, b) => {
      const aTime = new Date(a.created_at || a.last_message_at || 0).getTime();
      const bTime = new Date(b.created_at || b.last_message_at || 0).getTime();
      return bTime - aTime;
    });
  }

  function resetRoomFilters() {
    const search = $('roomSearch');
    if (search) search.value = '';
    state.roomFilter = 'all';
    document.querySelectorAll('.room-filter').forEach(item => {
      item.classList.toggle('active', item.dataset.filter === 'all');
    });
    renderRooms();
  }

  function renderRooms() {
    const list = $('roomsList');
    const rooms = filteredRooms();

    if (!rooms.length) {
      const hasHiddenRooms = state.rooms.length > 0;
      list.innerHTML = `
        <div class="empty-rooms">
          <div class="empty-icon"><i class="ti ti-message-plus"></i></div>
          <strong>${hasHiddenRooms ? 'As salas estao ocultas pelo filtro' : 'Nenhuma sala encontrada'}</strong>
          <p>${hasHiddenRooms ? 'Limpe a busca ou volte para Todas para ver as salas publicas disponiveis.' : 'Crie uma sala publica para visitantes ou uma privada para cadastrados.'}</p>
          ${hasHiddenRooms ? '<button class="btn btn-outline" type="button" data-reset-room-filters>Mostrar todas</button>' : ''}
        </div>
      `;
      return;
    }

    list.innerHTML = sortRooms(rooms).map(room => {
      const active = state.activeRoom?.id === room.id ? ' active' : '';
      const locked = room.visibility === 'private' && !state.user ? ' locked' : '';
      const meta = [
        room.city,
        `${room.message_count || 0} msgs`,
        room.last_message_at ? relativeTime(room.last_message_at) : 'nova'
      ].filter(Boolean).join(' · ');

      return `
        <button class="room-item${active}${locked}" type="button" data-room-id="${room.id}">
          <span class="room-icon"><i class="ti ${roomIcon(room)}"></i></span>
          <span class="room-item-main">
            <span class="room-item-title">
              <strong>${escapeHtml(room.title)}</strong>
              ${room.visibility === 'private' ? '<span class="mini-badge private"><i class="ti ti-lock"></i> Privada</span>' : ''}
            </span>
            <p>${escapeHtml(room.description || 'Sala aberta para conversar com respeito e discricao.')}</p>
            <span class="room-meta-row">
              <span class="mini-badge gold">${escapeHtml(room.topic || 'conversa')}</span>
              <span class="mini-badge">${escapeHtml(room.mood || 'discreto')}</span>
              <span class="mini-badge"><i class="ti ti-clock"></i> ${escapeHtml(meta)}</span>
            </span>
          </span>
        </button>
      `;
    }).join('');
  }

  function mergeRoom(room, prepend = false) {
    if (!room?.id) return null;

    const index = state.rooms.findIndex(item => item.id === room.id);
    if (index >= 0) {
      state.rooms[index] = { ...state.rooms[index], ...room };
      return state.rooms[index];
    }

    if (prepend) {
      state.rooms = [room, ...state.rooms];
    } else {
      state.rooms = [...state.rooms, room];
    }

    return room;
  }

  function renderActiveRoom() {
    const room = state.activeRoom;
    if (!room) return;

    $('emptyState').hidden = true;
    $('conversation').hidden = false;
    document.querySelector('.chat-shell')?.classList.add('chat-open');

    $('activeRoomTitle').textContent = room.title;
    $('activeRoomMeta').textContent = [
      room.visibility === 'private' ? 'Privada para cadastrados' : 'Publica sem senha',
      room.city,
      `${room.message_count || 0} mensagens`
    ].filter(Boolean).join(' · ');
    $('activeRoomMark').innerHTML = `<i class="ti ${roomIcon(room)}"></i>`;
    $('activeRoomBadges').innerHTML = `
      <span class="mini-badge ${room.visibility === 'private' ? 'private' : 'gold'}">
        <i class="ti ${room.visibility === 'private' ? 'ti-lock' : 'ti-world'}"></i>
        ${room.visibility === 'private' ? 'Privada' : 'Publica'}
      </span>
      <span class="mini-badge">${escapeHtml(room.topic)}</span>
      <span class="mini-badge">+18</span>
    `;

    const locked = room.visibility === 'private' && !state.user;
    $('privateGate').hidden = !locked;
    $('messageForm').hidden = locked;
  }

  function renderMessages(messages) {
    const list = $('messagesList');

    if (!messages.length) {
      list.innerHTML = `
        <div class="conversation-empty">
          <div class="empty-icon"><i class="ti ti-message-heart"></i></div>
          <h2>Seja a primeira pessoa a falar</h2>
          <p>Comece com respeito, clareza e consentimento.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = messages.map(messageTemplate).join('');
    scrollMessagesToBottom();
  }

  function messageTemplate(message) {
    const own = isOwnMessage(message) ? ' own' : '';
    return `
      <article class="message${own}" data-message-id="${message.id}">
        <span class="message-avatar">${escapeHtml(initials(message.nickname))}</span>
        <div class="message-bubble">
          <div class="message-top">
            <strong>${escapeHtml(message.nickname)}</strong>
            <time>${escapeHtml(formatTime(message.created_at))}</time>
          </div>
          <div class="message-body">${escapeHtml(message.body)}</div>
          <div class="message-actions">
            <button type="button" data-report-message="${message.id}"><i class="ti ti-flag"></i> denunciar</button>
          </div>
        </div>
      </article>
    `;
  }

  function isOwnMessage(message) {
    if (state.user && message.sender_id === state.user.id) return true;
    return !state.user && message.guest_session_id === state.guestId;
  }

  function appendMessage(message) {
    const list = $('messagesList');
    if (list.querySelector(`[data-message-id="${message.id}"]`)) return;
    const empty = list.querySelector('.conversation-empty');
    if (empty) list.innerHTML = '';
    list.insertAdjacentHTML('beforeend', messageTemplate(message));
    scrollMessagesToBottom();
  }

  function scrollMessagesToBottom() {
    const list = $('messagesList');
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  }

  async function initSupabase() {
    if (!window.supabase?.createClient) {
      renderSetupWarning(new Error('Biblioteca Supabase nao carregou.'));
      return;
    }

    state.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storageKey: 'venus-user-session' }
    });
  }

  async function loadIdentity() {
    if (!state.sb) return;
    state.guestId = getGuestId();
    state.nickname = localStorage.getItem(NICK_KEY) || '';

    const { data: { user } } = await state.sb.auth.getUser();
    state.user = user || null;

    if (state.user) {
      const [{ data: customer }, { data: professional }] = await Promise.all([
        state.sb.from('customers').select('nome').eq('id', state.user.id).maybeSingle(),
        state.sb.from('profiles').select('nome_artistico').eq('id', state.user.id).maybeSingle()
      ]);
      state.displayName = customer?.nome || professional?.nome_artistico || state.user.email?.split('@')[0] || 'Pessoa cadastrada';
      state.nickname = state.displayName;
    }

    setIdentity();

    if (!state.user && (!state.nickname || localStorage.getItem(ADULT_OK_KEY) !== '1')) {
      $('nickInput').value = state.nickname || '';
      openModal('nickModal');
    }
  }

  async function loadRooms() {
    if (!state.sb) return;

    const { data, error } = await state.sb
      .from('community_chat_rooms')
      .select(ROOM_COLUMNS)
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(80);

    if (error) {
      renderSetupWarning(error);
      return;
    }

    state.setupBlocked = false;
    state.rooms = sortRooms(data || []);
    renderRooms();
  }

  async function openRoom(roomOrId) {
    const room = typeof roomOrId === 'object'
      ? mergeRoom(roomOrId, true)
      : state.rooms.find(item => item.id === roomOrId);

    if (!room) return;

    state.activeRoom = room;
    renderRooms();
    renderActiveRoom();
    await loadMessages();
    subscribeMessages();
    touchPresence();
  }

  async function loadMessages() {
    if (!state.activeRoom || !state.sb) return;

    const { data, error } = await state.sb
      .from('community_chat_messages')
      .select('id,room_id,sender_id,guest_session_id,nickname,body,created_at,moderation_status')
      .eq('room_id', state.activeRoom.id)
      .order('created_at', { ascending: true })
      .limit(150);

    if (error) {
      toast(error.message || 'Nao foi possivel carregar mensagens.', 'erro');
      return;
    }

    renderMessages(data || []);
  }

  function subscribeRooms() {
    if (!state.sb || state.roomSub) return;

    state.roomSub = state.sb
      .channel('community-chat-rooms')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'community_chat_rooms'
      }, () => loadRooms())
      .subscribe();
  }

  function subscribeMessages() {
    if (!state.sb || !state.activeRoom) return;
    if (state.messageSub) state.sb.removeChannel(state.messageSub);

    state.messageSub = state.sb
      .channel(`community-chat-messages-${state.activeRoom.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'community_chat_messages',
        filter: `room_id=eq.${state.activeRoom.id}`
      }, payload => appendMessage(payload.new))
      .subscribe();
  }

  async function touchPresence() {
    clearInterval(state.presenceTimer);
    if (!state.sb || !state.activeRoom) return;
    if (state.activeRoom.visibility === 'private' && !state.user) return;

    const sendPresence = async () => {
      const payload = state.user ? {
        room_id: state.activeRoom.id,
        participant_key: `auth:${state.user.id}`,
        user_id: state.user.id,
        guest_session_id: null,
        nickname: state.displayName
      } : {
        room_id: state.activeRoom.id,
        participant_key: `guest:${state.guestId}`,
        user_id: null,
        guest_session_id: state.guestId,
        nickname: state.nickname
      };

      await state.sb
        .from('community_chat_presence')
        .upsert(payload, { onConflict: 'room_id,participant_key' });
    };

    await sendPresence();
    state.presenceTimer = setInterval(sendPresence, 60000);
  }

  async function createRoom(event) {
    event.preventDefault();
    if (!state.sb) return;

    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const visibility = $('roomVisibility').value;
    if (visibility === 'private' && !state.user) {
      toast('Entre ou cadastre-se para criar salas privadas.', 'erro');
      window.location.href = getLoginUrl();
      return;
    }

    if (!state.user && !state.nickname) {
      openModal('nickModal');
      return;
    }

    const payload = {
      title: $('roomTitle').value.trim(),
      description: $('roomDescription').value.trim() || null,
      visibility,
      topic: $('roomTopic').value,
      mood: $('roomMood').value,
      city: $('roomCity').value.trim() || null,
      max_participants: Number($('roomMaxParticipants').value || 80),
      creator_id: state.user?.id || null,
      creator_guest_session_id: state.user ? null : state.guestId,
      creator_nickname: state.user ? state.displayName : state.nickname,
      min_age: 18,
      tags: []
    };

    if (submitButton) submitButton.disabled = true;
    try {
      const { data, error } = await state.sb
        .from('community_chat_rooms')
        .insert(payload)
        .select(ROOM_COLUMNS)
        .single();

      if (error) {
        console.error('Erro ao criar sala da comunidade:', error);
        toast(error.message || 'Nao foi possivel criar a sala.', 'erro');
        return;
      }

      closeModal('roomModal');
      form.reset();
      $('roomMaxParticipants').value = '80';
      resetRoomFilters();
      toast('Sala criada e aberta.', 'ok');

      if (data?.id) {
        await openRoom(data);
      }

      await loadRooms();
      renderRooms();
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!state.sb || !state.activeRoom) return;

    if (state.activeRoom.visibility === 'private' && !state.user) {
      window.location.href = getLoginUrl();
      return;
    }

    if (!state.user && !state.nickname) {
      openModal('nickModal');
      return;
    }

    const input = $('messageInput');
    const body = input.value.trim();
    if (!body) return;

    const payload = state.user ? {
      room_id: state.activeRoom.id,
      sender_id: state.user.id,
      guest_session_id: null,
      nickname: state.displayName,
      body
    } : {
      room_id: state.activeRoom.id,
      sender_id: null,
      guest_session_id: state.guestId,
      nickname: state.nickname,
      body
    };

    input.value = '';
    autoSizeTextarea(input);

    const { data, error } = await state.sb
      .from('community_chat_messages')
      .insert(payload)
      .select()
      .single();

    if (error) {
      input.value = body;
      autoSizeTextarea(input);
      toast(error.message || 'Nao foi possivel enviar.', 'erro');
      return;
    }

    appendMessage(data);
    await loadRooms();
  }

  async function reportItem(messageId = null) {
    if (!state.sb || !state.activeRoom) return;

    const raw = prompt('Motivo da denuncia: assedio, menoridade, spam, conteudo proibido ou outro', 'outro');
    if (!raw) return;

    const reasonMap = {
      assedio: 'assédio',
      'assédio': 'assédio',
      menoridade: 'menoridade',
      spam: 'spam',
      'conteudo proibido': 'conteudo proibido',
      'conteúdo proibido': 'conteudo proibido',
      outro: 'outro'
    };
    const reason = reasonMap[normalize(raw)] || 'outro';

    const payload = state.user ? {
      room_id: state.activeRoom.id,
      message_id: messageId,
      reporter_id: state.user.id,
      reporter_guest_session_id: null,
      reporter_nickname: state.displayName,
      reason
    } : {
      room_id: state.activeRoom.id,
      message_id: messageId,
      reporter_id: null,
      reporter_guest_session_id: state.guestId,
      reporter_nickname: state.nickname || 'Visitante',
      reason
    };

    const { error } = await state.sb.from('community_chat_reports').insert(payload);
    if (error) {
      toast(error.message || 'Nao foi possivel enviar a denuncia.', 'erro');
      return;
    }

    toast('Denuncia enviada para revisao.', 'ok');
  }

  function autoSizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
  }

  function bindEvents() {
    $('refreshRooms')?.addEventListener('click', loadRooms);
    $('newRoomBtn')?.addEventListener('click', () => openModal('roomModal'));
    $('emptyCreateBtn')?.addEventListener('click', () => openModal('roomModal'));
    $('editNickBtn')?.addEventListener('click', () => {
      $('nickInput').value = state.nickname || '';
      $('adultConsent').checked = localStorage.getItem(ADULT_OK_KEY) === '1';
      openModal('nickModal');
    });

    document.querySelectorAll('[data-close-modal]').forEach(button => {
      button.addEventListener('click', () => closeModal(button.dataset.closeModal));
    });

    document.querySelectorAll('.chat-modal').forEach(modal => {
      modal.addEventListener('click', event => {
        if (event.target === modal) closeModal(modal.id);
      });
    });

    $('nickForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const nick = $('nickInput').value.trim();
      if (nick.length < 2) return;
      state.nickname = nick;
      localStorage.setItem(NICK_KEY, nick);
      localStorage.setItem(ADULT_OK_KEY, '1');
      setIdentity();
      closeModal('nickModal');
      toast('Nick salvo. Boa conversa.', 'ok');
    });

    $('roomForm')?.addEventListener('submit', createRoom);
    $('messageForm')?.addEventListener('submit', sendMessage);
    $('reportRoomBtn')?.addEventListener('click', () => reportItem(null));
    $('closeConversation')?.addEventListener('click', () => {
      document.querySelector('.chat-shell')?.classList.remove('chat-open');
    });

    $('roomSearch')?.addEventListener('input', renderRooms);

    document.querySelectorAll('.room-filter').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.room-filter').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        state.roomFilter = button.dataset.filter;
        renderRooms();
      });
    });

    $('roomsList')?.addEventListener('click', event => {
      const resetButton = event.target.closest('[data-reset-room-filters]');
      if (resetButton) {
        resetRoomFilters();
        return;
      }

      const item = event.target.closest('[data-room-id]');
      if (!item) return;
      openRoom(item.dataset.roomId);
    });

    $('messagesList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-report-message]');
      if (button) reportItem(button.dataset.reportMessage);
    });

    $('messageInput')?.addEventListener('input', event => autoSizeTextarea(event.target));

    $('privateLoginBtn')?.addEventListener('click', event => {
      if (!state.user) return;
      event.preventDefault();
      state.roomFilter = 'private';
      document.querySelectorAll('.room-filter').forEach(item => item.classList.toggle('active', item.dataset.filter === 'private'));
      renderRooms();
    });

    $('roomVisibility')?.addEventListener('change', event => {
      if (event.target.value === 'private' && !state.user) {
        $('privateHint').textContent = 'Entre ou cadastre-se para criar salas privadas.';
      } else {
        $('privateHint').textContent = 'Salas privadas exigem login para criar e conversar.';
      }
    });
  }

  async function init() {
    bindEvents();
    await initSupabase();
    await loadIdentity();
    await loadRooms();
    subscribeRooms();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
