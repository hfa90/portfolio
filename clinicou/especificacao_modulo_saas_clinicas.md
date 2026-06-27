# Arquitetura e Módulos para Sistema SaaS Clínicas (Multi-Tenant)

Este documento apresenta a especificação técnica e de negócios para o desenvolvimento de um sistema web modular, altamente escalável e baseado na arquitetura **Multi-Tenant (Isolamento de Dados)**. O objetivo é permitir que múltiplas clínicas (médicas, odontológicas, estética e gerais) utilizem a mesma infraestrutura de forma totalmente privada, segura e independente.

---

## 1. Arquitetura Base (Core Multi-Tenancy)
O alicerce para garantir que o sistema possa ser vendido em escala global com isolamento de dados absoluto.

### Isolamento de Banco de Dados (Multi-Tenant)
* **Estratégia Recomendada:** *Database-per-Tenant* (para máxima segurança de dados de saúde e conformidade com LGPD) ou *Schema-per-Tenant* (melhor custo-benefício em nuvem).
* **Identificador Único (Tenant ID):** Cada requisição HTTP deve conter o identificador da clínica, validado na camada de middleware para garantir que nenhuma consulta intercepte dados de outros clientes.

### Segurança e Controle de Acesso (RBAC)
* **Autenticação Centralizada:** Suporte a login por e-mail/senha, dois fatores (2FA) e OAuth2.
* **Papéis Customizáveis (Roles):** Perfis pré-definidos (Administrador, Recepcionista, Profissional de Saúde, Faturista) com permissões granulares por módulo.
* **Trilha de Auditoria (Audit Logs):** Registro imutável de todas as ações sensíveis no sistema (quem visualizou o prontuário X, quem alterou o financeiro Y, com timestamp e IP).

---

## 2. Módulos Funcionais e Escala de Negócios

### Módulo 1: Painel Administrativo da Clínica (Tenant Admin)
Permite que o dono da clínica configure sua própria operação sem depender do suporte do sistema.
* **Parametrização de Especialidades:** Ativação de recursos específicos com um clique (ex: ativar Odontograma para clínicas odonto, ou Ficha de Anamnese Corporal para estética).
* **Gestão de Profissionais e Agendas:** Cadastro do corpo clínico, definição de horários de atendimento, salas de atendimento e especialidades associadas.

### Módulo 2: Agenda Inteligente e Recepção
Foco em usabilidade rápida para a linha de frente da clínica.
* **Grade Multi-Profissional:** Visualização lado a lado das agendas dos profissionais daquela unidade.
* **Gestão de Status em Tempo Real:** Fluxo visual claro (Agendado, Confirmado, Na Recepção, Em Atendimento, Finalizado, Faltou).
* **Painel de Senhas Integrado:** Tela externa para chamada de pacientes na recepção.

### Módulo 3: Prontuário Eletrônico (PEP) Adaptável
O módulo central que muda de comportamento baseado no perfil configurado.
* **Campos Dinâmicos:** Construtor de formulários integrados para anamnese.
* **Extensão Odontologia:** Odontograma interativo e visual (marcação de dentes, procedimentos por dente, evolução gráfica).
* **Extensão Estética:** Mapa corporal e facial interativo para marcação de procedimentos injetáveis (toxina botulínica, preenchedores) com upload e comparação de fotos (Antes/Depois).
* **Certificação Digital e Prescrição:** Integração Nativa via API com serviços de prescrição eletrônica (ex: Memed) e suporte a assinatura digital ICP-Brasil.

### Módulo 4: Financeiro e Faturamento Avançado
A ferramenta para retenção e gestão do negócio do cliente.
* **Controle de Orçamentos e Planos de Tratamento:** Criação de propostas de tratamento complexas (comum em odontologia e estética), com aprovação formal do paciente.
* **Regras de Repasse (Comissões):** Motor de cálculo automatizado para comissionamento dos profissionais (por porcentagem, valor fixo, pago no faturamento ou pago na quitação).
* **Faturamento de Convênios (Padrão TISS):** Geração de guias e lotes XML para clínicas médicas/gerais que atendem planos de saúde.

### Módulo 5: Comunicação e CRM Automatizado
Redução drástica do *No-Show* (absenteísmo) e engajamento.
* **Confirmação Automatizada via WhatsApp:** Integração oficial com API do WhatsApp (Meta) para envio de lembretes e atualização automática do status da agenda baseado na resposta do paciente.
* **Régua de Pós-Procedimento:** Disparos automáticos com orientações pós-consulta ou lembretes de retorno (ex: "Sua limpeza semestral está vencendo").

---

## 3. Painel do Super Administrador (SaaS Vendor Dashboard)
O painel que **você** (o dono do software) usará para gerenciar o ecossistema.

* **Gestão de Assinaturas e Planos:** Criação de planos (ex: Basic, Pro, Premium) limitando recursos por plano (número de profissionais cadastrados, espaço de armazenamento de imagens, uso de WhatsApp).
* **Provisionamento Automatizado:** Criação instantânea de uma nova instância (Tenant) assim que o pagamento do plano é confirmado.
* **Métricas de Negócio (SaaS Metrics):** Acompanhamento em tempo real de MRR (Receita Recorrente Mensal), Churn Rate (Taxa de Cancelamento) e LTV (Lifetime Value).

---

## 4. Requisitos para Escalabilidade Técnica

1.  **APIs RESTful / GraphQL:** Separação total entre o Backend (Node.js/Python/C#) e o Frontend (React/Vue/Next.js) para permitir o desenvolvimento de futuros aplicativos móveis utilizando a mesma base.
2.  **Armazenamento em Nuvem Isolado:** Upload de fotos (essencial para estética) e documentos médicos direcionados para pastas ou buckets isolados por Tenant (ex: AWS S3 ou Google Cloud Storage) com links assinados e temporários.
3.  **Workers Independentes:** Filas de processamento assíncronas (ex: Redis + BullMQ) para disparo de mensagens de WhatsApp e e-mails, garantindo que o alto volume de uma clínica não trave a navegação das outras.
