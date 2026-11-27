# Análise e engenharia reversa: “Editar PDF” do iLovePDF

Página analisada: <https://www.ilovepdf.com/pt/editar-pdf> (acesso em 14/11/2026).
Método: leitura do HTML servido (≈ 78 KB), dos scripts referenciados, do objeto de configuração embutido e do texto visível da página.

> Este documento descreve o comportamento observável de um site público para fins de estudo. O HFA Editor PDF é uma implementação própria, escrita do zero. Não copia código, marca, textos nem recursos visuais do iLovePDF.

---

## 1. O que a página oferece

| Item | Observado |
|---|---|
| `<title>` | “Editor de PDF e Preenchedor de Formulários gratuito. Edite PDF online” |
| Meta description | “Editor de PDF Online Gratuito. Adicione facilmente texto, formas, comentários e destaques a um arquivo PDF…” |
| H1 / subtítulo | “Editar PDF” / “Edite PDF adicionando texto, formas, comentários e destaques.” |
| Entrada de arquivo | Botão “Selecionar arquivo PDF”, arrastar e soltar, Google Drive e Dropbox |
| Ferramentas do editor | Texto (adicionar e modificar), imagem, formas, comentários, destaques, reordenar elementos (frente/trás), “Remover tudo” |
| Navegação | Menu “Todas as ferramentas” (Organizar, Otimizar, Converter, Editar, Segurança, PDF Intelligence), login, registro, preços, 25 idiomas |
| Rodapé da ferramenta | Apenas “© iLovePDF 2026 ® - Seu Editor de PDF” |

### Fluxo do usuário

1. Escolhe o arquivo (local, Drive ou Dropbox).
2. O arquivo é **enviado** e a interface mostra “Carregando ficheiro X de Y”, “Tempo restante” e “Velocidade de carregamento – MB/S”.
3. Abre-se o editor com o painel “Elementos”.
4. Ao salvar, aparece “Editando PDF…” / “Processando” e o arquivo final é **baixado do servidor**.

---

## 2. Arquitetura inferida (engenharia reversa)

| Camada | Evidência no HTML | Conclusão |
|---|---|---|
| Front-end | `/dist/js/web.<hash>.js` e `/dist/js/editpdf.<hash>.js` | Pacote próprio com *bundle* por ferramenta e *cache busting* por hash |
| Upload | Referências a **plupload** | Upload em partes (*chunked*) para o servidor |
| Sessão de tarefa | `ilovepdfConfig = {"tool":"editpdf", …, "token":"eyJ…"}` e `ilovepdfConfig.taskId = '…'` | Cada edição é uma **tarefa no servidor**, autenticada por **JWT** e identificada por `taskId` |
| Processamento | Mensagens “Editando PDF…”, “Processando”, tempo e velocidade de upload | O PDF final é **gerado no back-end** (a mesma infraestrutura da iLoveAPI) |
| Monetização | `googletag.defineSlot`, `googletag.pubads`, `sizeMapping` | **Anúncios** do Google Publisher Tag na página |
| Análise de uso | `googletagmanager.com/gtag/js?id=G-…` | Google Analytics 4 |
| Planos | Textos “Característica Premium”, “Atualize para Premium”, `limitFiles`, `premium_limits`, “usuários não registrados” | Limites diferentes para anônimo, registrado e Premium |

Em resumo: é um cliente fino que coleta as edições no navegador e envia arquivo + instruções para o servidor montar o PDF.

---

## 3. Pontos fracos encontrados

**Privacidade e desempenho**
- O documento inteiro sai do computador do usuário para ser editado. Contratos, laudos e documentos pessoais passam por terceiros.
- O tempo de espera depende da internet (upload + processamento + download), mesmo para uma edição de uma palavra.
- Sem conexão, nada funciona.

**Limites e fricção**
- Recursos e tamanhos condicionados a cadastro ou plano Premium.
- Anúncios na mesma página do editor.
- Assinar, girar, reordenar ou inserir páginas exige **trocar de ferramenta** (cada uma é outra página e outro upload).

**Texto e idioma**
- Mistura de português de Portugal e do Brasil na mesma página: “ficheiro”, “Carregue” e “Contacto” ao lado de “arquivo” e “Selecionar”.
- “Preenchedor de Formulários” é um termo pouco natural.
- O botão principal diz “Selecionar arquivo PDF”, mas o `title` dele é “Adicionar mais ficheiros”.

**Acessibilidade**
- Ações de upload feitas com `<a href="javascript:;">` em vez de `<button>`.
- Botões só com ícone (ordenar, mostrar capas) dependem do atributo `title`.
- A mensagem “Oops! Algo está errado com sua ligação a internet…” fica no DOM mesmo sem erro.
- O bloco “Todas as ferramentas” aparece duplicado no HTML.

---

## 4. O que a versão melhorada faz diferente

| Tema | iLovePDF (observado) | HFA Editor PDF |
|---|---|---|
| Onde o PDF é processado | Servidor (upload por plupload, tarefa com JWT) | **No navegador**: pdf.js desenha, pdf-lib grava |
| Upload / download | Obrigatórios | Nenhum. O arquivo nunca sai do dispositivo |
| Conta, limites, anúncios | Planos e limites; anúncios | Nada disso |
| Editar texto existente | Sim (no servidor) | Sim: lê o texto com pdf.js, cobre o original e recria o trecho editável com fonte, tamanho e estilo aproximados |
| Ocultar dados sigilosos | — | **Tarja definitiva**: a página é regravada como imagem e o conteúdo coberto deixa de existir no arquivo |
| Formulários e marcadores | — | Preservados quando as páginas não são reorganizadas (edição no próprio arquivo) |
| Assinatura | Outra ferramenta | Integrada: desenhar, digitar (4 estilos) ou reutilizar assinaturas salvas no navegador |
| Páginas | Outras ferramentas | No próprio editor: arrastar para reordenar, girar, duplicar, excluir, página em branco, inserir outro PDF, combinar vários PDFs ao abrir |
| Ferramentas de anotação | Texto, imagem, formas, comentários, destaque | Texto, desenho livre, destaque (multiplicar), retângulo, elipse, linha, seta, corretivo, imagem, assinatura |
| Desfazer | — | Histórico (300 passos) com instantâneos por página, inclusive para páginas; rascunho automático no IndexedDB |
| Produtividade | — | Atalhos, seleção múltipla, copiar/colar entre páginas, guias de alinhamento, girar elementos, colar imagem ou texto, zoom com Ctrl+roda e pinça |
| Idioma | PT-PT e PT-BR misturados | PT-BR consistente |
| Acessibilidade | Links `javascript:;`, ícones sem rótulo | `<button>` reais com `aria-label`, `aria-pressed`, `<dialog>` nativo, navegação por teclado nas miniaturas (Alt+↑/↓), *skip link*, `prefers-reduced-motion` |
| Visual | Tema único | Tema claro/escuro automático com alternância manual |
| Offline | Não | PWA com service worker; bibliotecas e fontes servidas pelo próprio site, CSP `'self'` |
| Celular | Responsivo | Responsivo, com painéis deslizantes e ferramentas por toque |
| Arquivos grandes | Limitados pelo plano | Páginas desenhadas sob demanda (IntersectionObserver), cache LRU com limite de memória e liberação das páginas fora da tela |

---

## 5. Como funciona por dentro

```
Arquivo PDF ──► pdf.js ──► canvas de cada página visível (cache LRU)
      │                      ▲
      │                      │ camada de elementos (HTML/SVG em coordenadas da página)
      │                      │
      └──────► pdf-lib ◄── modelo de dados { páginas, elementos, imagens }
                  │
                  ├─ mesmo PDF, mesma ordem ──► desenha no próprio arquivo (preserva formulários)
                  └─ páginas reorganizadas ───► copyPages em lote para um PDF novo
                                    │
                   tarja ► página vira imagem │ coleta de lixo ► download local
```

- **Modelo** (`src/state.js`): cada página guarda a origem (documento e índice), a caixa visível (`view` do pdf.js), a rotação original e a do usuário, e uma lista de elementos. Os elementos ficam em pontos PDF com origem no canto superior esquerdo, então o zoom não altera os dados.
- **Desenho na tela** (`src/render.js`): o canvas é gerado com rotação 0 e a página inteira (canvas + elementos) é girada por CSS. O clique é convertido de volta para as coordenadas da página pela rotação inversa. Canvases das páginas que saem da área visível são liberados; o cache guarda no máximo ~160 MB de pixels.
- **Gravação** (`src/export.js`):
  - *No próprio arquivo* quando o documento tem exatamente as páginas de um PDF, na ordem original: formulários, marcadores, anexos, links e metadados continuam lá.
  - *Por cópia* nos outros casos, com uma chamada `copyPages` por documento de origem (recursos compartilhados não são duplicados).
  - Textos usam as 12 fontes padrão do PDF; o que não cabe no WinAnsi usa DejaVu (TrueType, com subconjunto), trecho a trecho. Formas, setas e traços viram vetores; o destaque usa *Multiply*; imagens são incorporadas em PNG ou JPG.
  - **Tarja definitiva**: a página é desenhada pelo pdf.js a ~200 dpi, os blocos são pintados sobre ela e o conteúdo original (textos, imagens, anotações e campos de formulário da página) é substituído por essa imagem.
  - **Coleta de lixo**: o pdf-lib grava todos os objetos que conhece, inclusive os que ficaram sem uso. Antes de salvar, tudo que não é alcançável a partir do catálogo é removido. Sem isso, o conteúdo tarjado continuaria escondido dentro do arquivo.
- **Histórico** (`src/history.js`): cada alteração grava o JSON de cada página; as páginas que não mudaram reaproveitam a string do passo anterior. As imagens ficam num repositório separado.
- **Rascunho** (`src/autosave.js`): PDFs e imagens são gravados uma vez no IndexedDB; a cada alteração só o modelo é regravado.

---

## 6. Limitações conhecidas (com honestidade)

- O **corretivo** simples cobre o trecho com um bloco: o texto antigo continua no arquivo. Para ocultar dados, use a **Tarja definitiva**.
- A página com tarja vira imagem: o texto dela deixa de ser selecionável e pesquisável, e os links e campos de formulário daquela página são removidos.
- Se a página herda recursos (fontes, imagens) do nó pai da árvore de páginas, esses recursos continuam no arquivo, porque outras páginas podem usá-los. Os textos da página tarjada são sempre removidos.
- Alfabetos asiáticos (chinês, japonês, coreano) e parte dos emojis ainda não são suportados nos textos adicionados: viram “?”, com aviso. Os emojis que a DejaVu tem saem em preto e branco.
- Ao reorganizar, combinar ou inserir páginas, o PDF é montado por cópia e os formulários e marcadores não são levados.
- PDFs criptografados ou protegidos por senha precisam ser desbloqueados antes.
- Ainda não há preenchimento de campos de formulário nem OCR para PDFs digitalizados.

## 7. Próximos passos possíveis

- Preencher formulários AcroForm (o pdf-lib já tem a API).
- Fonte Noto CJK sob demanda para chinês, japonês e coreano.
- Tarja que remove só os operadores de texto sob o bloco, mantendo o resto da página vetorial.
- Levar marcadores e formulários também no modo por cópia.
