# RH+ Match — Inteligência em recolocação

Sistema desktop (Python) para consultorias de RH: cadastra o perfil do candidato, **varre os canais de vagas do Brasil ao mesmo tempo** e devolve as oportunidades **ranqueadas por compatibilidade**, com a explicação de cada nota. Inclui pipeline de acompanhamento até a contratação e relatórios prontos para enviar ao cliente.

## Como iniciar (Windows)

1. Tenha o Python 3.10+ instalado (marque *Add Python to PATH*).
2. Dê dois cliques em **`iniciar.bat`**. Na primeira vez ele cria o ambiente e instala as dependências (1–2 min).

Manual: `pip install -r requirements.txt` e `python main.py`.
Executável `.exe` para distribuir: rode `gerar_executavel.bat`.

## Versão online (GitHub Pages + Supabase)

**Página inicial:** https://haydenfernandes.com.br/rhmais/ (apresentação para candidatos e empresas, números ao vivo)
**Sistema:** https://haydenfernandes.com.br/rhmais/sistema/

Arquivos: `index.html` (página inicial) · `sistema/` (o sistema: `index.html`, `app.js`, `js/`, `style.css`, `manifest.webmanifest`, `sw.js`) · `config.js`, `icons/` e `supabase/` são compartilhados. A pasta `app/` é o pacote Python da versão desktop.
Links de e-mail e rotas antigas (`/rhmais/#/...`) que chegam na página inicial são encaminhados automaticamente para o sistema.

Papéis de acesso:
- **Master** (`haydenfernandes.ti@gmail.com`): tudo, mais a tela **Usuários** (aprova pedidos de empresas/RH, promove ou rebaixa administradores) e as **chaves de API** da plataforma em Ajustes.
- **Administrador** (empresas, RH, headhunters): banco de candidatos, busca, pipeline, currículos e **Ajustes** (canais e preferências).
- **Candidato**: Início, Meu perfil, Buscar vagas, Currículos e Minhas vagas. Não acessa Ajustes.
- Quem se cadastra como "Sou empresa / RH" entra como candidato e gera um pedido de acesso, que o master aprova em Usuários.

Vagas e candidaturas (Fase 2): administradores publicam vagas em **Minhas vagas** (pausar, encerrar, link público para divulgar); as vagas aparecem na busca dos candidatos com o selo **RH+ Match** e aceitam **candidatura direta** com o currículo escolhido. Empresa e candidato trocam **mensagens** e cada mudança de etapa pode avisar por **e-mail** (função `notificar`, via Resend). Página pública da vaga: `sistema/#/vaga/<id>` (abre sem login). Busca com filtros por cidade, estado, região, regime, nível, salário, data, canal e ordenação.

E-mails (Resend): crie a conta em https://resend.com, gere uma API key e rode
```
npx supabase secrets set RESEND_API_KEY=re_... --project-ref dpquyrvphongvqjpqxea
```
Sem domínio verificado, o Resend só entrega para o e-mail dono da conta Resend. Para enviar a qualquer pessoa, verifique o domínio (ex.: haydenfernandes.com.br) no Resend e defina também `RESEND_FROM="RH+ Match <avisos@haydenfernandes.com.br>"`.

Currículos: cada adaptação feita pela IA fica **salva para aquela vaga** (reabrir não gasta IA de novo); há currículo base (importado e organizado pela IA), currículo **padrão** e 5 **modelos** de layout (Clássico, Moderno, Executivo, Compacto, Criativo).

Banco: as migrações ficam em `supabase/migrations/` (aplicadas em ordem). `schema.sql` e `ia.sql` são a base inicial.

Arquitetura:
- **Frontend estático** (`index.html`, `app.js`, `style.css`, `config.js`) publicado pelo GitHub Pages.
- **Supabase Auth**: login por e-mail e senha. Cada conta (consultoria) tem seus próprios dados.
- **Supabase Postgres** (`supabase/schema.sql`): candidatos, vagas, pipeline, buscas e configurações, com **Row Level Security**: um usuário nunca enxerga os dados de outro.
- **Edge Function `buscar-vagas`** (`supabase/functions/buscar-vagas/`): consulta os portais (Gupy, Vagas.com, InfoJobs, Programathor, GitHub BR, Remotive, Himalayas, Adzuna, Jooble). O navegador chama um canal por vez, em paralelo, para mostrar o progresso.
- `supabase/functions/_shared/nucleo.js`: motor de compatibilidade (mesmas notas da versão desktop), leitura de currículo e utilidades. É usado pelo navegador e pela função.
- Currículos (PDF/DOCX) são lidos no próprio navegador e não são enviados a nenhum servidor. Excel e relatório também são gerados no navegador.

### Configuração do Supabase (uma vez)
1. **Banco:** Dashboard → SQL Editor → cole `supabase/schema.sql` → Run.
2. **Função de busca:** no terminal, dentro desta pasta:
   ```
   npx supabase login
   npx supabase functions deploy buscar-vagas --project-ref dpquyrvphongvqjpqxea
   ```
3. **Login por e-mail:** Authentication → URL Configuration → *Site URL* = `https://haydenfernandes.com.br/rhmais/` e, em *Redirect URLs*, inclua `https://haydenfernandes.com.br/rhmais/` e `https://haydenfernandes.com.br/rhmais/sistema/`, para que os links de confirmação e de nova senha voltem ao sistema (a página inicial também encaminha esses links).
4. **Currículo adaptado com IA (Claude, da Anthropic):**
   - SQL Editor → cole `supabase/ia.sql` → Run (cria o limite de 30 adaptações por conta a cada 24 h).
   - Crie uma chave em https://console.anthropic.com/settings/keys e guarde-a como secret do Supabase:
     ```
     npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref dpquyrvphongvqjpqxea
     npx supabase functions deploy adaptar-curriculo --project-ref dpquyrvphongvqjpqxea --use-api
     ```
   - A chave fica só no servidor (nunca no site). Modelo: `claude-opus-5-5`. As regras da IA estão em `supabase/functions/adaptar-curriculo/adaptar.js`: mantém empresas, cargos e datas; só acrescenta o que o currículo comprova; marca os acréscimos em verde; lista à parte os requisitos da vaga que o candidato não comprova.
5. (Opcional) Authentication → Sign In / Providers → desative *Allow new users to sign up* depois de criar as contas da equipe, se o sistema não deve aceitar cadastros abertos.

Para trocar de projeto Supabase, edite `config.js` (URL + chave *anon/publishable*, que é pública por natureza; a proteção vem do login + RLS).

> ⚠️ `dados/` e `exportacoes/` contêm dados pessoais de candidatos e estão no `.gitignore`. Não envie esses arquivos para o GitHub.

## Versão web local (FastAPI)

Mesmas telas e mesmo banco local (`dados/rhmais.db`), no navegador.

- Windows: dois cliques em **`iniciar_web.bat`** (abre `http://localhost:8000`).
- Manual: `pip install -r requirements.txt` e `python -m web.server`.
- **Acesso pela rede/equipe:** defina `RHMAIS_HOST=0.0.0.0` (e opcionalmente `RHMAIS_PORT`). Nesse caso **defina também `RHMAIS_SENHA`** (e, se quiser, `RHMAIS_USUARIO`): o navegador pedirá login.
- Exportações: o Excel é baixado pelo navegador; o relatório do cliente abre em nova aba (Ctrl+P → Salvar como PDF).
- Código: `web/server.py` (API FastAPI que reaproveita `app/`) e `web/static/` (interface HTML/CSS/JS, sem build).

## Módulos

| Tela | O que faz |
|---|---|
| **Painel** | KPIs (candidatos, vagas mapeadas, pipeline, contratações), funil, vagas por canal, competências mais pedidas pelo mercado, últimas buscas. |
| **Candidatos** | Cadastro completo (cargos-alvo, skills, senioridade, cidade/UF, modalidades aceitas, pretensão, mudança). **Importa currículo PDF/DOCX** e pré-preenche os campos. |
| **Buscar vagas** | Busca paralela em todos os canais ativos, deduplicação, score 0–100, filtros (modalidade, score mínimo, texto), painel “por que combina”, exportação Excel, **relatório HTML para o cliente** e atalhos para os demais portais. |
| **Pipeline** | Etapas Sugerida → Enviada → Candidatura → Entrevista → Proposta → Contratado/Descartada, com notas e exportação. |
| **Canais & Config.** | Liga/desliga canais, testa conexões, chaves de API, tema claro/escuro, nome da consultoria nos relatórios. |

## Canais de vagas

**Integrados (busca automática):**
- **Gupy**: maior plataforma de recrutamento do país.
- **Vagas.com** e **InfoJobs**: todas as áreas e níveis, forte em presencial.
- **Programathor** e **Comunidades GitHub BR** (backend-br, frontendbr, react-brasil, qa-brasil, androiddevbr, soujava, phpdevbr, datascience-br, uxbrasil): tecnologia.
- **Remotive** e **Himalayas**: vagas remotas internacionais abertas ao Brasil/LatAm.
- **Adzuna** e **Jooble**: agregadores com centenas de sites brasileiros (chave gratuita, configure em *Canais & Config.*).

**Busca pronta no navegador** (botão *Mais portais ↗*): Google Vagas, LinkedIn, Indeed, Catho, Glassdoor, BNE, Trabalha Brasil, Empregos.com.br, Sólides, 99Jobs, CIEE, Nube e Emprega Brasil/SINE. Esses portais não oferecem API pública e proíbem coleta automática nos termos de uso, por isso o sistema abre a pesquisa já filtrada em vez de raspar os dados.

## Como o score é calculado

| Critério | Peso |
|---|---|
| Aderência do título aos cargos-alvo | 35 |
| Competências do candidato presentes na vaga e cobertura do que a vaga pede | 30 |
| Localização (mesma cidade, estado, aceita mudança, remoto) | 13 |
| Modalidade (presencial / híbrido / remoto) | 12 |
| Senioridade | 10 |

Há ajustes para cargo sem relação, modalidade ou local incompatíveis, tecnologia exigida no título que o candidato não tem e salário frente à pretensão. Faixas: **Excelente** 75+, **Alta** 60–74, **Média** 45–59.

## Estrutura

```
main.py                 ponto de entrada
app/config.py           caminhos e configurações (dados/configuracoes.json)
app/database.py         SQLite local (dados/rhmais.db)
app/matcher.py          motor de compatibilidade
app/search_engine.py    busca paralela + deduplicação
app/resume_parser.py    leitura de currículos
app/exporter.py         Excel e relatório HTML
app/sources/            um conector por canal (adicione novos herdando de Fonte)
app/ui/                 telas (CustomTkinter)
diagnostico_fontes.py   testa todos os canais pelo terminal
```

### Adicionar um novo canal
Crie uma classe em `app/sources/` herdando de `Fonte`, implemente `buscar(filtros) -> list[Vaga]` usando `self.montar(...)` e registre-a em `app/sources/__init__.py`. Ela aparece sozinha nas telas.

## Observações
- Portais mudam o HTML de tempos em tempos. Se um canal aparecer como indisponível, rode `python diagnostico_fontes.py` e ajuste o conector correspondente.
- Os dados ficam no computador (pasta `dados/`). Faça backup do arquivo `rhmais.db`.
- Use o sistema com bom senso: os conectores fazem poucas requisições por busca e sempre apontam para o anúncio original.
