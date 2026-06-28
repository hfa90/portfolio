# Clinicou - Detalhes do projeto

## Visao geral

Clinicou e um sistema web estatico para gestao de clinica. A aplicacao roda em `index.html`, usa `styles.css` para o visual e concentra as regras em `app.js`. O Supabase e a fonte principal dos dados operacionais, com autenticacao obrigatoria na tela inicial e um `schema.sql` preparado para evolucao do backend.

## Arquivos principais

- `index.html`: estrutura das telas, formularios, modais e navegacao lateral.
- `planos.html`: pagina comercial para venda, trial de 30 dias e cadastro com confirmacao por e-mail.
- `styles.css`: design system, layout responsivo, tabelas, cards, formularios, modais e estados visuais.
- `sales.css` e `sales.js`: visual e comportamento da pagina comercial.
- `app.js`: dados iniciais, persistencia local, renderizacao das telas, mascaras, regras de cadastro, templates e exportacoes.
- `supabase/schema.sql`: modelo de banco, RLS, grants, auditoria, storage e tabelas principais para Supabase.
- `package.json`: scripts de verificacao local e testes.
- `.github/workflows/verify.yml`: CI inicial para validar JavaScript e testes estaticos.
- `docs/`: guias de ambientes, migrations e roadmap SaaS.

## Modulos existentes

- Visao geral: metricas do dia, receita prevista, risco de no-show, planos ativos, fila de atendimento, prioridades, fluxo financeiro e confirmacoes pendentes.
- Agenda: filtro por data, status, agenda por medico, cadastro de consulta, sugestao de horario e lancamento financeiro automatico.
- Portal medico: area exclusiva para medico acompanhar pacientes do dia, semana e mes, abrir prontuario, ver atendimentos concluidos e consultar comissoes do periodo.
- Pacientes: cadastro, edicao, exclusao, busca e abertura rapida do prontuario.
- Prontuario: evolucao clinica, busca inteligente por nome/WhatsApp/CPF, historico em popup, atestado inteligente e receita inteligente.
- Financeiro: receitas, despesas, status, repasse por profissional, CSV, resumo financeiro e marcacao de pagamento.
- Planos de saude: cadastro, edicao, suspensao/reativacao e exclusao quando nao houver pacientes vinculados.
- Funcionarios: cadastro de medicos, enfermeiros, assistentes, servicos gerais e secretarios. Medicos ativos aparecem no campo Profissional ao agendar consulta.
- Disponibilidade medica: configuracao individual de dias e horarios em que cada medico atende na clinica.
- Guia de atendimento: formulario com paciente, profissional, procedimento, descricao, assinatura manuscrita em canvas e download em HTML.
- CRM: templates personalizados para WhatsApp, busca de paciente, copia manual, abertura do WhatsApp e registro de envio.
- Admin: exportacao/importacao de backup JSON, alteracao do nome da clinica e configuracao financeira de comissoes medicas.
- Controle de acesso: nivel administrador, medico e secretaria, com permissao individual por tela definida no Admin.

## Regras implementadas

- CPF no cadastro de pacientes com mascara `000.000.000-00`.
- WhatsApp no cadastro de pacientes e funcionarios com mascara `(00) 00000-0000`.
- Bloqueio de paciente duplicado quando nome normalizado e CPF forem iguais.
- Busca de pacientes considera nome, CPF, WhatsApp, e-mail e plano.
- Busca inteligente no prontuario considera nome, CPF e WhatsApp.
- Historico de prontuario abre em popup com evolucoes e consultas do paciente.
- Atestado e receita sao gerados a partir do paciente selecionado e dos textos informados, sempre com aviso de revisao profissional.
- Atestado e receita podem ser gravados no prontuario e passam a aparecer no historico clinico.
- Medico exige CRM no cadastro de funcionario.
- Funcionarios suspensos deixam de aparecer na lista de profissionais da agenda.
- A disponibilidade individual do medico limita a sugestao de horarios da agenda e tambem bloqueia o salvamento manual fora dos dias/horarios permitidos.
- O botao de sugerir horario consulta o medico selecionado, ignora conflitos existentes e abre popup com opcoes de data e horario disponiveis.
- Medico nao pode agendar atendimento, mesmo que receba acesso visual a agenda.
- O prontuario possui sugestoes inteligentes enquanto digita para queixa principal, sinais vitais, conduta/procedimento e prescricao.
- A conduta/procedimento possui botao discreto para gerar texto baseado na queixa, sinais vitais e hipotese diagnostica.
- Os campos de procedimento e descricao da Guia de Atendimento tambem possuem sugestoes inteligentes.
- A Guia de Atendimento baixada tem modelo profissional em HTML, com cabecalho da clinica, dados do paciente, profissional, declaracao e assinatura digital.
- Planos suspensos deixam de aparecer como opcao ativa para novos pacientes.
- Templates de CRM sao personalizados com nome do paciente, proxima consulta, servico e profissional quando disponiveis.
- Comissoes sao calculadas quando a configuracao financeira da clinica estiver ativa.
- Guias de atendimento assinadas sao salvas e tambem vinculadas ao historico do prontuario.
- Avisos e confirmacoes usam modal proprio do Clinicou, sem `alert`/`confirm` nativos do navegador.
- Administrador pode alterar o nivel e as telas permitidas de cada funcionario em Admin > Controle de acesso.

## Persistencia

O app usa o Supabase como fonte principal dos dados operacionais da clinica. O `localStorage` guarda apenas metadados de sessao nao sensiveis, como a clinica ativa e dados basicos do tenant, na chave `clinicou_session_v1`. Chaves locais antigas com dados completos sao removidas na inicializacao.

## Supabase

O arquivo `supabase/schema.sql` contem tabelas para clinicas, membros, pacientes, profissionais, funcionarios, servicos, agenda, prontuarios, financeiro, comissoes, templates de notificacao, auditoria e storage privado de documentos.

Tambem ha base inicial para SaaS escalavel: planos, assinaturas, tarefas de onboarding, conexoes de integracao, regras de automacao, templates de documentos e eventos analiticos.

Mudancas recentes no schema:

- `patients.cpf` e `patients.whatsapp`.
- Indice unico parcial para evitar duplicidade por `clinic_id + nome + CPF`.
- Tabela `staff_members` para funcionarios com cargo, CRM, contato, comissao, horario e status.
- Tabela `attendance_guides` para guias assinadas.
- `clinics.settings` guarda configuracao de comissoes.
- `staff_members.working_hours` guarda disponibilidade individual dos medicos.
- `staff_members.access_role` e `staff_members.permissions` guardam nivel de acesso e telas permitidas por funcionario.
- `medical_records.payload` guarda documentos gerados no prontuario.
- `commissions.settled_at` registra baixa de comissao.
- RLS, grants, gatilho de `updated_at` e auditoria para `staff_members`.
- Tabelas `billing_plans`, `clinic_subscriptions`, `onboarding_tasks`, `integration_connections`, `automation_rules`, `document_templates` e `analytics_events`.
- Edge Functions iniciais para billing webhook, envio WhatsApp, renderizacao de documentos e ingestao de analytics.
- Pagina publica de planos com precos mensal/anual, comparativo comercial e cadastro via Supabase Auth.
- `create_clinic` cria assinatura `trialing` por 30 dias e tarefas iniciais de onboarding.
- O app exibe aviso a cada 20 minutos nas ultimas 24 horas do trial.

## Observacoes importantes

- Para gravacao remota funcionar, execute `supabase/schema.sql` no Supabase e confirme que as tabelas novas estao expostas para a Data API.
- Se alguma tabela remota ainda nao existir, o app mostra aviso e mantem o funcionamento local.
- Os documentos inteligentes sao auxiliares de texto e precisam de revisao, assinatura e carimbo de profissional habilitado antes do uso.
