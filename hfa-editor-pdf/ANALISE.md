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
| Assinatura | Outra ferramenta | Integrada: desenhar, digitar (4 estilos) ou reutilizar assinaturas salvas no navegador |
| Páginas | Outras ferramentas | No próprio editor: arrastar para reordenar, girar, duplicar, excluir, página em branco, inserir outro PDF, combinar vários PDFs ao abrir |
| Ferramentas de anotação | Texto, imagem, formas, comentários, destaque | Texto, desenho livre, destaque (multiplicar), retângulo, elipse, linha, seta, corretivo, imagem, assinatura |
| Desfazer | — | Histórico ilimitado (Ctrl+Z / Ctrl+Y), inclusive para páginas |
| Produtividade | — | Atalhos de teclado, colar imagem (Ctrl+V), soltar imagem sobre a página, zoom com Ctrl+roda, duplicar, mover com setas |
| Idioma | PT-PT e PT-BR misturados | PT-BR consistente |
| Acessibilidade | Links `javascript:;`, ícones sem rótulo | `<button>` reais com `aria-label`, `aria-pressed`, `<dialog>` nativo, navegação por teclado nas miniaturas (Alt+↑/↓), *skip link*, `prefers-reduced-motion` |
| Visual | Tema único | Tema claro/escuro automático com alternância manual |
| Celular | Responsivo | Responsivo, com painéis deslizantes e ferramentas por toque |
| Arquivos grandes | Limitados pelo plano | Páginas desenhadas sob demanda (IntersectionObserver) e cache por nível de zoom |

---

## 5. Como funciona por dentro

```
Arquivo PDF ──► pdf.js ──► canvas de cada página (sob demanda)
      │                      ▲
      │                      │ camada de elementos (HTML/SVG em coordenadas da página)
      │                      │
      └──────► pdf-lib ◄── modelo de dados { páginas, elementos, imagens }
                  │
                  └──► novo PDF (copyPages + desenho vetorial) ──► download local
```

- **Modelo**: cada página guarda a origem (documento e índice), a caixa visível (`view` do pdf.js), a rotação original e a do usuário, e uma lista de elementos. Os elementos ficam em pontos PDF com origem no canto superior esquerdo, então o zoom não altera os dados.
- **Desenho na tela**: o canvas é gerado com rotação 0 e a página inteira (canvas + elementos) é girada por CSS. O clique é convertido de volta para as coordenadas da página pela rotação inversa.
- **Gravação**: as páginas originais são copiadas com `copyPages` (preservando conteúdo, links e fontes). Textos usam as 12 fontes padrão do PDF; formas, setas e traços livres viram vetores (`drawSvgPath`); o destaque usa o modo de mesclagem *Multiply*; as imagens são incorporadas em PNG ou JPG.
- **Histórico**: cada alteração grava uma cópia do modelo em JSON. As imagens ficam num repositório separado, então o histórico continua leve.

---

## 6. Limitações conhecidas (com honestidade)

- **Editar texto existente** cobre o trecho original com um bloco branco. O texto antigo continua no arquivo, por baixo do bloco, e não deve ser usado para ocultar dados sigilosos.
- Textos novos usam Helvetica, Times ou Courier, que cobrem o português (WinAnsi), mas não emojis nem alfabetos não latinos.
- PDFs criptografados ou protegidos por senha precisam ser desbloqueados antes.
- Ainda não há preenchimento de campos de formulário AcroForm nem OCR para PDFs digitalizados.

## 7. Próximos passos possíveis

- Preencher formulários AcroForm (o pdf-lib já tem a API).
- Incorporar fontes TrueType com `@pdf-lib/fontkit` para cobrir qualquer idioma.
- Tarja definitiva (remover o conteúdo de verdade, não só cobrir).
- Service Worker para funcionar 100% offline (PWA).
