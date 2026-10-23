# Prospecta · Robô na nuvem (opção 3)
# Imagem oficial do Playwright já traz o Chromium e as dependências do sistema.
FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./

ENV PYTHONUNBUFFERED=1 \
    PROSPECTA_HOST=nuvem
# Variáveis obrigatórias no serviço:  SUPABASE_URL  e  SUPABASE_SERVICE_ROLE_KEY
CMD ["python", "robo.py"]
