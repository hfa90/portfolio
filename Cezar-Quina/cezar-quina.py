import requests
import json
import csv
from datetime import datetime

def obter_quina_periodo():
    url_api = "https://loteriascaixa-api.herokuapp.com/api/quina"
    
    print("Conectando à API e buscando resultados da Quina...")
    # Timeout de 10s para não travar seu sistema caso a API demore
    response = requests.get(url_api, timeout=10) 
    
    if response.status_code != 200:
        print("Erro ao acessar a API.")
        return []

    dados_completos = response.json()
    data_inicio = datetime.strptime("01/01/2025", "%d/%m/%Y")
    data_fim = datetime.strptime("31/01/2026", "%d/%m/%Y")
    jogos_filtrados = []

    for concurso in dados_completos:
        try:
            data_sorteio = datetime.strptime(concurso['data'], '%d/%m/%Y')
        except ValueError:
            continue
            
        if data_inicio <= data_sorteio <= data_fim:
            jogos_filtrados.append({
                "concurso": concurso['concurso'],
                "data": concurso['data'],
                "dezenas": concurso['dezenas'] # Lista com as 5 dezenas
            })

    jogos_filtrados.sort(key=lambda x: datetime.strptime(x['data'], '%d/%m/%Y'), reverse=True)
    return jogos_filtrados

# ==========================================
# NOVAS FUNÇÕES PARA BAIXAR/SALVAR OS DADOS
# ==========================================

def salvar_em_json(dados, nome_arquivo="quina_2025_2026.json"):
    """ Salva os dados preservando a estrutura exata do Python """
    # O arquivo gerado terá poucos KBs de tamanho
    with open(nome_arquivo, 'w', encoding='utf-8') as arquivo:
        json.dump(dados, arquivo, ensure_ascii=False, indent=4)
    print(f"✅ Arquivo JSON salvo com sucesso: {nome_arquivo}")

def salvar_em_csv(dados, nome_arquivo="quina_2025_2026.csv"):
    """ Salva em formato tabular ultraleve, perfeito para Excel ou Pandas """
    with open(nome_arquivo, 'w', newline='', encoding='utf-8') as arquivo:
        # Transformamos a lista de dezenas em colunas individuais para o Excel
        colunas = ['concurso', 'data', 'bola_1', 'bola_2', 'bola_3', 'bola_4', 'bola_5']
        escritor = csv.DictWriter(arquivo, fieldnames=colunas)
        
        escritor.writeheader()
        for jogo in dados:
            # Garante que o jogo tem 5 dezenas para evitar erros
            if len(jogo['dezenas']) == 5:
                escritor.writerow({
                    'concurso': jogo['concurso'],
                    'data': jogo['data'],
                    'bola_1': jogo['dezenas'][0],
                    'bola_2': jogo['dezenas'][1],
                    'bola_3': jogo['dezenas'][2],
                    'bola_4': jogo['dezenas'][3],
                    'bola_5': jogo['dezenas'][4]
                })
    print(f"✅ Arquivo CSV salvo com sucesso: {nome_arquivo}")

# ==========================================
# EXECUÇÃO DO SISTEMA
# ==========================================

resultados = obter_quina_periodo()

if resultados:
    print(f"\nTotal de jogos encontrados no período: {len(resultados)}\n")
    
    # Você pode escolher rodar apenas um deles ou os dois
    salvar_em_json(resultados) 
    salvar_em_csv(resultados)
    
    print("\nProcesso finalizado. Verifique a pasta onde este script está salvo.")
else:
    print("Nenhum resultado processado.")