# HFA Editor PDF

Editor de PDF gratuito que roda **100% no navegador**. Sem upload, sem cadastro, sem banco de dados e sem anúncios.

Feito a partir de uma análise e engenharia reversa da ferramenta “Editar PDF” do iLovePDF. Veja [ANALISE.md](ANALISE.md).

## Recursos

- **Editar texto existente**: clique num trecho do PDF para reescrevê-lo
- **Texto** com fonte, tamanho, cor, negrito e itálico
- **Assinatura**: desenhar, digitar ou reutilizar assinaturas salvas no navegador
- **Anotações**: desenho livre, destaque, retângulo, elipse, linha, seta e corretivo
- **Imagens**: botão, arrastar e soltar sobre a página ou colar (Ctrl+V)
- **Páginas**: reordenar arrastando, girar, duplicar, excluir, página em branco, inserir outro PDF, combinar vários PDFs ao abrir
- Desfazer e refazer ilimitados, atalhos de teclado, zoom, tema claro/escuro, layout para celular

## Tecnologia

- HTML, CSS e JavaScript puro, sem etapa de build
- [pdf.js 3.11](https://mozilla.github.io/pdf.js/) para desenhar as páginas e extrair o texto
- [pdf-lib 1.17](https://pdf-lib.js.org/) para gerar o PDF final
- `localStorage` só para o tema e as assinaturas salvas

## Rodar localmente

Qualquer servidor estático serve. Por exemplo:

```bash
python -m http.server 8080
```

Depois abra <http://localhost:8080>.

## Estrutura

```
index.html   página inicial + editor + diálogos
styles.css   tema claro/escuro e layout responsivo
app.js       modelo de dados, renderização, ferramentas e exportação
ANALISE.md   análise do site de referência e decisões de projeto
```
