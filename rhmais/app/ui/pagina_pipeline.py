"""Acompanhamento das vagas indicadas para cada candidato."""
from __future__ import annotations

import webbrowser
from tkinter import messagebox

import customtkinter as ctk

from .. import exporter
from ..models import STATUS_PIPELINE
from . import theme as T

COR_STATUS = {
    "Sugerida": (T.CINZA_SUAVE, T.TEXTO_2), "Enviada ao candidato": (T.PRIMARIA_SUAVE, T.PRIMARIA),
    "Candidatura feita": (T.PRIMARIA_SUAVE, T.PRIMARIA), "Entrevista": (T.LARANJA_SUAVE, T.LARANJA),
    "Proposta": (T.LARANJA_SUAVE, T.LARANJA), "Contratado": (T.VERDE_SUAVE, T.VERDE),
    "Descartada": (("#FDECEC", "#3A1A1A"), T.VERMELHO),
}


CURTO = {"Enviada ao candidato": "Enviada", "Candidatura feita": "Candidatura"}


def _data_curta(valor: str) -> str:
    try:
        a, m, d = valor[:10].split("-")
        return f"{d}/{m} {valor[11:16]}"
    except ValueError:
        return valor


class PaginaPipeline(ctk.CTkFrame):
    def __init__(self, master, app):
        super().__init__(master, fg_color="transparent")
        self.app = app
        self.itens: list[dict] = []
        self.filtro_status: str | None = None

        topo = ctk.CTkFrame(self, fg_color="transparent")
        topo.pack(fill="x", padx=28, pady=(24, 12))
        T.titulo_pagina(topo, "Pipeline", "Acompanhe cada indicação até a contratação").pack(side="left")
        T.botao(topo, "Exportar Excel", self.exportar, "neutro").pack(side="right")
        self.sel_cand = ctk.CTkOptionMenu(topo, values=["Todos os candidatos"], width=230, height=36, corner_radius=9,
                                          fg_color=T.CINZA_SUAVE, button_color=T.BORDA, text_color=T.TEXTO,
                                          button_hover_color=T.PRIMARIA_SUAVE, font=T.fonte(13),
                                          command=lambda _: self.carregar())
        self.sel_cand.pack(side="right", padx=10)

        self.funil = ctk.CTkFrame(self, fg_color="transparent")
        self.funil.pack(fill="x", padx=28)

        corpo = ctk.CTkFrame(self, fg_color="transparent")
        corpo.pack(fill="both", expand=True, padx=28, pady=14)
        corpo.grid_columnconfigure(0, weight=1)
        corpo.grid_columnconfigure(1, weight=0, minsize=360)
        corpo.grid_rowconfigure(0, weight=1)

        card = T.Card(corpo)
        card.grid(row=0, column=0, sticky="nsew", padx=(0, 12))
        self.tv = T.tabela(card, [
            ("candidato", "CANDIDATO", 140, "w"), ("titulo", "VAGA", 240, "w"), ("empresa", "EMPRESA", 135, "w"),
            ("score", "SCORE", 76, "center"), ("status", "ETAPA", 140, "w"), ("data", "ATUALIZADO", 118, "center")],
            altura=16)
        self.tv.moldura.pack(fill="both", expand=True, padx=14, pady=14)
        self.tv.bind("<<TreeviewSelect>>", self._detalhar)
        self.tv.bind("<Double-1>", lambda e: self._abrir())

        self.det = T.Card(corpo, width=360)
        self.det.grid(row=0, column=1, sticky="nsew")
        self.det.pack_propagate(False)
        self._vazio()

    def ao_mostrar(self):
        cands = self.app.db.candidatos()
        self.mapa = {"Todos os candidatos": None, **{c.nome: c.id for c in cands}}
        self.sel_cand.configure(values=list(self.mapa))
        if self.sel_cand.get() not in self.mapa:
            self.sel_cand.set("Todos os candidatos")
        self.carregar()

    def carregar(self):
        cid = self.mapa.get(self.sel_cand.get()) if hasattr(self, "mapa") else None
        todos = self.app.db.pipeline(cid)
        # funil clicável
        for w in self.funil.winfo_children():
            w.destroy()
        cont = {s: 0 for s in STATUS_PIPELINE}
        for it in todos:
            cont[it["status"]] = cont.get(it["status"], 0) + 1
        for s in [None, *STATUS_PIPELINE]:
            n = len(todos) if s is None else cont.get(s, 0)
            ativo = self.filtro_status == s
            fg, tc = (T.PRIMARIA, "#FFFFFF") if ativo else COR_STATUS.get(s, (T.CARD, T.TEXTO))
            ctk.CTkButton(self.funil, text=f"{CURTO.get(s, s) or 'Todas'}  {n}", fg_color=fg, text_color=tc, hover_color=T.BORDA,
                          corner_radius=16, height=30, font=T.fonte(12, "bold"),
                          border_width=1, border_color=T.BORDA,
                          command=lambda x=s: self._filtrar(x)).pack(side="left", padx=(0, 6))
        self.itens = [it for it in todos if not self.filtro_status or it["status"] == self.filtro_status]
        self.tv.delete(*self.tv.get_children())
        for i, it in enumerate(self.itens):
            self.tv.insert("", "end", iid=str(i), tags=("par" if i % 2 == 0 else "impar",), values=(
                it["candidato"], it["titulo"], it["empresa"] or "—", f"{it['score']:.0f}", it["status"],
                _data_curta(it["atualizado_em"])))
        self._vazio()

    def _filtrar(self, s):
        self.filtro_status = s
        self.carregar()

    def _vazio(self):
        for w in self.det.winfo_children():
            w.destroy()
        ctk.CTkLabel(self.det, text="📋", font=T.fonte(38)).pack(pady=(80, 6))
        ctk.CTkLabel(self.det, text="Selecione uma indicação", font=T.fonte(15, "bold"), text_color=T.TEXTO).pack()
        ctk.CTkLabel(self.det, text="para mover de etapa e registrar notas.", font=T.fonte(12),
                     text_color=T.TEXTO_2).pack()

    def _sel(self):
        s = self.tv.selection()
        return self.itens[int(s[0])] if s else None

    def _detalhar(self, _=None):
        it = self._sel()
        if not it:
            return
        for w in self.det.winfo_children():
            w.destroy()
        pad = dict(padx=18, anchor="w")
        ctk.CTkLabel(self.det, text=it["titulo"], font=T.fonte(15, "bold"), text_color=T.TEXTO, wraplength=320,
                     justify="left").pack(pady=(18, 2), **pad)
        local = " / ".join(p for p in (it["cidade"], it["uf"]) if p) or it["modalidade"] or ""
        ctk.CTkLabel(self.det, text=f"{it['empresa'] or 'Empresa não divulgada'} · {local}", font=T.fonte(12),
                     text_color=T.TEXTO_2, wraplength=320, justify="left").pack(**pad)
        ctk.CTkLabel(self.det, text=f"Candidato: {it['candidato']}\nScore {it['score']:.0f} · via {it['fonte']}",
                     font=T.fonte(12), text_color=T.TEXTO_2, wraplength=320, justify="left").pack(pady=(2, 12), **pad)
        ctk.CTkLabel(self.det, text="Etapa", font=T.fonte(12, "bold"), text_color=T.TEXTO_2).pack(**pad)
        self.op_status = ctk.CTkOptionMenu(self.det, values=STATUS_PIPELINE, height=36, corner_radius=9,
                                           fg_color=T.CINZA_SUAVE, button_color=T.BORDA, text_color=T.TEXTO,
                                           button_hover_color=T.PRIMARIA_SUAVE, font=T.fonte(13))
        self.op_status.set(it["status"])
        self.op_status.pack(fill="x", padx=18, pady=(3, 10))
        ctk.CTkLabel(self.det, text="Notas do recrutador", font=T.fonte(12, "bold"), text_color=T.TEXTO_2).pack(**pad)
        self.notas = ctk.CTkTextbox(self.det, height=150, corner_radius=9, border_width=1, border_color=T.BORDA,
                                    font=T.fonte(12))
        self.notas.insert("1.0", it["notas"] or "")
        self.notas.pack(fill="x", padx=18, pady=(3, 10))
        T.botao(self.det, "Salvar alterações", self._salvar).pack(fill="x", padx=18, pady=(0, 6))
        T.botao(self.det, "Abrir anúncio ↗", self._abrir, "neutro").pack(fill="x", padx=18, pady=(0, 6))
        T.botao(self.det, "Remover do pipeline", self._remover, "perigo").pack(fill="x", padx=18)

    def _salvar(self):
        it = self._sel()
        if it:
            self.app.db.atualizar_pipeline(it["id"], self.op_status.get(), self.notas.get("1.0", "end").strip())
            self.app.notificar("Pipeline atualizado.")
            self.carregar()

    def _abrir(self):
        it = self._sel()
        if it:
            webbrowser.open(it["url"])

    def _remover(self):
        it = self._sel()
        if it and messagebox.askyesno("Remover", "Remover esta indicação do pipeline?"):
            self.app.db.remover_pipeline(it["id"])
            self.carregar()

    def exportar(self):
        if not self.itens:
            return messagebox.showinfo("Exportar", "Nada para exportar ainda.")
        self.app.abrir_arquivo(exporter.exportar_pipeline_excel(self.itens))
