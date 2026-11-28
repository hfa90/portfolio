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
- **PDF ⇄ Word**, também 100% no navegador (veja abaixo)

## Conversão PDF ⇄ Word

**PDF para Word** (botão “PDF para Word” na tela inicial, ou “Word” no editor para exportar o documento já editado):

- **Editável** (padrão): lê cada caractere do PDF com posição, fonte, tamanho e cor (interpretando os operadores do pdf.js), junta em linhas e parágrafos, detecta alinhamento, recuos, listas (marcador + tabulação), sublinhado e tachado (pelas linhas desenhadas), links e tabelas (pelas réguas do PDF, com células mescladas e sombreamento). O espaçamento vertical é calculado para cada linha cair no mesmo lugar do PDF (no Word a linha de base fica a 0,8 × a altura de uma linha “exata”, medido no próprio Word). A fonte do Word é escolhida medindo a largura real do texto nas fontes instaladas; imagens e desenhos entram na posição exata. Páginas tipo cartaz (texto espalhado sobre imagens) saem automaticamente no modo idêntico.
- **Layout idêntico**: o fundo da página (imagens, vetores, anotações — sem o texto) vira uma imagem atrás do texto, e o texto vai para caixas de texto na posição exata, com a largura de cada espaço e a escala horizontal do PDF.
- Texto em fonte Type3, camadas de OCR invisíveis, texto girado, sombras (texto duplicado) e caracteres de fontes de símbolo (Wingdings/Symbol) são tratados.

**Word para PDF** (botão “Word para PDF”, ou arrastar um .docx para a tela inicial, que o abre direto no editor):

- O docx-preview monta o documento em HTML (Shadow DOM, fora da tela) com fontes de **mesmas medidas** das do Office (Carlito = Calibri, Caladea = Cambria, Arimo = Arial, Tinos = Times New Roman, Cousine = Courier New), registradas com o nome original: as linhas quebram nos mesmos pontos. Opcionalmente usa as fontes instaladas no computador (Local Font Access).
- O que o HTML não faz igual ao Word é refeito: espaçamento “múltiplo”, “pelo menos” e “exato” (altura natural da fonte e posição da linha de base como no Word), espaço entre parágrafos que soma (no CSS colapsa), espaçamento contextual de listas, compressão de espaços em texto justificado (o Word comprime até ~28%), tabulações (paradas do parágrafo e do estilo, recuo deslocado, direita/centro/decimal, pontilhado), numeração de listas, campos PAGE/NUMPAGES, paginação (parágrafos quebram por linha, tabelas por linha), imagens/formas/caixas de texto flutuantes (relativas à página, margem, parágrafo ou caractere), espaçamento e escala de caracteres.
- Cada palavra é medida no navegador e desenhada no PDF com a mesma fonte, embutida sem os glifos não usados.

**Precisão medida** (posição de cada caractere em relação ao PDF que o próprio Microsoft Word gera do mesmo .docx): modo idêntico com erro máximo de ~1 pt; documento de texto comum com erro médio de ~1 pt. **Limitações**: PDF digitalizado sem OCR entra como imagem; .doc antigo precisa ser salvo como .docx; gráficos nativos do Word e imagens EMF/WMF não são desenhados; o texto não contorna imagens flutuantes; colunas de texto lado a lado no modo editável viram caixas de texto.

## Tecnologia

- HTML, CSS e JavaScript (módulos ES), **sem etapa de build**
- [pdf.js 4.10](https://mozilla.github.io/pdf.js/) para desenhar as páginas e extrair o texto
- [pdf-lib 1.17](https://pdf-lib.js.org/) + [fontkit](https://github.com/Hopding/fontkit) para gerar o PDF final
- Fontes DejaVu (TrueType) para caracteres fora do WinAnsi; Inter e fontes de assinatura servidas localmente
- [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) e [JSZip](https://stuk.github.io/jszip/) para ler e escrever .docx
- Fontes métricas Carlito, Caladea, Arimo, Tinos e Cousine (OFL/Apache), preparadas com o fontTools por `scripts/docfonts.py`
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
npm run vendor       # copia pdf.js, pdf-lib, fontkit, docx-preview, JSZip e fontes para vendor/
                     # (precisa de Python 3 com "pip install fonttools" para preparar vendor/docfonts)
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
  convert/
    ui.js         diálogo de conversão, progresso e download
    pdfread.js    leitura de uma página: caracteres, vetores e imagens (operadores do pdf.js)
    layout.js     linhas, parágrafos, tabelas, sublinhados e figuras
    fontfit.js    escolha da fonte do Word medindo larguras reais
    docxwriter.js montagem do XML do .docx
    pdf2docx.js   PDF -> Word (modos editável e idêntico)
    docx2pdf.js   Word -> PDF (fontes, espaçamento, numeração, paginação e desenho no PDF)
    docxlayout.js âncoras, caixas de texto, tabulações e espaçamento de caracteres
    ttfhollow.js  remove do PDF os glifos não usados das fontes
    libs.js       carregamento sob demanda do JSZip e do docx-preview
vendor/         bibliotecas e fontes (gerado por npm run vendor)
scripts/        vendor.mjs, docfonts.py e icons.mjs
tests/          testes Playwright (run.mjs) e arquivos de exemplo
```
