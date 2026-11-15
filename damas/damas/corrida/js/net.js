// Sala online em estrela (até 4 jogadores): o anfitrião retransmite tudo.
// Sem banco de dados: o PeerJS só apresenta os aparelhos; os dados vão direto por WebRTC.
import { RTC_CONFIG } from '../../js/config.js';

const PREFIX = 'corridabr-v1';

export class Room {
  constructor({ room, isHost, pid, onMessage, onJoin, onLeave, onStatus }) {
    Object.assign(this, { room, isHost, pid, onMessage, onJoin, onLeave, onStatus });
    this.conns = new Map(); // pid -> {conn, last}
    this.peer = null;
    this.destroyed = false;
    this.status = 'connecting';
    this.timers = [];
    this.queue = [];
  }
  get hostId() { return `${PREFIX}-${this.room}-h`; }
  get myId() { return this.isHost ? this.hostId : `${PREFIX}-${this.room}-${this.pid}`; }
  setStatus(s) { if (this.status !== s) { this.status = s; this.onStatus && this.onStatus(s); } }
  later(fn, ms) { const id = setTimeout(() => { this.timers = this.timers.filter((x) => x !== id); if (!this.destroyed) fn(); }, ms); this.timers.push(id); }

  start() {
    if (this.destroyed) return;
    if (!window.Peer) { this.later(() => this.start(), 700); return; }
    const peer = new window.Peer(this.myId, { debug: 0, config: RTC_CONFIG });
    this.peer = peer;
    peer.on('open', () => {
      if (this.isHost) this.setStatus('connected');
      else this.connect();
    });
    peer.on('connection', (conn) => {
      if (!this.isHost) { conn.close(); return; }
      const pid = conn.metadata && conn.metadata.pid;
      if (!pid) { conn.close(); return; }
      this.attach(pid, conn);
    });
    peer.on('disconnected', () => { if (!this.destroyed && !peer.destroyed) this.later(() => { try { peer.reconnect(); } catch (_) {} }, 1000); });
    peer.on('error', (err) => {
      if (this.destroyed) return;
      const t = err && err.type;
      if (t === 'peer-unavailable') this.later(() => this.connect(), 2500);
      else if (t === 'unavailable-id') this.restart(2000);
      else if (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'].includes(t)) this.restart(2500);
      else if (t === 'webrtc') this.later(() => this.connect(), 2000);
    });
    if (!this.hb) this.hb = setInterval(() => this.heartbeat(), 2500);
  }
  restart(delay) {
    this.setStatus('connecting');
    try { this.peer && this.peer.destroy(); } catch (_) {}
    this.peer = null;
    this.later(() => this.start(), delay);
  }
  connect() {
    if (this.isHost || this.destroyed || !this.peer || this.peer.destroyed || this.peer.disconnected) return;
    const cur = this.conns.get('host');
    if (cur && cur.conn.open) return;
    const conn = this.peer.connect(this.hostId, { reliable: true, serialization: 'json', metadata: { pid: this.pid } });
    this.attach('host', conn);
    this.later(() => { const c = this.conns.get('host'); if (c && c.conn === conn && !conn.open) { try { conn.close(); } catch (_) {} this.conns.delete('host'); this.connect(); } }, 8000);
  }
  attach(pid, conn) {
    const old = this.conns.get(pid);
    if (old && old.conn !== conn) { old.replaced = true; try { old.conn.close(); } catch (_) {} }
    const rec = { conn, last: Date.now() };
    this.conns.set(pid, rec);
    conn.on('open', () => {
      if (this.conns.get(pid) !== rec) return;
      rec.last = Date.now();
      if (!this.isHost) {
        this.setStatus('connected');
        const q = this.queue; this.queue = []; q.forEach((m) => this.send(m));
      }
      this.onJoin && this.onJoin(pid);
    });
    conn.on('data', (d) => {
      if (this.conns.get(pid) !== rec) return;
      rec.last = Date.now();
      if (!d || d.t === 'ping') return;
      this.onMessage && this.onMessage(pid, d);
    });
    const lost = () => {
      if (this.conns.get(pid) !== rec || this.destroyed) return;
      this.conns.delete(pid);
      if (this.isHost) this.onLeave && this.onLeave(pid);
      else { this.setStatus('connecting'); this.later(() => this.connect(), 1200); }
    };
    conn.on('close', lost); conn.on('error', lost);
  }
  heartbeat() {
    if (this.destroyed) return;
    const now = Date.now();
    for (const [pid, rec] of this.conns) {
      if (!rec.conn.open) continue;
      try { rec.conn.send({ t: 'ping' }); } catch (_) {}
      if (now - rec.last > 10000) { try { rec.conn.close(); } catch (_) {} this.conns.delete(pid); if (this.isHost) this.onLeave && this.onLeave(pid); else { this.setStatus('connecting'); this.connect(); } }
    }
    if (this.peer && !this.peer.destroyed && this.peer.disconnected) { try { this.peer.reconnect(); } catch (_) {} }
    if (!this.isHost && this.peer && this.peer.open && !this.conns.get('host')) this.connect();
  }
  wake() {
    if (this.destroyed) return;
    if (!this.peer || this.peer.destroyed) { this.start(); return; }
    if (this.peer.disconnected) { try { this.peer.reconnect(); } catch (_) {} }
    if (!this.isHost) this.connect();
  }
  // convidado -> anfitrião
  send(msg, queue = true) {
    const c = this.conns.get('host');
    if (c && c.conn.open) { try { c.conn.send(msg); return true; } catch (_) {} }
    if (queue && msg.t !== 's') this.queue.push(msg);
    return false;
  }
  // anfitrião -> convidado(s)
  sendTo(pid, msg) { const c = this.conns.get(pid); if (c && c.conn.open) { try { c.conn.send(msg); } catch (_) {} } }
  broadcast(msg, except) { for (const [pid, c] of this.conns) if (pid !== except && c.conn.open) { try { c.conn.send(msg); } catch (_) {} } }
  connectedPids() { return [...this.conns].filter(([, c]) => c.conn.open).map(([p]) => p); }
  destroy() {
    this.destroyed = true;
    clearInterval(this.hb);
    this.timers.forEach(clearTimeout);
    for (const [, c] of this.conns) { try { c.conn.close(); } catch (_) {} }
    try { this.peer && this.peer.destroy(); } catch (_) {}
  }
}
