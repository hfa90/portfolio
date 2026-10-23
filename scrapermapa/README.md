# Prospecta — prospecção de empresas no mapa

Sistema web local para encontrar empresas de uma região (bairro, rua, cidade ou área do mapa)
direto do **Google Maps**, montar uma lista de leads com todos os detalhes e acompanhar a
captação de clientes num mini-CRM. **Não usa IA nem API paga**: a coleta é feita por um
navegador real (Playwright) lendo a página do Google Maps, e os dados são tratados com regras
e expressões regulares.

## O que ele coleta

| Campo | Origem |
|---|---|
| Nome, categoria | Painel da empresa no Google Maps |
| Telefone (formatado + E.164) e se é **celular / provável WhatsApp** | Botão de telefone do Maps |
| Endereço completo, **rua, número, complemento, bairro, cidade, UF, CEP** | Endereço do Maps → parser de endereço brasileiro |
| Latitude / longitude, Plus Code | URL e painel do Maps |
| Avaliação e nº de avaliações, horário de funcionamento, faixa de preço, situação (aberto / fechado) | Painel do Maps |
| Site | Botão "Website" |
| **E-mail, Instagram, Facebook, LinkedIn, link de WhatsApp** (opcional) | Visita ao site da empresa (regex) |
| Score de contato (0–100) | Regras: tem telefone, celular, e-mail, site, redes, avaliação… |

## Funcionalidades

- **Prospecção no mapa** — busca por *bairro/rua/cidade* (texto) ou pela *área visível do mapa*,
  com **varredura em grade 2×2 / 3×3** para cobrir regiões grandes (o Google mostra ~120 resultados
  por busca). Progresso, log e resultados aparecem em tempo real, com marcadores no mapa.
- **Filtro estrito por local** — descarta empresas cujo endereço não contém o bairro/rua digitado.
- **Leads (CRM)** — tabela com busca, filtros (status, cidade, bairro, segmento, busca de origem,
  com telefone, celular/WhatsApp, com e-mail, com/sem site), ordenação, paginação, visualização em
  mapa, ações em massa (status, tags, exportar, excluir).
- **Ficha do lead** — WhatsApp com mensagem pronta (personalizável), ligar, site, Maps,
  funil (Novo → Contatado → Em negociação → Cliente / Descartado), tags, anotações e histórico.
- **Sem duplicados** — cada empresa tem um ID do Google; buscas repetidas atualizam o registro
  sem perder status e anotações.
- **Exportação** Excel (.xlsx formatado, com links) e CSV (padrão Excel BR, `;`).
- **Painel** com indicadores, leads por dia, funil, bairros e segmentos com mais leads.

## Instalação (Windows)

Pré-requisito: **Python 3.10+** ([python.org](https://www.python.org/downloads/) — marque
*"Add python.exe to PATH"*).

1. Dê dois cliques em **`instalar.bat`** (cria `.venv`, instala dependências e o Chromium).
2. Dê dois cliques em **`iniciar.bat`** — o navegador abre em `http://127.0.0.1:8000`.

Manual / Linux / macOS:

```bash
python -m venv .venv
.venv\Scripts\activate          # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
python run.py
```

> Se o Chromium do Playwright não estiver instalado, o sistema tenta usar o **Edge** ou o
> **Chrome** já instalados na máquina.

## Como usar

1. **Prospecção** → digite o segmento (ex.: *clínicas odontológicas*).
2. Escolha **Bairro / rua / cidade** e digite o local (ex.: *Moema, São Paulo* ou
   *Rua Augusta, São Paulo*), **ou** escolha **Área do mapa** e enquadre a região.
3. Defina a quantidade máxima e, se quiser, ative *Buscar e-mail e redes sociais*.
4. **Iniciar prospecção**. Ao terminar, clique em **Abrir na lista** para trabalhar os leads.

Em **Configurações** (menu lateral): mensagem padrão do WhatsApp (`{empresa}`, `{bairro}`,
`{cidade}`, `{categoria}`), número de abas simultâneas e opção de **mostrar o navegador** durante
a busca (útil para acompanhar ou resolver uma verificação do Google).

## Estrutura

```
app/
  main.py       API FastAPI (rotas /api/...) e servidor dos arquivos estáticos
  scraper.py    Playwright: abre o Maps, rola a lista, extrai cada empresa
  parser.py     Parser de endereço BR, telefone, avaliações, coordenadas, score
  enrich.py     Visita o site e extrai e-mail/redes com regex
  jobs.py       Execução das buscas em segundo plano + progresso
  database.py   SQLite (data/prospecta.db)
  exporter.py   CSV / XLSX
static/         Front-end (HTML + CSS + JS puro, Leaflet para o mapa)
run.py          Inicializa o servidor
```

## Manutenção dos seletores

O Google altera o HTML do Maps de tempos em tempos. Se algum campo parar de vir, ajuste o
JavaScript `JS_DETALHES` em `app/scraper.py` (cada campo já tem mais de uma estratégia:
classe CSS, `data-item-id` e `aria-label`). Para depurar, ative *Mostrar o navegador* nas
configurações e acompanhe a busca.

## Boas práticas e limites

- Use 2–3 abas simultâneas. Volume muito alto em pouco tempo pode fazer o Google pedir
  verificação ou limitar o acesso temporariamente.
- A coleta automatizada vai contra os Termos de Serviço do Google Maps; use com moderação e por
  sua conta. Para uso em larga escala/comercial, a alternativa oficial é a Google Places API.
- Os dados coletados são públicos, mas contatos de pessoas físicas estão sujeitos à **LGPD**:
  aborde as empresas de forma profissional e ofereça opção de não receber novos contatos.
