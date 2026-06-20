# BolãoCopa26 — Sistema de Bolão FIFA World Cup 2026

Site completo para organizar bolões da Copa do Mundo 2026.

## Estrutura de Arquivos

```
bolao-copa-2026/
├── index.html          ← Página principal (toda a UI)
├── css/
│   └── style.css       ← Estilos completos
├── js/
│   ├── db.js           ← Banco de dados (localStorage) + dados iniciais
│   └── app.js          ← Lógica completa da aplicação
└── README.md
```

## Como Usar

### Rodando localmente
Basta abrir o `index.html` no navegador. Os dados são salvos automaticamente no `localStorage`.

Ou use um servidor local para evitar restrições de CORS:
```bash
# Python
python -m http.server 8080

# Node.js
npx serve .
```

Depois acesse: `http://localhost:8080`

---

## Funcionalidades

### Área do Participante
- **Dashboard** — countdown da Copa, ranking top 5, próximos jogos ao vivo, estatísticas gerais
- **Fazer Palpites** — cadastra palpites por jogo, filtros por status, salva no banco
- **Ranking** — tabela completa com pontos, acertos, precisão
- **Grupos** — tabela de cada grupo com classificação (V/E/D/GP/GC/SG/PTS)
- **Premiação** — pódio com valores por colocação + status de pagamento

### Área Administrativa
- **Painel Admin** — estatísticas, ações rápidas, log de atividade, configurações
- **Participantes** — adicionar/remover participantes, confirmar pagamentos
- **Resultados** — inserir e editar resultados, atualiza status dos jogos

---

## Sistema de Pontuação (configurável no Admin)

| Situação                   | Pontos |
|---------------------------|--------|
| Placar exato               | 10     |
| Resultado + saldo de gols  | 7      |
| Vencedor correto           | 4      |
| Resultado errado           | 0      |

---

## Banco de Dados

Os dados são armazenados no `localStorage` do navegador sob a chave `bolao_copa26_data`.

### Estrutura do DB:
```json
{
  "config": { "nome", "valorPorPart", "ptsExato", "ptsSaldo", "ptsVencedor", "prazoMin" },
  "participantes": [{ "id", "nome", "email", "whats", "pontos", "palpites", "pago", ... }],
  "jogos": [{ "id", "casa", "fora", "data", "hora", "grupo", "status", "golsCasa", "golsFora" }],
  "grupos": { "A": [...times...], "B": [...] },
  "palpites": { "j1": { "c": 2, "f": 1 }, "j2": { "c": 0, "f": 0 } },
  "log": [{ "msg", "time" }]
}
```

---

## Migração para Supabase (opcional)

Para usar com banco de dados real, substitua as funções em `js/db.js`:

```javascript
// Instale: npm install @supabase/supabase-js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient('SUA_URL', 'SUA_ANON_KEY')

async function loadDB() {
  const { data } = await supabase.from('bolao').select('*')
  return data
}

async function saveDB(data) {
  await supabase.from('bolao').upsert(data)
}
```

---

## Personalização

1. **Cores**: edite as variáveis CSS em `:root` no `style.css`
2. **Times**: adicione nas opções dos `<select>` no `index.html`
3. **Grupos**: edite o objeto `grupos` em `js/db.js`
4. **Pontuação**: ajuste no Painel Admin (salva automaticamente)
5. **Premiação**: edite a distribuição % em `renderPremiacao()` no `app.js`

---

## Tecnologias

- HTML5 + CSS3 puro (sem frameworks)
- JavaScript ES6+ vanilla
- Google Fonts (Inter + Oswald)
- localStorage para persistência

**Compatível com todos os navegadores modernos.**
