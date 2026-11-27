# Login com Microsoft e app no celular

## 1. Registrar o app na Microsoft (uma vez)
1. Entre em https://portal.azure.com com a sua conta Microsoft → **Microsoft Entra ID** → **Registros de aplicativo** → **Novo registro**.
2. Nome: `Marmita Control`.
3. Tipos de conta: **Contas em qualquer diretório organizacional e contas pessoais da Microsoft** (permite Outlook/Hotmail).
4. URI de redirecionamento: tipo **Web**, endereço:
   `https://ckfiknmdcoiihlifourc.supabase.co/auth/v1/callback`
5. Clique em **Registrar** e copie o **ID do aplicativo (cliente)**.
6. **Certificados e segredos** → **Novo segredo do cliente** → copie o **Valor** (não o "ID do segredo"). Ele só aparece uma vez.
7. **Configuração de token** → **Adicionar declaração opcional** → tipo **ID** → marque **email** → Adicionar (aceite a permissão do Microsoft Graph se perguntar).

## 2. Ligar a Microsoft no Supabase
Projeto no Supabase → **Authentication**:
1. **Sign In / Providers** → **Azure** → ative, cole o **Client ID** e o **Secret** (Valor do passo 6). Deixe *Azure Tenant URL* em branco. Salve.
2. Ainda em **Sign In / Providers**, nas configurações gerais de usuários:
   - **Allow new users to sign up: DESLIGADO.** Importante: com isso ligado, qualquer pessoa com conta Microsoft conseguiria criar um acesso ao painel. A loja online não usa contas, então não é afetada.
   - **Allow manual linking: LIGADO** (necessário para conectar sua conta Microsoft à sua conta do painel).
3. **URL Configuration**:
   - **Site URL**: o endereço do painel publicado (ex.: `https://hfa90.github.io/portfolio/marmitaria/`).
   - **Redirect URLs**: o mesmo endereço terminado em `**` (ex.: `https://hfa90.github.io/portfolio/marmitaria/**`).

## 3. Conectar sua conta (no painel)
1. Entre com e-mail e senha.
2. **Ajustes → Sua conta → Conectar conta Microsoft** e entre na Microsoft.
3. Pronto: a partir daí use **Entrar com a Microsoft** no login.

## Trocar a senha
**Ajustes → Sua conta → Verificar com a Microsoft e trocar senha.** Depois de entrar na Microsoft você tem 5 minutos para escolher a nova senha. Não pede a senha atual.
O "Esqueci minha senha" por e-mail continua existindo como plano B.

## Instalar no celular (PWA)
- **iPhone:** abra o painel no **Safari** → **Compartilhar** → **Adicionar à Tela de Início**.
- **Android:** abra no **Chrome** → menu ⋮ → **Instalar app**.

Instalado, abre em tela cheia, sem barra do navegador e com o ícone da marmita.
No celular: puxe a tela para baixo para atualizar; arraste as janelas para baixo para fechar.
Os dados vêm sempre ao vivo do Supabase (precisa de internet); o app em si abre mesmo sem sinal.
