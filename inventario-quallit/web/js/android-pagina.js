// Página android.html: baixar e instalar o app Android (download direto no Android, QR code no computador).
import { APK_URL, ICONES, PAGINA_URL, dentroDoApp, infoApk, noAndroid, noIOS, qrImagem, tamanhoMB } from './app-android.js';

const $ = (s) => document.querySelector(s);
$('#selo').innerHTML = ICONES.ROBO;
$('#ic-baixar').innerHTML = ICONES.BAIXAR;

const i = await infoApk();
if (!i) {
  $('#sem-apk').hidden = false;
  $('#passos').hidden = true;
} else {
  const data = i.data ? new Date(i.data).toLocaleDateString('pt-BR') : '';
  $('#versao').textContent = [`Versão ${i.versao}`, tamanhoMB(i), data && `publicada em ${data}`].filter(Boolean).join(' · ');
  if (dentroDoApp) {
    $('#versao').textContent += ' · você já está no app';
    $('#passos').hidden = true;
  } else if (noAndroid) {
    $('#baixar').href = APK_URL;
    $('#no-android').hidden = false;
  } else if (noIOS) {
    $('#no-ios').hidden = false;
    $('#passos').hidden = true;
  } else {
    $('#no-pc').hidden = false;
    $('#baixar-pc').href = APK_URL;
    $('#ic-baixar-pc').innerHTML = ICONES.BAIXAR;
    $('#endereco').textContent = PAGINA_URL.replace(/^https:\/\//, '');
    try { $('#qr').innerHTML = `<img src="${await qrImagem(PAGINA_URL, 6)}" alt="QR code para abrir esta página no celular Android">`; }
    catch { $('#qr').hidden = true; }
  }
}
