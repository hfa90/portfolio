"""Paleta, fontes e componentes visuais reutilizáveis."""
from __future__ import annotations

import sys
import tkinter as tk
from tkinter import ttk

import customtkinter as ctk

FAMILIA = "Segoe UI" if sys.platform.startswith("win") else ("SF Pro Text" if sys.platform == "darwin" else "DejaVu Sans")

# (claro, escuro)
BG = ("#F4F6FB", "#0E1220")
CARD = ("#FFFFFF", "#171C2E")
BORDA = ("#E3E7F0", "#262C42")
TEXTO = ("#141A2E", "#E8EBF5")
TEXTO_2 = ("#5B6478", "#9AA3BA")
PRIMARIA = ("#4F46E5", "#6D66F2")
PRIMARIA_HOVER = ("#4338CA", "#5B54E0")
PRIMARIA_SUAVE = ("#EEF0FF", "#232650")
SIDEBAR = ("#111633", "#0A0D1A")
SIDEBAR_HOVER = ("#1D2450", "#161B33")
VERDE = ("#0E9F6E", "#34D399")
VERDE_SUAVE = ("#E3F7EF", "#123329")
LARANJA = ("#D97706", "#F59E0B")
LARANJA_SUAVE = ("#FDF1DE", "#3A2A0E")
VERMELHO = ("#DC2626", "#F87171")
CINZA_SUAVE = ("#EEF1F6", "#20263A")

SEGMENTADO = dict(fg_color=CINZA_SUAVE, unselected_color=CINZA_SUAVE, unselected_hover_color=BORDA,
                  selected_color=CARD, selected_hover_color=CARD, text_color=TEXTO, corner_radius=9)
SWITCH = dict(progress_color=PRIMARIA, fg_color=BORDA, button_color=("#FFFFFF", "#E8EBF5"),
              button_hover_color=("#FFFFFF", "#FFFFFF"))

CORES_FAIXA = {"Excelente": VERDE, "Alta": PRIMARIA, "Média": LARANJA, "Baixa": TEXTO_2}


def cor(par) -> str:
    """Resolve uma tupla (claro, escuro) para o modo atual."""
    if isinstance(par, str):
        return par
    return par[1] if ctk.get_appearance_mode() == "Dark" else par[0]


def fonte(tam: int = 13, peso: str = "normal") -> ctk.CTkFont:
    return ctk.CTkFont(family=FAMILIA, size=tam, weight=peso)


def estilo_tabela(root: tk.Misc) -> None:
    st = ttk.Style(root)
    st.theme_use("clam")
    st.configure("RH.Treeview", background=cor(CARD), fieldbackground=cor(CARD), foreground=cor(TEXTO),
                 rowheight=34, borderwidth=0, font=(FAMILIA, 10))
    st.configure("RH.Treeview.Heading", background=cor(CINZA_SUAVE), foreground=cor(TEXTO_2),
                 font=(FAMILIA, 9, "bold"), borderwidth=0, relief="flat", padding=(8, 6))
    st.map("RH.Treeview", background=[("selected", cor(PRIMARIA_SUAVE))], foreground=[("selected", cor(TEXTO))])
    st.map("RH.Treeview.Heading", background=[("active", cor(BORDA))])
    st.layout("RH.Treeview", [("RH.Treeview.treearea", {"sticky": "nswe"})])
    st.configure("Vertical.TScrollbar", background=cor(CINZA_SUAVE), troughcolor=cor(CARD), borderwidth=0, arrowsize=12)


class Card(ctk.CTkFrame):
    def __init__(self, master, **kw):
        kw.setdefault("fg_color", CARD)
        kw.setdefault("corner_radius", 14)
        kw.setdefault("border_width", 1)
        kw.setdefault("border_color", BORDA)
        super().__init__(master, **kw)


def titulo_pagina(master, titulo: str, subtitulo: str = "") -> ctk.CTkFrame:
    f = ctk.CTkFrame(master, fg_color="transparent")
    ctk.CTkLabel(f, text=titulo, font=fonte(24, "bold"), text_color=TEXTO).pack(anchor="w")
    if subtitulo:
        ctk.CTkLabel(f, text=subtitulo, font=fonte(13), text_color=TEXTO_2).pack(anchor="w", pady=(2, 0))
    return f


def botao(master, texto: str, comando=None, tipo: str = "primario", **kw) -> ctk.CTkButton:
    estilos = {
        "primario": dict(fg_color=PRIMARIA, hover_color=PRIMARIA_HOVER, text_color="#FFFFFF"),
        "secundario": dict(fg_color=PRIMARIA_SUAVE, hover_color=BORDA, text_color=PRIMARIA),
        "neutro": dict(fg_color=CINZA_SUAVE, hover_color=BORDA, text_color=TEXTO),
        "perigo": dict(fg_color=("#FDECEC", "#3A1A1A"), hover_color=("#F9D5D5", "#4A2222"), text_color=VERMELHO),
        "sucesso": dict(fg_color=VERDE, hover_color=("#0B8A5F", "#22C38A"), text_color="#FFFFFF"),
    }
    kw = {**estilos[tipo], "corner_radius": 10, "height": 36, "font": fonte(13, "bold"), **kw}
    return ctk.CTkButton(master, text=texto, command=comando, **kw)


def chip(master, texto: str, fg=PRIMARIA_SUAVE, tc=PRIMARIA) -> ctk.CTkLabel:
    return ctk.CTkLabel(master, text=f"  {texto}  ", fg_color=fg, text_color=tc, corner_radius=8,
                        font=fonte(11, "bold"), height=24)


class KPI(Card):
    def __init__(self, master, rotulo: str, icone: str, cor_destaque=PRIMARIA):
        super().__init__(master)
        topo = ctk.CTkFrame(self, fg_color="transparent")
        topo.pack(fill="x", padx=18, pady=(16, 0))
        ctk.CTkLabel(topo, text=rotulo, font=fonte(12, "bold"), text_color=TEXTO_2).pack(side="left")
        ctk.CTkLabel(topo, text=icone, font=fonte(16), text_color=cor_destaque).pack(side="right")
        self.valor = ctk.CTkLabel(self, text="0", font=fonte(30, "bold"), text_color=TEXTO)
        self.valor.pack(anchor="w", padx=18)
        self.rodape = ctk.CTkLabel(self, text="", font=fonte(11), text_color=TEXTO_2)
        self.rodape.pack(anchor="w", padx=18, pady=(0, 14))

    def set(self, valor, rodape: str = ""):
        self.valor.configure(text=str(valor))
        self.rodape.configure(text=rodape)


class Barras(ctk.CTkFrame):
    """Gráfico de barras horizontais leve (sem matplotlib)."""

    def __init__(self, master, cor_barra=PRIMARIA, **kw):
        super().__init__(master, fg_color="transparent", **kw)
        self.cor_barra = cor_barra

    def set(self, dados: list[tuple[str, float]], vazio: str = "Sem dados ainda"):
        for w in self.winfo_children():
            w.destroy()
        if not dados:
            ctk.CTkLabel(self, text=vazio, font=fonte(12), text_color=TEXTO_2).pack(anchor="w", pady=8)
            return
        maximo = max(v for _, v in dados) or 1
        for rotulo, valor in dados:
            linha = ctk.CTkFrame(self, fg_color="transparent")
            linha.pack(fill="x", pady=3)
            ctk.CTkLabel(linha, text=rotulo, width=150, anchor="w", font=fonte(12), text_color=TEXTO).pack(side="left")
            barra = ctk.CTkProgressBar(linha, height=10, corner_radius=5, progress_color=self.cor_barra,
                                       fg_color=CINZA_SUAVE)
            barra.pack(side="left", fill="x", expand=True, padx=(4, 10))
            barra.set(valor / maximo)
            ctk.CTkLabel(linha, text=f"{valor:g}", width=36, anchor="e", font=fonte(12, "bold"),
                         text_color=TEXTO).pack(side="right")


def tabela(master, colunas: list[tuple[str, str, int, str]], altura: int = 12) -> ttk.Treeview:
    """colunas = [(id, título, largura, anchor)]"""
    moldura = ctk.CTkFrame(master, fg_color="transparent")
    tv = ttk.Treeview(moldura, columns=[c[0] for c in colunas], show="headings", style="RH.Treeview",
                      height=altura, selectmode="browse")
    for cid, tit, larg, anc in colunas:
        tv.heading(cid, text=tit, anchor=anc, command=lambda c=cid: _ordenar(tv, c, False))
        tv.column(cid, width=larg, minwidth=40, anchor=anc, stretch=False)
    total = sum(c[2] for c in colunas)

    def ajustar(evento):
        livre = max(200, evento.width - 18)
        for cid, _, larg, _ in colunas:
            tv.column(cid, width=int(livre * larg / total))
    moldura.bind("<Configure>", ajustar)
    sb = ttk.Scrollbar(moldura, orient="vertical", command=tv.yview)
    tv.configure(yscrollcommand=sb.set)
    tv.pack(side="left", fill="both", expand=True)
    sb.pack(side="right", fill="y")
    tv.tag_configure("par", background=cor(CARD))
    tv.tag_configure("impar", background=cor(("#F9FAFD", "#1A2034")))
    tv.moldura = moldura  # type: ignore[attr-defined]
    return tv


def _ordenar(tv: ttk.Treeview, col: str, reverso: bool):
    itens = [(tv.set(k, col), k) for k in tv.get_children("")]

    def chave(x):
        v = x[0].replace("%", "").replace(",", ".").strip()
        try:
            return (0, float(v))
        except ValueError:
            return (1, x[0].lower())
    itens.sort(key=chave, reverse=reverso)
    for i, (_, k) in enumerate(itens):
        tv.move(k, "", i)
        tv.item(k, tags=("par" if i % 2 == 0 else "impar",))
    tv.heading(col, command=lambda: _ordenar(tv, col, not reverso))
