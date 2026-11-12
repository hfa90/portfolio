// Versão do sistema, mostrada discretamente no rodapé do menu (painel) e no menu do app do celular.
// NÃO edite à mão: ao publicar (PUBLICAR-SITE.bat ou publicação automática do GitHub), este arquivo é
// regravado no site com a data e o código do commit publicado. No repositório ele fica vazio ("desenvolvimento").
export const VERSAO = { data: '2026.11.12', commit: 'b58d3b1' };

// "v2026.11.09 · a1b2c3d" (ou "versão de desenvolvimento" fora do site publicado)
export const textoVersao = () => (VERSAO.data ? `v${VERSAO.data} · ${VERSAO.commit}` : 'versão de desenvolvimento');
export const dicaVersao = () => (VERSAO.data
  ? `Versão publicada em ${VERSAO.data.split('.').reverse().join('/')} (código ${VERSAO.commit})`
  : 'Painel aberto fora do site publicado');
