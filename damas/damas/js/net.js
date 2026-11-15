// Conexão P2P (WebRTC via PeerJS). Sem banco de dados: o servidor público do PeerJS
// só faz a "apresentação" entre os dois aparelhos; todo o jogo e o chat trafegam direto entre eles.
import { RTC_CONFIG, PEER_PREFIX } from './config.js';

export class Net {
  constructor({ room, role, onMessage, onStatus, onOpen }) {
    this.room = room;
    this.role = role; // 'host' | 'guest'
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.onOpen = onOpen;
    this.conn = null;
    this.peer = null;
    this.queue = [];
    this.alive = false;
    this.destroyed = false;
    this.lastSeen = 0;
    this.timers = [];
    this.status = 'connecting';
  }

  get myId() { return `${PEER_PREFIX}-${this.room}-${this.role === 'host' ? 'h' : 'g'}`; }
  get otherId() { return `${PEER_PREFIX}-${this.room}-${this.role === 'host' ? 'g' : 'h'}`; }

  setStatus(s) { if (this.status !== s) { this.status = s; this.onStatus && this.onStatus(s); } }

  start() {
    if (this.destroyed) return;
    if (!window.Peer) { this.later(() => this.start(), 800); return; }
    this.setStatus(this.conn?.open ? 'connected' : 'connecting');
    const peer = new window.Peer(this.myId, { debug: 0, config: RTC_CONFIG });
    this.peer = peer;
    peer.on('open', () => {
      if (this.role === 'guest') this.connect();
    });
    peer.on('connection', (conn) => {
      if (conn.peer !== this.otherId) { conn.close(); return; }
      this.attach(conn);
    });
    peer.on('disconnected', () => { if (!this.destroyed && !peer.destroyed) this.later(() => { try { peer.reconnect(); } catch (_) {} }, 1000); });
    peer.on('error', (err) => {
      if (this.destroyed) return;
      const t = err && err.type;
      if (t === 'peer-unavailable') { // o outro ainda não está na sala
        this.later(() => this.connect(), 2500);
      } else if (t === 'unavailable-id') { // ID ainda preso após recarregar a página
        this.restart(2000);
      } else if (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'].includes(t)) {
        this.restart(2500);
      } else if (t === 'webrtc') {
        this.later(() => this.connect(), 2000);
      }
    });
    if (!this.hb) this.hb = setInterval(() => this.heartbeat(), 3000);
  }

  restart(delay) {
    this.setStatus('connecting');
    try { this.peer && this.peer.destroy(); } catch (_) {}
    this.peer = null;
    this.later(() => this.start(), delay);
  }

  later(fn, ms) { const id = setTimeout(() => { this.timers = this.timers.filter((x) => x !== id); if (!this.destroyed) fn(); }, ms); this.timers.push(id); }

  connect() {
    if (this.destroyed || !this.peer || this.peer.destroyed || this.peer.disconnected) return;
    if (this.conn && this.conn.open) return;
    const conn = this.peer.connect(this.otherId, { reliable: true, serialization: 'json' });
    this.attach(conn);
    // se não abrir em 8s, tenta de novo
    this.later(() => { if (!conn.open && this.conn === conn) { try { conn.close(); } catch (_) {} this.connect(); } }, 8000);
  }

  attach(conn) {
    if (this.conn && this.conn !== conn) { try { this.conn.close(); } catch (_) {} }
    this.conn = conn;
    conn.on('open', () => {
      if (this.conn !== conn) return;
      this.lastSeen = Date.now();
      this.setStatus('connected');
      this.onOpen && this.onOpen();
      const q = this.queue; this.queue = [];
      q.forEach((m) => this.send(m));
    });
    conn.on('data', (data) => {
      if (this.conn !== conn) return;
      this.lastSeen = Date.now();
      if (this.status !== 'connected') this.setStatus('connected');
      if (data && data.t === 'ping') return;
      this.onMessage && this.onMessage(data);
    });
    const lost = () => {
      if (this.conn !== conn || this.destroyed) return;
      this.conn = null;
      this.setStatus('connecting');
      if (this.role === 'guest') this.later(() => this.connect(), 1200);
    };
    conn.on('close', lost);
    conn.on('error', lost);
  }

  heartbeat() {
    if (this.destroyed) return;
    if (this.conn && this.conn.open) {
      try { this.conn.send({ t: 'ping' }); } catch (_) {}
      if (Date.now() - this.lastSeen > 11000) { // conexão "zumbi"
        try { this.conn.close(); } catch (_) {}
        this.conn = null;
        this.setStatus('connecting');
        if (this.role === 'guest') this.connect();
      }
    } else if (this.peer && !this.peer.destroyed && this.peer.disconnected) {
      try { this.peer.reconnect(); } catch (_) {}
    } else if (this.role === 'guest' && this.peer && this.peer.open && !this.conn) {
      this.connect();
    }
  }

  // ao voltar do segundo plano (iOS pausa as conexões)
  wake() {
    if (this.destroyed) return;
    if (!this.peer || this.peer.destroyed) { this.start(); return; }
    if (this.peer.disconnected) { try { this.peer.reconnect(); } catch (_) {} }
    if (this.role === 'guest' && !(this.conn && this.conn.open)) this.connect();
  }

  send(msg, { queue = true } = {}) {
    if (this.conn && this.conn.open) {
      try { this.conn.send(msg); return true; } catch (_) {}
    }
    if (queue) this.queue.push(msg);
    return false;
  }

  get connected() { return !!(this.conn && this.conn.open); }

  destroy() {
    this.destroyed = true;
    clearInterval(this.hb);
    this.timers.forEach(clearTimeout);
    try { this.conn && this.conn.close(); } catch (_) {}
    try { this.peer && this.peer.destroy(); } catch (_) {}
  }
}
