# Código do Microsoft Authenticator e app no celular

A entrada no painel agora tem duas etapas:
1. e-mail e senha;
2. o código de 6 números do app **Microsoft Authenticator** (muda a cada 30 segundos).

Não é preciso ter conta Microsoft nem configurar nada no Azure.

## Ligar (uma vez)
1. No celular, instale o **Microsoft Authenticator** (App Store / Google Play).
2. Entre no painel com e-mail e senha → **Ajustes → Sua conta → Ativar com o Microsoft Authenticator**.
3. No Authenticator: **+** → **Outra conta (Google, Facebook etc.)**.
   - Painel aberto no computador: aponte a câmera para o QR code.
   - Painel aberto no mesmo celular: toque em **Copiar chave** no painel; no Authenticator escolha
     **Ou insira o código manualmente**, nome da conta `Marmita Control` e cole a chave.
4. Digite no painel o código de 6 números que apareceu. Pronto: a partir daí toda entrada pede o código.

No Supabase isso já vem ligado. Se aparecer "verificação desligada no Supabase", confira em
**Authentication → Multi-Factor → TOTP: Enabled**.

## Trocar a senha
**Ajustes → Sua conta → Trocar senha**: digite o código do Authenticator (não pede a senha atual)
e escolha a nova senha em até 5 minutos.

## Esqueci minha senha
O link que chega por e-mail abre a tela de nova senha, que também pede o código do Authenticator.
Assim, quem tiver acesso só ao seu e-mail não consegue trocar a senha.

## Se perder o celular
Sem o Authenticator não dá para entrar. Para liberar, no Supabase:
**Authentication → Users → seu usuário → MFA factors → apagar o fator**. A entrada volta a pedir só e-mail e senha;
depois ative de novo com o celular novo.
Dica: no Authenticator, ligue o **backup na nuvem** (Configurações → Backup) para recuperar as contas num celular novo.

## Se você chegou a configurar o login com conta Microsoft
Não é mais usado. Pode desligar em Supabase → **Authentication → Sign In / Providers → Azure** (opcional).

## Instalar no celular (PWA)
- **iPhone:** abra o painel no **Safari** → **Compartilhar** → **Adicionar à Tela de Início**.
- **Android:** abra no **Chrome** → menu ⋮ → **Instalar app**.

Instalado, abre em tela cheia com o ícone da marmita. Puxe a tela para baixo para atualizar;
arraste as janelas para baixo para fechar. Os dados vêm sempre ao vivo (precisa de internet).
