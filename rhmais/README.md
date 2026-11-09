# RH+ Match — Inteligência em recolocação

Sistema desktop (Python) para consultorias de RH: cadastra o perfil do candidato, **varre os canais de vagas do Brasil ao mesmo tempo** e devolve as oportunidades **ranqueadas por compatibilidade**, com a explicação de cada nota. Inclui pipeline de acompanhamento até a contratação e relatórios prontos para enviar ao cliente.

## Como iniciar (Windows)

1. Tenha o Python 3.10+ instalado (marque *Add Python to PATH*).
2. Dê dois cliques em **`iniciar.bat`**. Na primeira vez ele cria o ambiente e instala as dependências (1–2 min).

Manual: `pip install -r requirements.txt` e `python main.py`.
Executável `.exe` para distribuir: rode `gerar_executavel.bat`.

## Versão web

Mesmas telas e mesmo banco (`dados/rhmais.db`), no navegador.

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
