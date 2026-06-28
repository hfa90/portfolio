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

1. Open Authentication > Email Templates.
2. Edit the confirmation template.
3. Use the Clinicou tone and point the confirmation link back to `clinicou/index.html`.

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
