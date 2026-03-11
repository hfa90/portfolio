# ASPROC – Guia de Configuração Supabase + Admin

## Arquivos entregues

| Arquivo | Descrição |
|---|---|
| `admin.html` | Painel administrativo completo |
| `supabase_setup.sql` | Cria tabelas e importa todos os dados existentes |
| `asproc-supabase.js` | Módulo de integração para as páginas públicas |

---

## Passo 1 – Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita
2. Clique em **New project**
3. Escolha um nome (ex: `asproc`) e defina uma senha forte para o banco
4. Aguarde o projeto ser criado (~2 min)

---

## Passo 2 – Executar o SQL

1. No painel Supabase, vá em **SQL Editor** → **New query**
2. Cole o conteúdo do arquivo `supabase_setup.sql`
3. Clique em **Run**
4. As tabelas serão criadas e todos os dados existentes serão importados

---

## Passo 3 – Pegar as credenciais

1. No painel Supabase, vá em **Settings → API**
2. Copie:
   - **Project URL** → `https://xyzabc.supabase.co`
   - **anon / public key** → `eyJhbGci...` (chave longa)

---

## Passo 4 – Criar usuário administrador

1. No painel Supabase, vá em **Authentication → Users**
2. Clique em **Add user**
3. Insira o e-mail e senha do administrador
4. Clique em **Create user**

---

## Passo 5 – Configurar o Admin

1. Abra `admin.html` no navegador
2. Vá em **Configurações → Conexão Supabase**
3. Cole a **Project URL** e a **anon key**
4. Clique em **Salvar configuração**
5. Clique em **Testar conexão** para confirmar
6. Faça login com o e-mail/senha criado no Passo 4

---

## Passo 6 – Integrar as páginas públicas

### Opção A – Usando o arquivo JS (recomendado)

Adicione no `<head>` de cada página:

```html
<script src="asproc-supabase.js"></script>
```

Depois substitua os dados hard-coded pelas chamadas dinâmicas:

**noticias.html** – adicione `id="noticias-grid"` no container dos cards e chame:
```html
<script>document.addEventListener('DOMContentLoaded', initNoticias);</script>
```

**trabalhe-conosco.html** – adicione `id="vagas-grid"` no container e chame:
```html
<script>document.addEventListener('DOMContentLoaded', initVagas);</script>
```

**avisos.html** – adicione `id="avisos-list"` no container e chame:
```html
<script>document.addEventListener('DOMContentLoaded', initAvisos);</script>
```

**index_asproc.html** – adicione `id="home-noticias-grid"` na section de notícias e chame:
```html
<script>document.addEventListener('DOMContentLoaded', initHomeNoticias);</script>
```

### Opção B – Inline (sem arquivo extra)

Abra `admin.html` → **Configurações → Integração com as páginas** → copie o snippet e cole no `<head>` de cada página.

---

## Estrutura das tabelas

### `noticias`
| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | Chave primária |
| titulo | text | Título da notícia |
| resumo | text | Texto curto para cards |
| conteudo | text | Texto completo |
| categoria | text | pirarucu / olea / sanear / comercio / vagas / geral |
| data_pub | date | Data de publicação |
| destaque | boolean | Aparece como card principal |
| publicado | boolean | Visível no site |
| url_externa | text | Link para notícia original |
| imagem_url | text | URL da imagem |

### `vagas`
| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | Chave primária |
| titulo | text | Nome da vaga |
| descricao | text | Descrição completa |
| local | text | Localização |
| regime | text | CLT / PJ / Estágio / Voluntário |
| carga_horaria | text | Integral / Parcial / Campo / Remoto |
| escolaridade | text | Nível de escolaridade mínimo |
| prazo | date | Prazo de inscrição |
| status | text | aberta / encerrada / suspensa |
| edital_url | text | URL do PDF do edital |

### `avisos`
| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | Chave primária |
| titulo | text | Título do aviso |
| descricao | text | Texto completo |
| tipo | text | doc / urgente / info |
| data_pub | date | Data de publicação |
| publicado | boolean | Visível no site |
| doc_url | text | URL do documento |

### `candidaturas`
| Campo | Tipo | Descrição |
|---|---|---|
| id | uuid | Chave primária |
| nome | text | Nome do candidato |
| email | text | E-mail |
| telefone | text | Telefone |
| vaga | text | Vaga de interesse |
| mensagem | text | Mensagem da candidatura |
| curriculo_url | text | URL do currículo |
| status | text | nova / em_analise / aprovada / reprovada |

---

## Funcionalidades do Painel Admin

- ✅ Login seguro via Supabase Auth
- ✅ Dashboard com estatísticas em tempo real
- ✅ CRUD completo de Notícias (criar, editar, publicar, despublicar, excluir)
- ✅ CRUD completo de Vagas (abrir, encerrar, suspender)
- ✅ CRUD completo de Avisos
- ✅ Gerenciamento de Candidaturas (aprovar / reprovar)
- ✅ Filtros por categoria, status e tipo
- ✅ Busca em tempo real
- ✅ Interface responsiva (mobile-friendly)
- ✅ Snippet de integração gerado automaticamente

---

*ASPROC – Associação dos Produtores Rurais de Carauari*
