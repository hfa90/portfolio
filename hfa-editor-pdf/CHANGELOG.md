# Changelog

## 2.1.0 — 27/11/2026

### Conversão PDF ⇄ Word (100% no navegador)
- **PDF para Word, modo editável**: parágrafos reais (alinhamento, recuos, espaçamento calculado para cada linha cair na mesma altura), listas com tabulação, tabelas do Word a partir das réguas do PDF (células mescladas e sombreadas), sublinhado/tachado, cores, links, imagens e desenhos na posição original, texto girado em caixas giradas, rodapés fixos na página. Páginas tipo cartaz caem automaticamente no modo idêntico.
- **PDF para Word, layout idêntico**: fundo da página sem o texto + texto em caixas de texto na posição exata.
- **Word para PDF**: fontes de mesmas medidas das do Office, espaçamento entre linhas e parágrafos como no Word, numeração de listas, tabulações, campos de página, paginação refeita, imagens/formas/caixas de texto flutuantes, espaçamento e escala de caracteres, links. Um .docx arrastado para a tela inicial abre direto no editor.
- **Exportar para Word** no editor (botão “Word”), com as edições.
- Calibrado contra o Microsoft Word: posição da linha de base em linhas “exatas” (0,8 × altura), altura natural das fontes (hhea), compressão de espaços em texto justificado e altura das linhas de tabela.
- Tratamento de casos difíceis: texto Type3, camada de OCR invisível, sombras de texto (cópia deslocada), marcadores das fontes Symbol/Wingdings, texto dentro de grupos de transparência, fontes web que não existem no Word.
- O subset de fontes do fontkit do pdf-lib corrompe as fontes Carlito/Arimo/Tinos/Cousine: elas são preparadas com o fontTools (`scripts/docfonts.py`) e, no PDF, os glifos não usados são removidos por `ttfhollow.js` (PDF de 2 páginas: 838 KB → 78 KB).
- 5 testes novos (22 no total): PDF→Word editável, ida e volta PDF→Word idêntico→PDF (desvio ≤ 2 pt), Word→PDF com paginação/numeração/tabulação/rodapé e o fluxo pela interface.

## 2.0.0 — 27/11/2026

Revisão completa do código, com as correções e melhorias levantadas na análise do projeto.

### Correções no PDF gerado
- **Fotos de celular giradas**: o pdf-lib ignora a orientação EXIF. JPEGs com rotação passam por um canvas, que desenha na orientação certa; fotos acima de 2400 px são reduzidas.
- **Formulários, marcadores e metadados preservados**: quando o documento tem exatamente as páginas de um PDF, na ordem original, as edições são desenhadas no próprio arquivo (modo `inplace`), em vez de copiar as páginas para um documento novo.
- **Arquivo menor**: no modo por cópia, as páginas de cada PDF de origem são copiadas numa única chamada `copyPages`, sem duplicar fontes e imagens compartilhadas. Uma coleta de lixo remove objetos sem referência antes de salvar.
- **Editar texto duas vezes**: o trecho já editado deixa de aparecer como clicável, então não se empilham corretivos e textos.

### Desempenho e memória
- Cache de rasterização com limite (~160 MB, LRU) e liberação dos canvases das páginas fora da tela.
- Miniaturas guardadas como JPEG (URL de objeto) em vez de canvases.
- O PDF é analisado pelo pdf-lib uma vez só, na abertura.
- Histórico com instantâneos por página: páginas que não mudaram reaproveitam a mesma string.
- Realces de “Editar texto” só são calculados para as páginas visíveis.

### Novos recursos
- **Tarja definitiva** (tecla X, ou “Definitivo” no corretivo): a página é regravada como imagem e o conteúdo coberto deixa de existir no arquivo (texto, imagens, anotações e campos de formulário da página).
- **Edição de texto por linha**: os pedaços que o pdf.js separa são juntados numa linha contínua.
- **Fontes Unicode**: caracteres fora do WinAnsi (→, ✓, grego, cirílico…) usam DejaVu, incorporada com subconjunto. O que nenhuma fonte cobre vira “?”, com aviso.
- **Miniaturas mostram os elementos adicionados.**
- **Rascunho automático** no IndexedDB, com opção de continuar ou descartar na próxima visita.
- **Seleção múltipla** (Shift+clique, arrastar numa área vazia, Ctrl+A), alinhar à esquerda/centro/direita/topo/meio/base.
- **Copiar, recortar e colar** elementos entre páginas (Ctrl+C/X/V); colar texto puro cria um texto.
- **Guias de alinhamento** ao arrastar (bordas e centros da página e dos outros elementos; Alt desliga).
- **Girar** textos, imagens e assinaturas pela alça ou pelo campo “Rotação” (Shift: de 15 em 15°).
- **Alinhamento de texto** (esquerda, centro, direita), respeitado no PDF.
- **Zoom por pinça** no celular e zoom com Ctrl+roda mantendo o ponto sob o cursor.

### Segurança, privacidade e offline
- pdf.js, pdf-lib, fontkit e todas as fontes servidos pelo próprio site (`vendor/`): nenhuma requisição a CDN ou ao Google Fonts.
- Content-Security-Policy restrita a `'self'`.
- PWA: service worker, manifesto, ícones; funciona offline e abre PDFs pelo sistema quando instalado.
- pdf.js atualizado de 3.11 para 4.10 (módulos ES), mantendo `isEvalSupported: false`.

### Código
- `app.js` (1.321 linhas) dividido em 12 módulos ES em `src/`, ainda sem etapa de build.
- Testes de ponta a ponta com Playwright (`npm test`).
- `npm run vendor` para atualizar as bibliotecas locais.
