// Configuração de rede do modo online.
// STUN públicos funcionam na grande maioria das redes (Wi‑Fi e 4G/5G).
// Se algum par de redes não conectar (NAT simétrico/corporativo), adicione um servidor TURN,
// por exemplo do Metered.ca (plano gratuito) ou Cloudflare Calls:
//   { urls: 'turn:SEU_HOST:443?transport=tcp', username: 'USUARIO', credential: 'SENHA' }
export const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

// prefixo dos IDs de sala no servidor de sinalização do PeerJS
export const PEER_PREFIX = 'damasbr-v1';
