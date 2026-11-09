"""Configurações: canais, chaves de API e preferências."""
from __future__ import annotations

import threading
import webbrowser

import customtkinter as ctk

from ..config import SETTINGS, save_settings
from ..sources import FONTES, Filtros
from . import theme as T


class PaginaConfig(ctk.CTkFrame):
    def __init__(self, master, app):
        super().__init__(master, fg_color="transparent")
        self.app = app
        topo = ctk.CTkFrame(self, fg_color="transparent")
        topo.pack(fill="x", padx=28, pady=(24, 12))
        T.titulo_pagina(topo, "Canais & Configurações", "Escolha onde buscar e ajuste o sistema").pack(side="left")
        T.botao(topo, "Salvar configurações", self.salvar).pack(side="right")

        sc = ctk.CTkScrollableFrame(self, fg_color="transparent")
        sc.pack(fill="both", expand=True, padx=20, pady=(0, 16))

        # Canais
        card = T.Card(sc)
        card.pack(fill="x", padx=8, pady=(0, 12))
        cab = ctk.CTkFrame(card, fg_color="transparent")
        cab.pack(fill="x", padx=18, pady=(16, 8))
        ctk.CTkLabel(cab, text="Canais de vagas integrados", font=T.fonte(15, "bold"), text_color=T.TEXTO).pack(side="left")
        self.btn_testar = T.botao(cab, "Testar conexões", self.testar, "secundario", height=30)
        self.btn_testar.pack(side="right")
        self.switches: dict[str, ctk.CTkSwitch] = {}
        self.status_lbl: dict[str, ctk.CTkLabel] = {}
        for fid, cls in FONTES.items():
            linha = ctk.CTkFrame(card, fg_color=T.CINZA_SUAVE, corner_radius=10)
            linha.pack(fill="x", padx=18, pady=4)
            sw = ctk.CTkSwitch(linha, text="", width=46, **T.SWITCH)
            sw.pack(side="left", padx=(12, 4), pady=10)
            if fid in SETTINGS.get("fontes_ativas", []):
                sw.select()
            self.switches[fid] = sw
            txt = ctk.CTkFrame(linha, fg_color="transparent")
            txt.pack(side="left", fill="x", expand=True, pady=8)
            ctk.CTkLabel(txt, text=cls.nome, font=T.fonte(13, "bold"), text_color=T.TEXTO).pack(anchor="w")
            ctk.CTkLabel(txt, text=cls.descricao, font=T.fonte(11), text_color=T.TEXTO_2).pack(anchor="w")
            T.chip(linha, cls.cobertura, T.CARD, T.TEXTO_2).pack(side="right", padx=10)
            lbl = ctk.CTkLabel(linha, text="", font=T.fonte(11, "bold"), width=110)
            lbl.pack(side="right")
            self.status_lbl[fid] = lbl

        # Chaves
        card = T.Card(sc)
        card.pack(fill="x", padx=8, pady=(0, 12))
        ctk.CTkLabel(card, text="Chaves de API (opcionais, gratuitas) — ampliam a cobertura",
                     font=T.fonte(15, "bold"), text_color=T.TEXTO).pack(anchor="w", padx=18, pady=(16, 4))
        ctk.CTkLabel(card, text="Adzuna e Jooble agregam vagas de centenas de sites brasileiros. "
                                "O token do GitHub aumenta o limite de consultas às comunidades.",
                     font=T.fonte(12), text_color=T.TEXTO_2, wraplength=900, justify="left").pack(anchor="w", padx=18)
        grade = ctk.CTkFrame(card, fg_color="transparent")
        grade.pack(fill="x", padx=12, pady=(8, 16))
        grade.grid_columnconfigure((0, 1), weight=1)
        self.chaves = {}
        itens = [("adzuna_app_id", "Adzuna – App ID", "https://developer.adzuna.com/signup"),
                 ("adzuna_app_key", "Adzuna – App Key", "https://developer.adzuna.com/signup"),
                 ("jooble_key", "Jooble – API Key", "https://br.jooble.org/api/about"),
                 ("github_token", "GitHub – token pessoal", "https://github.com/settings/tokens")]
        for i, (k, rot, url) in enumerate(itens):
            box = ctk.CTkFrame(grade, fg_color="transparent")
            box.grid(row=i // 2, column=i % 2, sticky="ew", padx=6, pady=6)
            l = ctk.CTkFrame(box, fg_color="transparent")
            l.pack(fill="x")
            ctk.CTkLabel(l, text=rot, font=T.fonte(12, "bold"), text_color=T.TEXTO_2).pack(side="left")
            ctk.CTkButton(l, text="obter chave ↗", width=80, height=20, fg_color="transparent", text_color=T.PRIMARIA,
                          hover_color=T.PRIMARIA_SUAVE, font=T.fonte(11), command=lambda u=url: webbrowser.open(u)
                          ).pack(side="right")
            e = ctk.CTkEntry(box, height=36, corner_radius=9, border_color=T.BORDA, show="•", font=T.fonte(13))
            e.insert(0, SETTINGS.get(k, ""))
            e.pack(fill="x", pady=(3, 0))
            self.chaves[k] = e

        # Preferências
        card = T.Card(sc)
        card.pack(fill="x", padx=8)
        ctk.CTkLabel(card, text="Preferências", font=T.fonte(15, "bold"), text_color=T.TEXTO).pack(anchor="w", padx=18, pady=(16, 4))
        grade = ctk.CTkFrame(card, fg_color="transparent")
        grade.pack(fill="x", padx=12, pady=(4, 16))
        grade.grid_columnconfigure((0, 1, 2, 3), weight=1)

        def campo(col, rotulo, widget):
            box = ctk.CTkFrame(grade, fg_color="transparent")
            box.grid(row=0, column=col, sticky="ew", padx=6)
            ctk.CTkLabel(box, text=rotulo, font=T.fonte(12, "bold"), text_color=T.TEXTO_2).pack(anchor="w")
            w = widget(box)
            w.pack(fill="x", pady=(3, 0))
            return w

        self.empresa = campo(0, "Nome da consultoria (aparece nos relatórios)",
                             lambda b: ctk.CTkEntry(b, height=36, corner_radius=9, border_color=T.BORDA, font=T.fonte(13)))
        self.empresa.insert(0, SETTINGS.get("empresa_nome", ""))
        self.aparencia = campo(1, "Tema", lambda b: ctk.CTkSegmentedButton(
            b, values=["Claro", "Escuro"], **T.SEGMENTADO,
            font=T.fonte(12)))
        self.aparencia.set("Escuro" if SETTINGS.get("aparencia") == "dark" else "Claro")
        self.paginas = campo(2, "Páginas lidas por canal", lambda b: ctk.CTkSegmentedButton(
            b, values=["1", "2", "3", "5"], **T.SEGMENTADO,
            font=T.fonte(12)))
        self.paginas.set(str(SETTINGS.get("paginas_por_fonte", 2)))
        self.score = campo(3, "Score mínimo padrão", lambda b: ctk.CTkSegmentedButton(
            b, values=["30", "40", "50", "60"], **T.SEGMENTADO,
            font=T.fonte(12)))
        self.score.set(str(SETTINGS.get("score_minimo_padrao", 40)))

    def ao_mostrar(self):
        pass

    def salvar(self):
        SETTINGS["fontes_ativas"] = [fid for fid, sw in self.switches.items() if sw.get()]
        for k, e in self.chaves.items():
            SETTINGS[k] = e.get().strip()
        SETTINGS["empresa_nome"] = self.empresa.get().strip()
        SETTINGS["paginas_por_fonte"] = int(self.paginas.get())
        SETTINGS["score_minimo_padrao"] = int(self.score.get())
        novo_tema = "dark" if self.aparencia.get() == "Escuro" else "light"
        mudou = novo_tema != SETTINGS.get("aparencia")
        SETTINGS["aparencia"] = novo_tema
        save_settings(SETTINGS)
        self.app.notificar("Configurações salvas." + (" Reinicie para aplicar o tema." if mudou else ""))

    def testar(self):
        self.btn_testar.configure(state="disabled", text="Testando…")
        for lbl in self.status_lbl.values():
            lbl.configure(text="…", text_color=T.TEXTO_2)

        def rodar(fid, cls):
            f = cls()
            if not f.disponivel():
                txt, c = "sem chave", T.TEXTO_2
            else:
                try:
                    n = len(f.buscar(Filtros(termo="analista", paginas=1, skills=["Python"])))
                    txt, c = f"✓ online · {n}", T.VERDE
                except Exception:  # noqa: BLE001
                    txt, c = "✕ indisponível", T.LARANJA
            self.after(0, lambda: self.status_lbl[fid].configure(text=txt, text_color=c))

        threads = [threading.Thread(target=rodar, args=(fid, cls), daemon=True) for fid, cls in FONTES.items()]
        for t in threads:
            t.start()

        def fim():
            if any(t.is_alive() for t in threads):
                return self.after(300, fim)
            self.btn_testar.configure(state="normal", text="Testar conexões")
        fim()
