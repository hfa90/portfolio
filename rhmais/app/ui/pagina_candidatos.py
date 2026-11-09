"""Cadastro de candidatos com importação de currículo."""
from __future__ import annotations

from tkinter import filedialog, messagebox

import customtkinter as ctk

from .. import resume_parser
from ..models import MODALIDADES, SENIORIDADES, UFS, Candidato
from . import theme as T


class PaginaCandidatos(ctk.CTkFrame):
    def __init__(self, master, app):
        super().__init__(master, fg_color="transparent")
        self.app = app
        self.atual: Candidato | None = None

        topo = ctk.CTkFrame(self, fg_color="transparent")
        topo.pack(fill="x", padx=28, pady=(24, 14))
        T.titulo_pagina(topo, "Candidatos", "Perfis que o sistema usa para encontrar as vagas certas").pack(side="left")
        T.botao(topo, "⬆  Importar currículo", self.importar, "secundario").pack(side="right", padx=(8, 0))
        T.botao(topo, "+  Novo candidato", self.novo).pack(side="right")

        corpo = ctk.CTkFrame(self, fg_color="transparent")
        corpo.pack(fill="both", expand=True, padx=28, pady=(0, 20))
        corpo.grid_columnconfigure(0, weight=2, uniform="c")
        corpo.grid_columnconfigure(1, weight=3, uniform="c")
        corpo.grid_rowconfigure(0, weight=1)

        # Lista ---------------------------------------------------------
        esq = T.Card(corpo)
        esq.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
        self.busca = ctk.CTkEntry(esq, placeholder_text="🔍  Buscar por nome, cargo, skill ou cidade",
                                  height=38, corner_radius=10, border_color=T.BORDA, font=T.fonte(13))
        self.busca.pack(fill="x", padx=14, pady=14)
        self.busca.bind("<KeyRelease>", lambda e: self.carregar())
        self.tv = T.tabela(esq, [("nome", "NOME", 150, "w"), ("cargo", "CARGO DESEJADO", 140, "w"),
                                 ("local", "LOCAL", 110, "w")], altura=18)
        self.tv.moldura.pack(fill="both", expand=True, padx=14, pady=(0, 14))
        self.tv.bind("<<TreeviewSelect>>", self._selecionar)
        self.tv.bind("<Double-1>", lambda e: self.buscar_vagas())

        # Formulário ------------------------------------------------------
        dir_ = T.Card(corpo)
        dir_.grid(row=0, column=1, sticky="nsew")
        cab = ctk.CTkFrame(dir_, fg_color="transparent")
        cab.pack(fill="x", padx=20, pady=(16, 4))
        self.lbl_form = ctk.CTkLabel(cab, text="Novo candidato", font=T.fonte(17, "bold"), text_color=T.TEXTO)
        self.lbl_form.pack(side="left")
        self.btn_buscar = T.botao(cab, "Buscar vagas para este perfil  →", self.buscar_vagas, "sucesso")
        self.btn_buscar.pack(side="right")

        form = ctk.CTkScrollableFrame(dir_, fg_color="transparent")
        form.pack(fill="both", expand=True, padx=8)
        form.grid_columnconfigure((0, 1), weight=1, uniform="f")
        self.campos: dict[str, ctk.CTkEntry] = {}

        def entrada(chave, rotulo, linha, col, dica="", span=1):
            box = ctk.CTkFrame(form, fg_color="transparent")
            box.grid(row=linha, column=col, columnspan=span, sticky="ew", padx=10, pady=6)
            ctk.CTkLabel(box, text=rotulo, font=T.fonte(12, "bold"), text_color=T.TEXTO_2).pack(anchor="w")
            e = ctk.CTkEntry(box, placeholder_text=dica, height=36, corner_radius=9, border_color=T.BORDA, font=T.fonte(13))
            e.pack(fill="x", pady=(3, 0))
            self.campos[chave] = e

        entrada("nome", "Nome completo *", 0, 0, "Ex.: Mariana Souza")
        entrada("email", "E-mail", 0, 1, "nome@email.com")
        entrada("telefone", "Telefone / WhatsApp", 1, 0, "(11) 99999-0000")
        entrada("cargo_desejado", "Cargo desejado *", 1, 1, "Ex.: Analista de RH")
        entrada("cargos_alternativos", "Cargos alternativos (separe por vírgula)", 2, 0,
                "Ex.: Analista de Recrutamento, Business Partner", span=2)
        entrada("skills", "Competências / skills (separe por vírgula)", 3, 0,
                "Ex.: Recrutamento e Seleção, Departamento Pessoal, Excel, Inglês", span=2)

        box = ctk.CTkFrame(form, fg_color="transparent")
        box.grid(row=4, column=0, sticky="ew", padx=10, pady=6)
        ctk.CTkLabel(box, text="Senioridade", font=T.fonte(12, "bold"), text_color=T.TEXTO_2).pack(anchor="w")
        self.senioridade = ctk.CTkOptionMenu(box, values=["Não definido", *SENIORIDADES], height=36, corner_radius=9,
                                             fg_color=T.CINZA_SUAVE, button_color=T.BORDA, text_color=T.TEXTO,
                                             button_hover_color=T.PRIMARIA_SUAVE, font=T.fonte(13))
        self.senioridade.pack(fill="x", pady=(3, 0))
        entrada("pretensao_salarial", "Pretensão salarial (R$)", 4, 1, "Ex.: 5500")

        entrada("cidade", "Cidade", 5, 0, "Ex.: São Paulo")
        box = ctk.CTkFrame(form, fg_color="transparent")
        box.grid(row=5, column=1, sticky="ew", padx=10, pady=6)
        ctk.CTkLabel(box, text="UF", font=T.fonte(12, "bold"), text_color=T.TEXTO_2).pack(anchor="w")
        self.uf = ctk.CTkOptionMenu(box, values=["--", *UFS], height=36, corner_radius=9, fg_color=T.CINZA_SUAVE,
                                    button_color=T.BORDA, text_color=T.TEXTO, button_hover_color=T.PRIMARIA_SUAVE,
                                    font=T.fonte(13))
        self.uf.pack(fill="x", pady=(3, 0))

        box = ctk.CTkFrame(form, fg_color="transparent")
        box.grid(row=6, column=0, columnspan=2, sticky="ew", padx=10, pady=(10, 4))
        ctk.CTkLabel(box, text="Modalidades aceitas", font=T.fonte(12, "bold"), text_color=T.TEXTO_2).pack(anchor="w")
        linha = ctk.CTkFrame(box, fg_color="transparent")
        linha.pack(fill="x", pady=4)
        self.mods = {}
        for m in MODALIDADES:
            cb = ctk.CTkCheckBox(linha, text=m, font=T.fonte(13), fg_color=T.PRIMARIA, hover_color=T.PRIMARIA_HOVER,
                                 border_color=T.BORDA, corner_radius=6)
            cb.pack(side="left", padx=(0, 22))
            self.mods[m] = cb
        self.mudanca = ctk.CTkSwitch(linha, text="Aceita mudança de cidade", font=T.fonte(13), **T.SWITCH)
        self.mudanca.pack(side="left", padx=(10, 0))

        box = ctk.CTkFrame(form, fg_color="transparent")
        box.grid(row=7, column=0, columnspan=2, sticky="ew", padx=10, pady=6)
        ctk.CTkLabel(box, text="Resumo profissional / observações do recrutador", font=T.fonte(12, "bold"),
                     text_color=T.TEXTO_2).pack(anchor="w")
        self.resumo = ctk.CTkTextbox(box, height=110, corner_radius=9, border_width=1, border_color=T.BORDA,
                                     font=T.fonte(12))
        self.resumo.pack(fill="x", pady=(3, 0))

        rod = ctk.CTkFrame(dir_, fg_color="transparent")
        rod.pack(fill="x", padx=20, pady=14)
        T.botao(rod, "Salvar", self.salvar, width=120).pack(side="right")
        self.btn_excluir = T.botao(rod, "Excluir", self.excluir, "perigo", width=100)
        self.btn_excluir.pack(side="left")
        self.novo()

    # ------------------------------------------------------------------
    def ao_mostrar(self):
        self.carregar()

    def carregar(self):
        self.tv.delete(*self.tv.get_children())
        for i, c in enumerate(self.app.db.candidatos(self.busca.get().strip())):
            local = " / ".join(p for p in (c.cidade, c.uf) if p)
            self.tv.insert("", "end", iid=str(c.id), values=(c.nome, c.cargo_desejado, local),
                           tags=("par" if i % 2 == 0 else "impar",))
        if self.atual and self.atual.id and self.tv.exists(str(self.atual.id)):
            self.tv.selection_set(str(self.atual.id))

    def _selecionar(self, _=None):
        sel = self.tv.selection()
        if sel:
            c = self.app.db.candidato(int(sel[0]))
            if c:
                self.preencher(c)

    def preencher(self, c: Candidato):
        self.atual = c
        self.lbl_form.configure(text=c.nome if c.id else "Novo candidato")
        for k, e in self.campos.items():
            e.delete(0, "end")
            valor = getattr(c, k)
            if k == "pretensao_salarial":
                valor = f"{valor:.0f}" if valor else ""
            if valor:
                e.insert(0, str(valor))
        self.senioridade.set(c.senioridade or "Não definido")
        self.uf.set(c.uf or "--")
        prefs = c.lista("modalidades")
        for m, cb in self.mods.items():
            cb.select() if m in prefs else cb.deselect()
        self.mudanca.select() if c.aceita_mudanca else self.mudanca.deselect()
        self.resumo.delete("1.0", "end")
        self.resumo.insert("1.0", c.resumo or "")
        estado = "normal" if c.id else "disabled"
        self.btn_excluir.configure(state=estado)
        self.btn_buscar.configure(state=estado)

    def coletar(self) -> Candidato | None:
        dados = {k: e.get().strip() for k, e in self.campos.items()}
        if not dados["nome"] or not dados["cargo_desejado"]:
            messagebox.showwarning("Campos obrigatórios", "Informe pelo menos o nome e o cargo desejado.")
            return None
        try:
            pret = float(dados["pretensao_salarial"].replace("R$", "").replace(".", "").replace(",", ".") or 0)
        except ValueError:
            pret = 0.0
        mods = [m for m, cb in self.mods.items() if cb.get()]
        sen = self.senioridade.get()
        uf = self.uf.get()
        return Candidato(
            id=self.atual.id if self.atual else None, nome=dados["nome"], email=dados["email"],
            telefone=dados["telefone"], cargo_desejado=dados["cargo_desejado"],
            cargos_alternativos=dados["cargos_alternativos"], skills=dados["skills"],
            senioridade="" if sen == "Não definido" else sen, cidade=dados["cidade"], uf="" if uf == "--" else uf,
            modalidades=",".join(mods or MODALIDADES), pretensao_salarial=pret,
            aceita_mudanca=int(self.mudanca.get()), resumo=self.resumo.get("1.0", "end").strip(),
        )

    def salvar(self):
        c = self.coletar()
        if not c:
            return
        c.id = self.app.db.salvar_candidato(c)
        self.preencher(c)
        self.carregar()
        self.app.notificar(f"Candidato “{c.nome}” salvo.")

    def novo(self):
        self.tv.selection_remove(*self.tv.selection())
        self.preencher(Candidato())
        self.campos["nome"].focus_set()

    def excluir(self):
        if self.atual and self.atual.id and messagebox.askyesno(
                "Excluir candidato", f"Excluir {self.atual.nome} e todo o pipeline associado?"):
            self.app.db.excluir_candidato(self.atual.id)
            self.novo()
            self.carregar()

    def importar(self):
        caminho = filedialog.askopenfilename(title="Selecione o currículo",
                                             filetypes=[("Currículos", "*.pdf *.docx *.txt"), ("Todos", "*.*")])
        if not caminho:
            return
        try:
            dados = resume_parser.analisar(resume_parser.ler_texto(caminho))
        except Exception as e:  # noqa: BLE001
            messagebox.showerror("Erro ao ler currículo", str(e))
            return
        c = Candidato(**{k: v for k, v in dados.items() if k in Candidato.__dataclass_fields__})
        self.novo()
        self.preencher(c)
        self.app.notificar("Currículo lido. Revise os campos e clique em Salvar.")

    def buscar_vagas(self):
        if self.atual and self.atual.id:
            self.app.ir_para("busca", candidato_id=self.atual.id)
