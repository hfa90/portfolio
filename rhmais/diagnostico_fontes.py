"""Diagnóstico rápido: testa cada canal de vagas e mostra quantas vagas retornaram.

Uso:  python diagnostico_fontes.py "analista de rh"
"""
import sys
import time

from app.sources import FONTES, Filtros

termo = " ".join(sys.argv[1:]) or "analista"
print(f"Testando canais com o termo: {termo}\n")
for fid, cls in FONTES.items():
    fonte = cls()
    if not fonte.disponivel():
        print(f"  {cls.nome:24} — sem chave de API (configure em Canais & Config.)")
        continue
    inicio = time.time()
    try:
        vagas = fonte.buscar(Filtros(termo=termo, paginas=1, skills=["Python"]))
        exemplo = f"  ex.: {vagas[0].titulo[:45]} · {vagas[0].local}" if vagas else ""
        print(f"  {cls.nome:24} OK   {len(vagas):3} vagas  {time.time() - inicio:4.1f}s{exemplo}")
    except Exception as e:  # noqa: BLE001
        print(f"  {cls.nome:24} ERRO {e}")
