# HFA Editor PDF

Editor de PDF gratuito que roda **100% no navegador**. Sem upload, sem cadastro, sem banco de dados, sem anúncios e, depois do primeiro acesso, **sem internet**.

Feito a partir de uma análise e engenharia reversa da ferramenta “Editar PDF” do iLovePDF. Veja [ANALISE.md](ANALISE.md) e o [CHANGELOG.md](CHANGELOG.md).

## Recursos

- **Editar texto existente**: clique numa linha do PDF para reescrevê-la (os pedaços que o PDF separa são juntados numa linha só)
- **Texto** com fonte, tamanho, cor, negrito, itálico, alinhamento e rotação; símbolos, grego e cirílico saem certos no PDF
- **Tarja definitiva**: o conteúdo coberto é apagado do arquivo, não só escondido
- **Assinatura**: desenhar, digitar ou reutilizar assinaturas salvas no navegador
- **Anotações**: desenho livre, destaque, retângulo, elipse, linha, seta e corretivo
- **Imagens**: botão, arrastar e soltar ou colar (Ctrl+V); fotos de celular entram na orientação certa e são otimizadas
- **Seleção múltipla**, alinhamento, copiar/colar entre páginas, guias de alinhamento ao arrastar, girar elementos
- **Páginas**: reordenar, girar, duplicar, excluir, página em branco, inserir outro PDF, combinar vários PDFs
- **Formulários, marcadores e links preservados** quando as páginas não são reorganizadas
- Rascunho automático (IndexedDB), desfazer/refazer ilimitado, atalhos, zoom com Ctrl+roda e pinça, tema claro/escuro, layout para celular
- **PWA**: funciona offline, pode ser instalado e abrir PDFs pelo “Abrir com…” do sistema

## Tecnologia

- HTML, CSS e JavaScript (módulos ES), **sem etapa de build**
- [pdf.js 4.10](https://mozilla.github.io/pdf.js/) para desenhar as páginas e extrair o texto
- [pdf-lib 1.17](https://pdf-lib.js.org/) + [fontkit](https://github.com/Hopding/fontkit) para gerar o PDF final
- Fontes DejaVu (TrueType) para caracteres fora do WinAnsi; Inter e fontes de assinatura servidas localmente
- Tudo servido pelo próprio site (pasta `vendor/`), com Content-Security-Policy `'self'`: nenhuma requisição a CDN

## Rodar localmente

Qualquer servidor estático serve:

```bash
python -m http.server 8765
```

Depois abra <http://localhost:8765>. No `localhost` o service worker fica desligado para não servir cache velho enquanto você edita o código; use <http://localhost:8765/?sw=1> para testar o modo offline.

## Desenvolvimento

```bash
npm install          # bibliotecas e Playwright (só para desenvolvimento)
npm run vendor       # copia pdf.js, pdf-lib, fontkit e fontes para vendor/
npm test             # testes de ponta a ponta no Chromium
```

Para usar um Chrome já instalado nos testes: `CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" npm test` (no PowerShell: `$env:CHROME="..."; npm test`). Sem essa variável, rode antes `npx playwright install chromium`.

Ao publicar uma versão nova, troque `VERSION` em `sw.js` para os navegadores baixarem os arquivos atualizados.

## Estrutura

```
index.html            página inicial, editor e diálogos (CSP, PWA)
styles.css            tema claro/escuro e layout responsivo
sw.js                 service worker (offline)
manifest.webmanifest  instalação como app e abertura de PDFs
src/
  main.js       inicialização, abrir/fechar arquivos, páginas, teclado e área de transferência
  state.js      estado global, constantes e consultas ao modelo
  history.js    desfazer/refazer com instantâneos por página
  pdf.js        pdf.js, pdf-lib e carregamento sob demanda do fontkit/DejaVu
  render.js     páginas, miniaturas, cache de rasterização (LRU) e zoom
  elements.js   geometria e desenho dos elementos (HTML/SVG)
  select.js     ferramentas, seleção múltipla, guias, rotação, copiar/colar, pinça
  textedit.js   edição de textos novos e do texto existente no PDF
  panel.js      painel de propriedades e lista de elementos
  media.js      imagens (EXIF) e assinaturas
  export.js     geração do PDF (no próprio arquivo ou por cópia), tarja e coleta de lixo
  autosave.js   rascunho automático no IndexedDB
vendor/         bibliotecas e fontes (gerado por npm run vendor)
scripts/        vendor.mjs e icons.mjs
tests/          testes Playwright (run.mjs) e arquivos de exemplo
```
