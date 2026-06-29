# Confirmation Email

The public trial page sends signup metadata to Supabase Auth:

- `full_name`
- `clinic_name`
- `phone`
- `selected_plan`
- `billing_cycle`
- `trial_days`
- `source`

Configure the personalized confirmation email in Supabase:

1. Open Authentication > SMTP and configure a custom SMTP provider.
2. Open Authentication > URL Configuration.
3. Set Site URL to the production domain of the app.
4. Add every app URL used for signup/login to Redirect URLs, including the final `index.html` URL.
5. Open Authentication > Email Templates.
6. Edit the confirmation template.
7. Use the Clinicou tone and keep the confirmation link as `{{ .ConfirmationURL }}`.

Important: the default Supabase SMTP is only for testing. It can refuse customer e-mails with `Email address not authorized` and is rate-limited. Use a custom SMTP provider before sending confirmation e-mails to real clients.

Suggested subject:

```text
Confirme seu acesso ao Clinicou e comece seu trial de 30 dias
```

Suggested body:

```html
<h2>Bem-vindo ao Clinicou</h2>
<p>Recebemos o cadastro da sua clinica para testar o Clinicou por 30 dias.</p>
<p>Confirme seu e-mail para criar o ambiente da clinica e iniciar o onboarding.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar acesso ao Clinicou</a></p>
<p>Depois da confirmacao, entre no sistema e finalize a criacao da clinica.</p>
```

Do not place secrets or service role keys in the email template or browser code.
