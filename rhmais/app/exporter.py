"""Exportação para Excel e relatório HTML (pronto para imprimir/salvar em PDF)."""
from __future__ import annotations

import html
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from .config import APP_NAME, EXPORT_DIR, SETTINGS
from .matcher import classificar
from .models import Candidato, Vaga


def _nome_arquivo(prefixo: str, ext: str) -> Path:
    return EXPORT_DIR / f"{prefixo}_{datetime.now():%Y%m%d_%H%M%S}.{ext}"


def exportar_excel(vagas: list[Vaga], candidato: Candidato | None = None) -> Path:
    wb = Workbook()
    ws = wb.active
    ws.title = "Vagas compatíveis"
    cab = ["Score", "Compatibilidade", "Cargo", "Empresa", "Local", "Modalidade", "Nível", "Contrato",
           "Salário", "Skills que batem", "Skills a desenvolver", "Fonte", "Publicada", "Link"]
    ws.append(cab)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="4F46E5")
        c.alignment = Alignment(vertical="center")
    cores = {"Excelente": "D1FAE5", "Alta": "E0E7FF", "Média": "FEF3C7", "Baixa": "F3F4F6"}
    for v in vagas:
        faixa = classificar(v.score)
        ws.append([v.score, faixa, v.titulo, v.empresa, v.local, v.modalidade, v.senioridade, v.contrato,
                   v.salario, ", ".join(v.detalhes_score.get("skills_ok", [])),
                   ", ".join(v.detalhes_score.get("skills_faltam", [])), v.fonte, v.publicada_em, v.url])
        linha = ws.max_row
        ws.cell(linha, 2).fill = PatternFill("solid", fgColor=cores[faixa])
        link = ws.cell(linha, 14)
        link.hyperlink = v.url
        link.value = "Abrir vaga"
        link.font = Font(color="4F46E5", underline="single")
    larguras = [8, 15, 45, 28, 22, 13, 12, 12, 16, 35, 35, 18, 12, 12]
    for i, w in enumerate(larguras, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    if candidato:
        p = wb.create_sheet("Candidato")
        for k, v in [("Nome", candidato.nome), ("Cargo desejado", candidato.cargo_desejado),
                     ("Cargos alternativos", candidato.cargos_alternativos), ("Skills", candidato.skills),
                     ("Senioridade", candidato.senioridade), ("Cidade/UF", f"{candidato.cidade}/{candidato.uf}"),
                     ("Modalidades", candidato.modalidades), ("Pretensão", candidato.pretensao_salarial),
                     ("Gerado em", datetime.now().strftime("%d/%m/%Y %H:%M"))]:
            p.append([k, v])
            p.cell(p.max_row, 1).font = Font(bold=True)
        p.column_dimensions["A"].width = 22
        p.column_dimensions["B"].width = 70
    destino = _nome_arquivo(f"vagas_{(candidato.nome if candidato else 'busca').split(' ')[0].lower()}", "xlsx")
    wb.save(destino)
    return destino


def relatorio_html(vagas: list[Vaga], candidato: Candidato, limite: int = 25) -> Path:
    e = html.escape
    empresa = e(SETTINGS.get("empresa_nome", APP_NAME))
    linhas = []
    for v in vagas[:limite]:
        d = v.detalhes_score
        faixa = classificar(v.score)
        ok = "".join(f'<span class="tag ok">{e(s)}</span>' for s in d.get("skills_ok", []))
        falta = "".join(f'<span class="tag gap">{e(s)}</span>' for s in d.get("skills_faltam", [])[:5])
        linhas.append(f"""
        <article class="vaga">
          <div class="score s-{faixa.lower()}"><b>{v.score:.0f}</b><small>{faixa}</small></div>
          <div class="info">
            <h3><a href="{e(v.url)}">{e(v.titulo)}</a></h3>
            <p class="meta">{e(v.empresa or 'Empresa confidencial')} · {e(v.local)} · {e(v.modalidade or 'Modalidade n/i')}
              {(' · ' + e(v.contrato)) if v.contrato else ''}{(' · ' + e(v.salario)) if v.salario else ''} · via {e(v.fonte)}</p>
            <p class="why">{e(d.get('cargo', ''))} · {e(d.get('local', ''))} · {e(d.get('senioridade', ''))}</p>
            <div>{ok}{falta}</div>
          </div>
        </article>""")
    total = len(vagas)
    excelentes = sum(1 for v in vagas if v.score >= 75)
    altas = sum(1 for v in vagas if 60 <= v.score < 75)
    doc = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório de vagas – {e(candidato.nome)}</title>
<style>
 body{{font-family:Segoe UI,Arial,sans-serif;background:#F4F6FB;color:#141A2E;margin:0;padding:32px}}
 .wrap{{max-width:960px;margin:auto}} header{{background:#111633;color:#fff;border-radius:16px;padding:28px 32px}}
 header h1{{margin:0 0 4px;font-size:26px}} header p{{margin:0;opacity:.8}}
 .kpis{{display:flex;gap:12px;margin:18px 0}} .kpi{{flex:1;background:#fff;border:1px solid #E3E7F0;border-radius:12px;padding:14px 18px}}
 .kpi b{{font-size:26px;display:block}} .kpi span{{color:#5B6478;font-size:13px}}
 .perfil{{background:#fff;border:1px solid #E3E7F0;border-radius:12px;padding:16px 20px;margin-bottom:18px;font-size:14px;line-height:1.6}}
 .vaga{{display:flex;gap:16px;background:#fff;border:1px solid #E3E7F0;border-radius:12px;padding:16px;margin-bottom:10px;page-break-inside:avoid}}
 .score{{min-width:70px;height:70px;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff}}
 .score b{{font-size:24px}} .score small{{font-size:11px}}
 .s-excelente{{background:#0E9F6E}} .s-alta{{background:#4F46E5}} .s-média{{background:#D97706}} .s-baixa{{background:#9AA3BA}}
 h3{{margin:0 0 4px;font-size:16px}} h3 a{{color:#141A2E;text-decoration:none}} .meta{{margin:0;color:#5B6478;font-size:13px}}
 .why{{margin:6px 0;font-size:12px;color:#5B6478}} .tag{{display:inline-block;font-size:11px;padding:2px 8px;border-radius:6px;margin:2px 4px 0 0}}
 .ok{{background:#E3F7EF;color:#0E7A55}} .gap{{background:#FDF1DE;color:#A35A00}}
 footer{{text-align:center;color:#9AA3BA;font-size:12px;margin-top:24px}}
 @media print{{body{{background:#fff;padding:0}}}}
</style></head><body><div class="wrap">
<header><h1>Oportunidades para {e(candidato.nome)}</h1>
<p>{e(candidato.cargo_desejado)} · {e(candidato.senioridade or '')} · {e(candidato.cidade)}/{e(candidato.uf)} — preparado por {empresa} em {datetime.now():%d/%m/%Y}</p></header>
<div class="kpis"><div class="kpi"><b>{total}</b><span>vagas selecionadas para o perfil</span></div>
<div class="kpi"><b>{excelentes}</b><span>compatibilidade excelente (75+)</span></div>
<div class="kpi"><b>{altas}</b><span>compatibilidade alta (60–74)</span></div></div>
<div class="perfil"><b>Perfil buscado:</b> {e(', '.join(candidato.cargos))}<br>
<b>Competências:</b> {e(candidato.skills)}<br><b>Modalidades aceitas:</b> {e(candidato.modalidades.replace(',', ', '))}</div>
{''.join(linhas)}
<footer>Gerado pelo {APP_NAME} · Os links levam ao anúncio original de cada portal.</footer>
</div></body></html>"""
    destino = _nome_arquivo(f"relatorio_{candidato.nome.split(' ')[0].lower()}", "html")
    destino.write_text(doc, encoding="utf-8")
    return destino


def exportar_pipeline_excel(itens: list[dict]) -> Path:
    wb = Workbook()
    ws = wb.active
    ws.title = "Pipeline"
    cab = ["Candidato", "Vaga", "Empresa", "Local", "Modalidade", "Score", "Status", "Notas", "Atualizado", "Fonte", "Link"]
    ws.append(cab)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="4F46E5")
    for it in itens:
        local = " / ".join(p for p in (it["cidade"], it["uf"]) if p) or ("Remoto" if it["modalidade"] == "Remoto" else "")
        ws.append([it["candidato"], it["titulo"], it["empresa"], local, it["modalidade"], it["score"], it["status"],
                   it["notas"], it["atualizado_em"], it["fonte"], it["url"]])
    for i, w in enumerate([24, 42, 26, 20, 12, 8, 18, 40, 16, 18, 50], 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    destino = _nome_arquivo("pipeline", "xlsx")
    wb.save(destino)
    return destino
