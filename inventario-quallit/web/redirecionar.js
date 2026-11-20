// O Inventário Quallit mudou para https://haydenfernandes.tech/inventario/.
// Toda página do endereço antigo leva para a mesma página no endereço novo (com a busca e o #código do QR).
(function () {
  var NOVO = 'https://haydenfernandes.tech/inventario/';
  var resto = location.pathname.replace(/^.*?\/inventario-quallit\/web\/?/, '').replace(/^index\.html$/, '');
  var destino = NOVO + resto + location.search + location.hash;
  var link = document.getElementById('novo');
  if (link) link.href = destino;
  // app Android antigo (abre o endereço antigo): pede para atualizar o app, que já abre no endereço novo
  if (/InventarioQuallitAndroid/.test(navigator.userAgent)) {
    document.getElementById('app-antigo').hidden = false;
    document.getElementById('aguarde').hidden = true;
    return;
  }
  location.replace(destino);
})();
