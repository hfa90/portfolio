# ServiçoHub — Marketplace de Serviços

Plataforma completa de marketplace de serviços (freelance e CLT) conectando profissionais e clientes. Construída com HTML/CSS/JavaScript puro + Supabase.

---

## 🗂 Estrutura de Arquivos

```
marketplace/
├── index.html                    ← Redireciona para pages/index.html
├── css/
│   └── global.css                ← Estilos globais (Glassmorphism / Windows 11)
├── js/
│   ├── supabase.js               ← Client Supabase + helpers de auth e ViaCEP
│   └── utils.js                  ← Toast, formatadores, máscaras, modal helpers
└── pages/
    ├── index.html                ← Login + Cadastro (Profissional e Cliente)
    ├── client-dashboard.html     ← Dashboard do Cliente
    └── professional-dashboard.html ← Dashboard do Profissional
```

---

## ⚙️ Configuração Passo a Passo

### 1. Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto.
2. Anote a **URL do projeto** e a **anon key** (Settings → API).

### 2. Executar o SQL no Supabase

Abra o **SQL Editor** e execute os scripts **nesta ordem exata**:

```
01_schema.sql   → Cria as tabelas
02_rls.sql      → Configura as políticas de segurança (RLS)
03_seed.sql     → Popula categorias e nichos
04_search.sql   → Cria as funções de busca FTS + pg_trgm
```

### 3. Criar bucket de Storage

No painel do Supabase → **Storage → New bucket**:

- Nome: `resumes`
- Public bucket: ✅ **Habilitado**
- Allowed MIME types: `application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Max file size: `5242880` (5MB)

Depois adicione esta **policy** no bucket `resumes`:

```sql
-- Permite que profissionais autenticados façam upload do próprio currículo
CREATE POLICY "resume_upload_own"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'resumes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Leitura pública
CREATE POLICY "resume_read_public"
ON storage.objects FOR SELECT
USING (bucket_id = 'resumes');
```

### 4. Configurar as credenciais no projeto

Abra o arquivo `js/supabase.js` e substitua:

```javascript
const SUPABASE_URL = 'https://SEU_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_ANON_KEY_AQUI';
```

Pelos valores reais do seu projeto (Settings → API no painel do Supabase).

### 5. Habilitar Email Auth no Supabase

Authentication → Providers → **Email** → Enable.

Para desenvolvimento sem confirmação de e-mail:
Authentication → Settings → **Disable email confirmations** ✅

---

## 🚀 Como Rodar Localmente

Você precisa servir os arquivos via HTTP (não abrir direto pelo sistema de arquivos) por causa dos módulos ES6.

**Opção A — VS Code + Live Server:**
Instale a extensão "Live Server" e clique em "Go Live".

**Opção B — Python:**
```bash
cd marketplace
python3 -m http.server 8080
# Acesse: http://localhost:8080
```

**Opção C — Node.js:**
```bash
npx serve marketplace
```

---

## 🔐 Fluxo de Autenticação

```
Acessa index.html
       ↓
  Já tem sessão? ──── SIM ──→ Redireciona pelo user_type
       │ NÃO
       ↓
  Login / Cadastro
       ↓
  user_type = 'client'      → client-dashboard.html
  user_type = 'professional' → professional-dashboard.html
```

---

## 🧠 Motor de Busca Inteligente

A busca usa duas camadas no PostgreSQL:

| Camada | Técnica | Uso |
|--------|---------|-----|
| Primária | Full Text Search (FTS) com `to_tsvector` + `to_tsquery` | Buscas por palavras completas |
| Secundária | `pg_trgm` com `similarity()` | Tolerância a erros de digitação |

**Exemplos de chamada no JS:**

```javascript
// Buscar profissionais
const { data } = await supabase.rpc('search_professionals', {
  query_text: 'desenvolvedor react',
  p_category_id: null,     // UUID ou null
  p_city: 'São Paulo',     // string ou null
  result_limit: 20
});

// Buscar demandas
const { data } = await supabase.rpc('search_demands', {
  query_text: 'instalação elétrica',
  p_category_id: null,
  p_modality: 'presential', // 'remote' | 'presential' | 'hybrid' | null
  p_contract: null,
  result_limit: 20
});
```

---

## 📱 Funcionalidades por Perfil

### 👤 Cliente
| Feature | Status |
|---------|--------|
| Cadastro com CPF/CNPJ + ViaCEP | ✅ |
| Publicar demandas | ✅ |
| Filtrar por categoria, modalidade, contrato | ✅ |
| Ver candidatos recebidos | ✅ |
| Aceitar / Recusar candidatos | ✅ |
| Chat integrado com profissional | ✅ |
| Convidar profissional direto | ✅ |
| Busca de profissionais com FTS | ✅ |
| Dashboard com estatísticas | ✅ |

### 🔧 Profissional
| Feature | Status |
|---------|--------|
| Cadastro com CNPJ opcional + ViaCEP | ✅ |
| Upload de currículo (PDF/DOC) | ✅ |
| Configurar áreas de atuação (nichos) | ✅ |
| Definir valor mínimo | ✅ |
| Toggle de disponibilidade | ✅ |
| Buscar demandas com FTS | ✅ |
| Enviar propostas | ✅ |
| Acompanhar propostas enviadas | ✅ |
| Receber e responder convites | ✅ |
| Chat com clientes | ✅ |

---

## 🎨 Design System

- **Estilo:** Glassmorphism + Windows 11
- **Fontes:** Plus Jakarta Sans (display) + Nunito (corpo)
- **Ícones:** Tabler Icons
- **Cores:** Primária `#5b7cfa`, Accent `#34d399`, Secundária `#a78bfa`
- **Efeitos:** `backdrop-filter: blur(20px)`, bordas translúcidas, sombras suaves

---

## 🔄 Próximas Melhorias Sugeridas

- [ ] Notificações em tempo real com Supabase Realtime
- [ ] Avaliações e reviews após conclusão do serviço
- [ ] Sistema de pagamento (Stripe / PagSeguro)
- [ ] PWA com Service Worker para uso offline
- [ ] Painel administrativo
- [ ] Verificação de documentos (CPF/CNPJ)
- [ ] Integração com LinkedIn para importar currículo
