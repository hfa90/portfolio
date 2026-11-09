"""Janela principal com navegação lateral."""
from __future__ import annotations

import os
import subprocess
import sys

import customtkinter as ctk

from ..config import APP_NAME, APP_VERSION, SETTINGS
from ..database import Database
from ..models import Candidato
from . import theme as T
from .pagina_busca import PaginaBusca
from .pagina_candidatos import PaginaCandidatos
from .pagina_config import PaginaConfig
from .pagina_painel import PaginaPainel
from .pagina_pipeline import PaginaPipeline

NAV = [("painel", "◧   Painel", PaginaPainel), ("candidatos", "◉   Candidatos", PaginaCandidatos),
       ("busca", "⌕   Buscar vagas", PaginaBusca), ("pipeline", "☰   Pipeline", PaginaPipeline),
       ("config", "⚙   Canais & Config.", PaginaConfig)]

EXEMPLOS = [
    Candidato(nome="Mariana Souza (exemplo)", cargo_desejado="Analista de RH",
              cargos_alternativos="Analista de Recrutamento e Seleção, Business Partner",
              skills="Recrutamento e Seleção, Departamento Pessoal, Treinamento e Desenvolvimento, Excel, Power BI",
              senioridade="Pleno", cidade="São Paulo", uf="SP", modalidades="Presencial,Híbrido,Remoto",
              pretensao_salarial=5500, resumo="6 anos em R&S de volume e tech, experiência com indicadores de RH."),
    Candidato(nome="Rafael Lima (exemplo)", cargo_desejado="Desenvolvedor Python",
              cargos_alternativos="Desenvolvedor Back-end, Engenheiro de Dados",
              skills="Python, Django, FastAPI, SQL, Docker, AWS, Git", senioridade="Pleno",
              cidade="Belo Horizonte", uf="MG", modalidades="Remoto,Híbrido", pretensao_salarial=9000),
    Candidato(nome="Juliana Alves (exemplo)", cargo_desejado="Assistente Administrativo",
              cargos_alternativos="Auxiliar Administrativo, Recepcionista",
              skills="Administrativo, Pacote Office, Atendimento ao Cliente, Financeiro", senioridade="Júnior",
              cidade="Curitiba", uf="PR", modalidades="Presencial,Híbrido", pretensao_salarial=2600, aceita_mudanca=0),
]


class App(ctk.CTk):
    def __init__(self):
        ctk.set_appearance_mode(SETTINGS.get("aparencia", "light"))
        ctk.set_default_color_theme("blue")
        super().__init__()
        self.title(f"{APP_NAME} — Inteligência em recolocação")
        self.geometry("1440x880")
        self.minsize(1200, 720)
        self.configure(fg_color=T.BG)
        T.estilo_tabela(self)
        self.db = Database()
        if self.db.total_candidatos() == 0:
            for c in EXEMPLOS:
                self.db.salvar_candidato(c)

        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # Sidebar ----------------------------------------------------------
        side = ctk.CTkFrame(self, width=232, corner_radius=0, fg_color=T.SIDEBAR)
        side.grid(row=0, column=0, sticky="ns")
        side.grid_propagate(False)
        logo = ctk.CTkFrame(side, fg_color="transparent")
        logo.pack(fill="x", padx=22, pady=(26, 30))
        marca = ctk.CTkFrame(logo, width=38, height=38, corner_radius=10, fg_color=T.PRIMARIA)
        marca.pack(side="left")
        marca.pack_propagate(False)
        ctk.CTkLabel(marca, text="R+", font=T.fonte(15, "bold"), text_color="#FFFFFF").pack(expand=True)
        txt = ctk.CTkFrame(logo, fg_color="transparent")
        txt.pack(side="left", padx=10)
        ctk.CTkLabel(txt, text=APP_NAME, font=T.fonte(17, "bold"), text_color="#FFFFFF").pack(anchor="w")
        ctk.CTkLabel(txt, text="Match de vagas", font=T.fonte(11), text_color="#8F98C2").pack(anchor="w")

        self.botoes: dict[str, ctk.CTkButton] = {}
        for chave, rotulo, _ in NAV:
            b = ctk.CTkButton(side, text=rotulo, anchor="w", height=42, corner_radius=10, font=T.fonte(14),
                              fg_color="transparent", hover_color=T.SIDEBAR_HOVER, text_color="#C9CEE8",
                              command=lambda k=chave: self.ir_para(k))
            b.pack(fill="x", padx=14, pady=3)
            self.botoes[chave] = b
        ctk.CTkLabel(side, text=f"v{APP_VERSION}  ·  dados salvos localmente", font=T.fonte(10),
                     text_color="#6C76A6").pack(side="bottom", pady=16)

        # Páginas ------------------------------------------------------------
        self.area = ctk.CTkFrame(self, fg_color="transparent", corner_radius=0)
        self.area.grid(row=0, column=1, sticky="nsew")
        self.area.grid_rowconfigure(0, weight=1)
        self.area.grid_columnconfigure(0, weight=1)
        self.paginas = {}
        for chave, _, cls in NAV:
            p = cls(self.area, self)
            p.grid(row=0, column=0, sticky="nsew")
            self.paginas[chave] = p
        self._toast = None
        self.ir_para("painel")

    def ir_para(self, chave: str, **kw):
        for k, b in self.botoes.items():
            ativo = k == chave
            b.configure(fg_color=T.PRIMARIA if ativo else "transparent",
                        text_color="#FFFFFF" if ativo else "#C9CEE8",
                        hover_color=T.PRIMARIA_HOVER if ativo else T.SIDEBAR_HOVER)
        p = self.paginas[chave]
        p.tkraise()
        p.ao_mostrar(**kw)

    def notificar(self, texto: str):
        if self._toast:
            self._toast.destroy()
        t = ctk.CTkLabel(self, text=f"   ✓  {texto}   ", fg_color=T.SIDEBAR, text_color="#FFFFFF",
                         corner_radius=10, height=40, font=T.fonte(13, "bold"))
        t.place(relx=0.985, rely=0.975, anchor="se")
        self._toast = t
        self.after(2800, lambda: t.destroy() if t.winfo_exists() else None)

    def abrir_arquivo(self, caminho):
        self.notificar(f"Arquivo gerado: {caminho.name}")
        try:
            if sys.platform.startswith("win"):
                os.startfile(str(caminho))  # type: ignore[attr-defined]
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(caminho)])
            else:
                subprocess.Popen(["xdg-open", str(caminho)])
        except OSError:
            pass


def main():
    App().mainloop()
