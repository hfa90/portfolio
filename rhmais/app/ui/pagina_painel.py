"""Painel com indicadores gerais."""
from __future__ import annotations

from collections import Counter

import customtkinter as ctk

from ..config import SETTINGS
from ..models import STATUS_PIPELINE
from ..textutils import extrair_skills
from . import theme as T


class PaginaPainel(ctk.CTkFrame):
    def __init__(self, master, app):
        super().__init__(master, fg_color="transparent")
        self.app = app
        self.cabecalho = T.titulo_pagina(self, "Painel", "Visão geral da operação de recrutamento")
        self.cabecalho.pack(fill="x", padx=28, pady=(24, 14))

        kpis = ctk.CTkFrame(self, fg_color="transparent")
        kpis.pack(fill="x", padx=28)
        for i in range(4):
            kpis.grid_columnconfigure(i, weight=1, uniform="k")
        self.k_cand = T.KPI(kpis, "CANDIDATOS", "●", T.PRIMARIA)
        self.k_vagas = T.KPI(kpis, "VAGAS MAPEADAS", "◆", T.VERDE)
        self.k_pipe = T.KPI(kpis, "NO PIPELINE", "▲", T.LARANJA)
        self.k_contr = T.KPI(kpis, "CONTRATAÇÕES", "★", T.VERDE)
        for i, k in enumerate((self.k_cand, self.k_vagas, self.k_pipe, self.k_contr)):
            k.grid(row=0, column=i, sticky="nsew", padx=(0 if i == 0 else 8, 0))

        corpo = ctk.CTkFrame(self, fg_color="transparent")
        corpo.pack(fill="both", expand=True, padx=28, pady=16)
        corpo.grid_columnconfigure((0, 1), weight=1, uniform="c")
        corpo.grid_rowconfigure((0, 1), weight=1)

        self.b_status = self._bloco(corpo, 0, 0, "Funil do pipeline", T.PRIMARIA)
        self.b_fontes = self._bloco(corpo, 0, 1, "Vagas coletadas por canal", T.VERDE)
        self.b_skills = self._bloco(corpo, 1, 0, "Competências mais pedidas pelo mercado", T.LARANJA)
        card = T.Card(corpo)
        card.grid(row=1, column=1, sticky="nsew", padx=(8, 0), pady=(8, 0))
        topo = ctk.CTkFrame(card, fg_color="transparent")
        topo.pack(fill="x", padx=18, pady=(16, 6))
        ctk.CTkLabel(topo, text="Últimas buscas", font=T.fonte(15, "bold"), text_color=T.TEXTO).pack(side="left")
        T.botao(topo, "Nova busca", lambda: app.ir_para("busca"), "secundario", height=30, width=110).pack(side="right")
        self.lista_buscas = ctk.CTkFrame(card, fg_color="transparent")
        self.lista_buscas.pack(fill="both", expand=True, padx=18, pady=(0, 14))

    def _bloco(self, pai, r, c, titulo, cor_barra):
        card = T.Card(pai)
        card.grid(row=r, column=c, sticky="nsew", padx=(0 if c == 0 else 8, 0), pady=(0 if r == 0 else 8, 0))
        ctk.CTkLabel(card, text=titulo, font=T.fonte(15, "bold"), text_color=T.TEXTO).pack(anchor="w", padx=18, pady=(16, 6))
        b = T.Barras(card, cor_barra=cor_barra)
        b.pack(fill="both", expand=True, padx=18, pady=(0, 14))
        return b

    def ao_mostrar(self):
        db = self.app.db
        self.cabecalho.winfo_children()[0].configure(text=f"Olá, {SETTINGS.get('empresa_nome') or 'equipe'} 👋")
        status = db.contagem_status()
        self.k_cand.set(db.total_candidatos(), "perfis cadastrados")
        self.k_vagas.set(db.total_vagas(), "vagas salvas no banco local")
        ativos = sum(n for s, n in status.items() if s not in ("Descartada", "Contratado"))
        self.k_pipe.set(ativos, "oportunidades em andamento")
        self.k_contr.set(status.get("Contratado", 0), f"{status.get('Entrevista', 0)} em entrevista")

        self.b_status.set([(s, status.get(s, 0)) for s in STATUS_PIPELINE if status.get(s)],
                          "Adicione vagas ao pipeline a partir da busca")
        self.b_fontes.set(db.vagas_por_fonte()[:7], "Faça a primeira busca para popular este gráfico")
        cont = Counter()
        for t in db.textos_vagas(1500):
            cont.update(set(extrair_skills(t)))
        self.b_skills.set(cont.most_common(7), "Disponível após as primeiras buscas")

        for w in self.lista_buscas.winfo_children():
            w.destroy()
        buscas = db.ultimas_buscas(6)
        if not buscas:
            ctk.CTkLabel(self.lista_buscas, text="Nenhuma busca ainda. Cadastre um candidato e clique em “Buscar vagas”.",
                         font=T.fonte(12), text_color=T.TEXTO_2, wraplength=380, justify="left").pack(anchor="w")
        for b in buscas:
            linha = ctk.CTkFrame(self.lista_buscas, fg_color="transparent")
            linha.pack(fill="x", pady=4)
            ctk.CTkLabel(linha, text=b.get("nome") or "Busca livre", font=T.fonte(12, "bold"),
                         text_color=T.TEXTO).pack(side="left")
            ctk.CTkLabel(linha, text=f"  {b['termos'][:26]}…" if len(b['termos']) > 26 else f"  {b['termos']}", font=T.fonte(12), text_color=T.TEXTO_2).pack(side="left")
            T.chip(linha, f"{b['compativeis']} compatíveis", T.VERDE_SUAVE, T.VERDE).pack(side="right")
            ctk.CTkLabel(linha, text=b["criada_em"][5:] + "  ", font=T.fonte(11), text_color=T.TEXTO_2).pack(side="right")
