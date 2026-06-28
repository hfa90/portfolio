# Clinicou - Detalhes do projeto

## Visao geral

Clinicou e um sistema web estatico para gestao de clinica. A aplicacao roda em `index.html`, usa `styles.css` para o visual e concentra as regras em `app.js`. O estado operacional e salvo no `localStorage` do navegador, com autenticacao Supabase obrigatoria na tela inicial e um `schema.sql` preparado para evolucao do backend.

## Arquivos principais

- `index.html`: estrutura das telas, formularios, modais e navegacao lateral.
- `styles.css`: design system, layout responsivo, tabelas, cards, formularios, modais e estados visuais.
- `app.js`: dados iniciais, persistencia local, renderizacao das telas, mascaras, regras de cadastro, templates e exportacoes.
- `supabase/schema.sql`: modelo de banco, RLS, grants, auditoria, storage e tabelas principais para Supabase.

## Modulos existentes

- Visao geral: metricas do dia, receita prevista, risco de no-show, planos ativos, fila de atendimento, prioridades, fluxo financeiro e confirmacoes pendentes.
- Agenda: filtro por data, status, agenda por medico, cadastro de consulta, sugestao de horario e lancamento financeiro automatico.
- Pacientes: cadastro, edicao, exclusao, busca e abertura rapida do prontuario.
- Prontuario: evolucao clinica, busca inteligente por nome/WhatsApp/CPF, historico em popup, atestado inteligente e receita inteligente.
- Financeiro: receitas, despesas, status, repasse por profissional, CSV, resumo financeiro e marcacao de pagamento.
- Planos de saude: cadastro, edicao, suspensao/reativacao e exclusao quando nao houver pacientes vinculados.
- Funcionarios: cadastro de medicos, enfermeiros, assistentes, servicos gerais e secretarios. Medicos ativos aparecem no campo Profissional ao agendar consulta.
- Disponibilidade medica: configuracao individual de dias e horarios em que cada medico atende na clinica.
- Guia de atendimento: formulario com paciente, profissional, procedimento, descricao, assinatura manuscrita em canvas e download em HTML.
- CRM: templates personalizados para WhatsApp, busca de paciente, copia manual, abertura do WhatsApp e registro de envio.
- Admin: exportacao/importacao de backup JSON, alteracao do nome da clinica e configuracao financeira de comissoes medicas.

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
- A disponibilidade individual do medico limita a sugestao de horarios da agenda.
- Planos suspensos deixam de aparecer como opcao ativa para novos pacientes.
- Templates de CRM sao personalizados com nome do paciente, proxima consulta, servico e profissional quando disponiveis.
- Comissoes sao calculadas quando a configuracao financeira da clinica estiver ativa.
- Guias de atendimento assinadas sao salvas e tambem vinculadas ao historico do prontuario.
- Avisos e confirmacoes usam modal proprio do Clinicou, sem `alert`/`confirm` nativos do navegador.

## Persistencia

O app usa `localStorage` com a chave `clinicou_state_v3` como cache local e fallback. Quando existe sessao Supabase e as tabelas estao criadas/expostas pela Data API, os formularios gravam no banco e recarregam os dados remotos.

## Supabase

O arquivo `supabase/schema.sql` contem tabelas para clinicas, membros, pacientes, profissionais, funcionarios, servicos, agenda, prontuarios, financeiro, comissoes, templates de notificacao, auditoria e storage privado de documentos.

Mudancas recentes no schema:

- `patients.cpf` e `patients.whatsapp`.
- Indice unico parcial para evitar duplicidade por `clinic_id + nome + CPF`.
- Tabela `staff_members` para funcionarios com cargo, CRM, contato, comissao, horario e status.
- Tabela `attendance_guides` para guias assinadas.
- `clinics.settings` guarda configuracao de comissoes.
- `staff_members.working_hours` guarda disponibilidade individual dos medicos.
- `medical_records.payload` guarda documentos gerados no prontuario.
- `commissions.settled_at` registra baixa de comissao.
- RLS, grants, gatilho de `updated_at` e auditoria para `staff_members`.

## Observacoes importantes

- Para gravacao remota funcionar, execute `supabase/schema.sql` no Supabase e confirme que as tabelas novas estao expostas para a Data API.
- Se alguma tabela remota ainda nao existir, o app mostra aviso e mantem o funcionamento local.
- Os documentos inteligentes sao auxiliares de texto e precisam de revisao, assinatura e carimbo de profissional habilitado antes do uso.
