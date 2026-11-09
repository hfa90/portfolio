"""Busca de vagas multicanal com ranking de compatibilidade."""
from __future__ import annotations

import queue
import threading
import webbrowser
from tkinter import messagebox

import customtkinter as ctk

from .. import exporter, search_engine
from ..config import SETTINGS
from ..matcher import classificar
from ..models import Candidato, Vaga
from ..sources import FONTES
from ..sources.links import links_busca
from . import theme as T

ROTULO_PARCIAL = {"cargo": "Cargo", "skills": "Competências", "modalidade": "Modalidade",
                  "local": "Localização", "senioridade": "Senioridade"}


class PaginaBusca(ctk.CTkFrame):
    def __init__(self, master, app):
        super().__init__(master, fg_color="transparent")
        self.app = app
        self.candidatos: dict[str, Candidato] = {}
        self.resultado: list[Vaga] = []
        self.visiveis: list[Vaga] = []
        self.fila: queue.Queue = queue.Queue()
        self.buscando = False
        self._cancelar = False

        T.titulo_pagina(self, "Buscar vagas", "Varre os canais de vagas do Brasil e ranqueia pela aderência ao perfil"
                        ).pack(fill="x", padx=28, pady=(24, 12))

        # ---------------- barra de busca ----------------
        barra = T.Card(self)
        barra.pack(fill="x", padx=28)
        l1 = ctk.CTkFrame(barra, fg_color="transparent")
        l1.pack(fill="x", padx=16, pady=(14, 6))
        ctk.CTkLabel(l1, text="Candidato", font=T.fonte(12, "bold"), text_color=T.TEXTO_2).pack(side="left")
        self.sel_cand = ctk.CTkOptionMenu(l1, values=["—"], width=230, height=36, corner_radius=9,
                                          fg_color=T.CINZA_SUAVE, button_color=T.BORDA, text_color=T.TEXTO,
                                          button_hover_color=T.PRIMARIA_SUAVE, font=T.fonte(13),
                                          command=self._trocar_candidato)
        self.sel_cand.pack(side="left", padx=(8, 16))
        ctk.CTkLabel(l1, text="Termos", font=T.fonte(12, "bold"), text_color=T.TEXTO_2).pack(side="left")
        self.termos = ctk.CTkEntry(l1, height=36, corner_radius=9, border_color=T.BORDA, font=T.fonte(13),
                                   placeholder_text="Cargos a pesquisar, separados por vírgula")
        self.termos.pack(side="left", fill="x", expand=True, padx=8)
        self.termos.bind("<Return>", lambda e: self.iniciar())
        self.btn_buscar = T.botao(l1, "🔎  Buscar vagas", self.iniciar, width=150)
        self.btn_buscar.pack(side="left")

        l2 = ctk.CTkFrame(barra, fg_color="transparent")
        l2.pack(fill="x", padx=16, pady=(0, 10))
        ctk.CTkLabel(l2, text="Canais", font=T.fonte(12, "bold"), text_color=T.TEXTO_2).grid(row=0, column=0, sticky="nw", padx=(0, 10), pady=3)
        grade = ctk.CTkFrame(l2, fg_color="transparent")
        grade.grid(row=0, column=1, sticky="ew")
        l2.grid_columnconfigure(1, weight=1)
        self.chk_fontes: dict[str, ctk.CTkCheckBox] = {}
        for i, (fid, cls) in enumerate(FONTES.items()):
            cb = ctk.CTkCheckBox(grade, text=cls.nome, font=T.fonte(12), checkbox_width=18, checkbox_height=18,
                                 fg_color=T.PRIMARIA, hover_color=T.PRIMARIA_HOVER, border_color=T.BORDA, corner_radius=5)
            cb.grid(row=i // 5, column=i % 5, sticky="w", padx=(0, 14), pady=3)
            self.chk_fontes[fid] = cb
        T.botao(l2, "Mais portais ↗", self.abrir_portais, "secundario", height=30, width=120).grid(row=0, column=2, sticky="ne")

        self.status_bar = ctk.CTkFrame(barra, fg_color="transparent", height=4)
        self.status_bar.pack(fill="x", padx=16, pady=(0, 10))
        self.progresso = ctk.CTkProgressBar(barra, height=4, corner_radius=2, progress_color=T.PRIMARIA, fg_color=T.CARD)
        self.progresso.set(0)

        # ---------------- resultados + detalhe ----------------
        corpo = ctk.CTkFrame(self, fg_color="transparent")
        corpo.pack(fill="both", expand=True, padx=28, pady=14)
        corpo.grid_columnconfigure(0, weight=1)
        corpo.grid_columnconfigure(1, weight=0, minsize=360)
        corpo.grid_rowconfigure(0, weight=1)

        res = T.Card(corpo)
        res.grid(row=0, column=0, sticky="nsew", padx=(0, 12))
        filtros = ctk.CTkFrame(res, fg_color="transparent")
        filtros.pack(fill="x", padx=14, pady=(12, 8))
        self.f_mod = ctk.CTkSegmentedButton(filtros, values=["Todas", "Presencial", "Híbrido", "Remoto"],
                                            font=T.fonte(12), **T.SEGMENTADO, command=lambda _: self.aplicar_filtros())
        self.f_mod.set("Todas")
        self.f_mod.pack(side="left")
        ctk.CTkLabel(filtros, text="Score mín.", font=T.fonte(12), text_color=T.TEXTO_2).pack(side="left", padx=(14, 4))
        self.f_score = ctk.CTkSlider(filtros, from_=0, to=90, number_of_steps=18, width=120, button_color=T.PRIMARIA,
                                     progress_color=T.PRIMARIA, command=self._slider)
        self.f_score.pack(side="left")
        self.lbl_score = ctk.CTkLabel(filtros, text="40", width=28, font=T.fonte(12, "bold"), text_color=T.TEXTO)
        self.lbl_score.pack(side="left")
        self.f_texto = ctk.CTkEntry(filtros, placeholder_text="Filtrar por empresa, cidade…", height=32, width=190,
                                    corner_radius=8, border_color=T.BORDA, font=T.fonte(12))
        self.f_texto.pack(side="right")
        self.f_texto.bind("<KeyRelease>", lambda e: self.aplicar_filtros())

        self.tv = T.tabela(res, [
            ("score", "SCORE", 72, "center"), ("titulo", "CARGO", 225, "w"), ("empresa", "EMPRESA", 125, "w"),
            ("local", "LOCAL", 110, "w"), ("modalidade", "MODALIDADE", 102, "w"), ("fonte", "CANAL", 92, "w"),
            ("data", "DATA", 58, "center")], altura=14)
        self.tv.moldura.pack(fill="both", expand=True, padx=14)
        self.tv.bind("<<TreeviewSelect>>", self._detalhar)
        self.tv.bind("<Double-1>", lambda e: self.abrir_vaga())
        self.tv.tag_configure("Excelente", foreground=T.cor(T.VERDE))

        rod = ctk.CTkFrame(res, fg_color="transparent")
        rod.pack(fill="x", padx=14, pady=10)
        self.lbl_total = ctk.CTkLabel(rod, text="Selecione um candidato e clique em Buscar.", font=T.fonte(12),
                                      text_color=T.TEXTO_2)
        self.lbl_total.pack(side="left")
        T.botao(rod, "Relatório p/ cliente", self.relatorio, "secundario", height=32).pack(side="right", padx=(8, 0))
        T.botao(rod, "Exportar Excel", self.exportar, "neutro", height=32).pack(side="right")

        # detalhe
        self.det = T.Card(corpo, width=360)
        self.det.grid(row=0, column=1, sticky="nsew")
        self.det.grid_propagate(False)
        self.det.pack_propagate(False)
        self._detalhe_vazio()

        self.f_score.set(SETTINGS.get("score_minimo_padrao", 40))
        self._slider(self.f_score.get())

    # ------------------------------------------------------------------
    def ao_mostrar(self, candidato_id: int | None = None):
        ativas = set(SETTINGS.get("fontes_ativas", []))
        for fid, cb in self.chk_fontes.items():
            fonte = FONTES[fid]()
            disp = fonte.disponivel()
            cb.configure(state="normal" if disp else "disabled",
                         text=FONTES[fid].nome + ("" if disp else " (sem chave)"))
            cb.select() if (fid in ativas and disp) else cb.deselect()
        cands = self.app.db.candidatos()
        self.candidatos = {f"{c.nome}  ·  {c.cargo_desejado}"[:60]: c for c in cands}
        nomes = list(self.candidatos) or ["Cadastre um candidato primeiro"]
        self.sel_cand.configure(values=nomes)
        alvo = next((k for k, c in self.candidatos.items() if c.id == candidato_id), None)
        if alvo:
            self.sel_cand.set(alvo)
            self._trocar_candidato(alvo)
        elif self.sel_cand.get() not in self.candidatos:
            self.sel_cand.set(nomes[0])
            self._trocar_candidato(nomes[0])

    def _trocar_candidato(self, chave):
        c = self.candidatos.get(chave)
        self.termos.delete(0, "end")
        if c:
            self.termos.insert(0, ", ".join(search_engine.termos_do_candidato(c)))

    def _slider(self, v):
        self.lbl_score.configure(text=f"{int(v)}")
        self.aplicar_filtros()

    @property
    def candidato(self) -> Candidato | None:
        return self.candidatos.get(self.sel_cand.get())

    # ---------------- busca ----------------
    def iniciar(self):
        if self.buscando:
            self._cancelar = True
            self.btn_buscar.configure(text="Cancelando…", state="disabled")
            return
        c = self.candidato
        if not c:
            messagebox.showinfo("Candidato", "Cadastre e selecione um candidato para buscar vagas.")
            return
        fontes = [fid for fid, cb in self.chk_fontes.items() if cb.get()]
        termos = [t.strip() for t in self.termos.get().split(",") if t.strip()]
        if not fontes or not termos:
            messagebox.showinfo("Busca", "Selecione ao menos um canal e informe um termo de busca.")
            return
        for w in self.status_bar.winfo_children():
            w.destroy()
        self.chips = {}
        for fid in fontes:
            nome = FONTES[fid].nome
            ch = T.chip(self.status_bar, f"◌ {nome}", T.CINZA_SUAVE, T.TEXTO_2)
            ch.pack(side="left", padx=(0, 6), pady=2)
            self.chips[nome] = ch
        self.total_fontes = len(fontes)
        self.concluidas = 0
        self.progresso.pack(fill="x", padx=16, pady=(0, 6))
        self.progresso.set(0.03)
        self.buscando, self._cancelar = True, False
        self.btn_buscar.configure(text="■  Cancelar", fg_color=T.VERMELHO)
        self.lbl_total.configure(text=f"Buscando “{', '.join(termos)}” em {len(fontes)} canais…")

        def tarefa():
            try:
                r = search_engine.buscar(c, fontes, termos,
                                         progresso=lambda n, s, q: self.fila.put(("prog", n, s, q)),
                                         cancelado=lambda: self._cancelar)
                self.fila.put(("fim", r))
            except Exception as e:  # noqa: BLE001
                self.fila.put(("erro", str(e)))
        threading.Thread(target=tarefa, daemon=True).start()
        self.after(120, self._consumir)

    def _consumir(self):
        try:
            while True:
                msg = self.fila.get_nowait()
                if msg[0] == "prog":
                    _, nome, status, qtd = msg
                    ch = self.chips.get(nome)
                    if ch and status == "ok":
                        ch.configure(text=f"  ✓ {nome} · {qtd}  ", fg_color=T.VERDE_SUAVE, text_color=T.VERDE)
                    elif ch and status == "erro":
                        ch.configure(text=f"  ✕ {nome}  ", fg_color=T.LARANJA_SUAVE, text_color=T.LARANJA)
                    elif ch:
                        ch.configure(text=f"  ◌ {nome}…  ", fg_color=T.PRIMARIA_SUAVE, text_color=T.PRIMARIA)
                    if status in ("ok", "erro"):
                        self.concluidas += 1
                        self.progresso.set(min(1, self.concluidas / max(1, self.total_fontes)))
                elif msg[0] == "fim":
                    self._finalizar(msg[1])
                    return
                elif msg[0] == "erro":
                    self._encerrar_estado()
                    messagebox.showerror("Erro na busca", msg[1])
                    return
        except queue.Empty:
            pass
        self.after(120, self._consumir)

    def _encerrar_estado(self):
        self.buscando = False
        self.btn_buscar.configure(text="🔎  Buscar vagas", state="normal", fg_color=T.PRIMARIA)
        self.progresso.set(1)

    def _finalizar(self, r: search_engine.ResultadoBusca):
        self._encerrar_estado()
        self.resultado = r.vagas
        compat = sum(1 for v in r.vagas if v.score >= self.f_score.get())
        c = self.candidato
        self.app.db.registrar_busca(c.id if c else None, ", ".join(r.termos), len(r.vagas), compat,
                                    ", ".join(r.por_fonte))
        threading.Thread(target=lambda: [self.app.db.salvar_vaga(v) for v in r.vagas if v.score >= 30],
                         daemon=True).start()
        self.aplicar_filtros()
        if r.erros:
            self.lbl_total.configure(text=self.lbl_total.cget("text") + f"  ·  {len(r.erros)} canal(is) indisponível(is)")

    # ---------------- filtros / tabela ----------------
    def aplicar_filtros(self):
        if not hasattr(self, "tv"):
            return
        mod = self.f_mod.get()
        minimo = self.f_score.get()
        txt = self.f_texto.get().strip().lower()
        self.visiveis = [v for v in self.resultado if v.score >= minimo
                         and (mod == "Todas" or v.modalidade == mod)
                         and (not txt or txt in f"{v.titulo} {v.empresa} {v.local} {v.fonte}".lower())]
        self.tv.delete(*self.tv.get_children())
        for i, v in enumerate(self.visiveis):
            faixa = classificar(v.score)
            self.tv.insert("", "end", iid=str(i), tags=(faixa, "par" if i % 2 == 0 else "impar"), values=(
                f"{v.score:.0f}", v.titulo, v.empresa or "—", v.local, v.modalidade or "—", v.fonte,
                "/".join(reversed(v.publicada_em.split("-")[1:])) if v.publicada_em else "—"))
        if self.resultado:
            exc = sum(1 for v in self.visiveis if v.score >= 75)
            self.lbl_total.configure(
                text=f"{len(self.visiveis)} vagas exibidas · {exc} excelentes · {len(self.resultado)} analisadas no total")
        if self.visiveis:
            self.tv.selection_set("0")

    # ---------------- detalhe ----------------
    def _limpar_det(self):
        for w in self.det.winfo_children():
            w.destroy()

    def _detalhe_vazio(self):
        self._limpar_det()
        ctk.CTkLabel(self.det, text="🎯", font=T.fonte(40)).pack(pady=(80, 6))
        ctk.CTkLabel(self.det, text="Selecione uma vaga", font=T.fonte(16, "bold"), text_color=T.TEXTO).pack()
        ctk.CTkLabel(self.det, text="para ver por que ela combina com o candidato.", font=T.fonte(12),
                     text_color=T.TEXTO_2).pack()

    def _vaga_sel(self) -> Vaga | None:
        sel = self.tv.selection()
        return self.visiveis[int(sel[0])] if sel and int(sel[0]) < len(self.visiveis) else None

    def _detalhar(self, _=None):
        v = self._vaga_sel()
        if not v:
            return
        self._limpar_det()
        d = v.detalhes_score
        faixa = classificar(v.score)
        cor_f = T.CORES_FAIXA[faixa]

        sc = ctk.CTkScrollableFrame(self.det, fg_color="transparent")
        sc.pack(fill="both", expand=True, padx=4, pady=(8, 0))
        topo = ctk.CTkFrame(sc, fg_color="transparent")
        topo.pack(fill="x", padx=10, pady=(6, 4))
        bola = ctk.CTkFrame(topo, width=64, height=64, corner_radius=14, fg_color=cor_f)
        bola.pack(side="left")
        bola.pack_propagate(False)
        ctk.CTkLabel(bola, text=f"{v.score:.0f}", font=T.fonte(22, "bold"), text_color="#FFFFFF").pack(expand=True, pady=(8, 0))
        ctk.CTkLabel(bola, text=faixa, font=T.fonte(9, "bold"), text_color="#FFFFFF").pack(pady=(0, 8))
        info = ctk.CTkFrame(topo, fg_color="transparent")
        info.pack(side="left", fill="x", expand=True, padx=12)
        ctk.CTkLabel(info, text=v.titulo, font=T.fonte(15, "bold"), text_color=T.TEXTO, wraplength=240,
                     justify="left", anchor="w").pack(anchor="w")
        ctk.CTkLabel(info, text=v.empresa or "Empresa não divulgada", font=T.fonte(12), text_color=T.TEXTO_2,
                     anchor="w").pack(anchor="w")

        tags = ctk.CTkFrame(sc, fg_color="transparent")
        tags.pack(fill="x", padx=10, pady=6)
        self._chips(tags, [t[:28] for t in (v.local, v.modalidade, v.senioridade, v.contrato, v.salario, v.fonte) if t],
                    T.CINZA_SUAVE, T.TEXTO)

        ctk.CTkLabel(sc, text="Por que combina", font=T.fonte(13, "bold"), text_color=T.TEXTO).pack(anchor="w", padx=10, pady=(8, 2))
        for chave, valor in d.get("parciais", {}).items():
            linha = ctk.CTkFrame(sc, fg_color="transparent")
            linha.pack(fill="x", padx=10, pady=2)
            ctk.CTkLabel(linha, text=ROTULO_PARCIAL[chave], width=100, anchor="w", font=T.fonte(12),
                         text_color=T.TEXTO_2).pack(side="left")
            ctk.CTkLabel(linha, text=f"{valor}%", width=38, font=T.fonte(11, "bold"), text_color=T.TEXTO).pack(side="right")
            b = ctk.CTkProgressBar(linha, height=8, corner_radius=4, fg_color=T.CINZA_SUAVE,
                                   progress_color=T.VERDE if valor >= 70 else (T.LARANJA if valor >= 40 else T.VERMELHO))
            b.set(valor / 100)
            b.pack(side="left", fill="x", expand=True, padx=6)
        obs = " · ".join(x for x in (d.get("cargo"), d.get("local"), d.get("senioridade"), d.get("salario"), d.get("alerta")) if x)
        ctk.CTkLabel(sc, text=obs, font=T.fonte(11), text_color=T.TEXTO_2, wraplength=310, justify="left"
                     ).pack(anchor="w", padx=10, pady=(4, 6))

        def grupo(titulo, itens, fg, tc):
            if not itens:
                return
            ctk.CTkLabel(sc, text=titulo, font=T.fonte(12, "bold"), text_color=T.TEXTO).pack(anchor="w", padx=10, pady=(6, 2))
            fr = ctk.CTkFrame(sc, fg_color="transparent")
            fr.pack(fill="x", padx=10)
            self._chips(fr, itens, fg, tc)
        grupo("Competências que o candidato tem", d.get("skills_ok"), T.VERDE_SUAVE, T.VERDE)
        grupo("Pedidas na vaga e ausentes no perfil", d.get("skills_faltam"), T.LARANJA_SUAVE, T.LARANJA)

        ctk.CTkLabel(sc, text="Descrição", font=T.fonte(13, "bold"), text_color=T.TEXTO).pack(anchor="w", padx=10, pady=(10, 2))
        ctk.CTkLabel(sc, text=(v.descricao[:1400] + ("…" if len(v.descricao) > 1400 else "")) or "Descrição completa no anúncio.",
                     font=T.fonte(12), text_color=T.TEXTO_2, wraplength=310, justify="left").pack(anchor="w", padx=10)

        acoes = ctk.CTkFrame(self.det, fg_color="transparent")
        acoes.pack(fill="x", padx=14, pady=12)
        T.botao(acoes, "Abrir vaga ↗", self.abrir_vaga, "neutro", width=120).pack(side="left")
        T.botao(acoes, "+ Adicionar ao pipeline", self.ao_pipeline).pack(side="right")

    @staticmethod
    def _chips(pai, textos, fg, tc, limite=36):
        """Quebra os chips em linhas para caber no painel."""
        linha, usado = None, limite + 1
        for t in textos:
            if usado + len(t) + 3 > limite:
                linha = ctk.CTkFrame(pai, fg_color="transparent")
                linha.pack(fill="x", pady=1)
                usado = 0
            T.chip(linha, t, fg, tc).pack(side="left", padx=(0, 4))
            usado += len(t) + 3

    def abrir_vaga(self):
        v = self._vaga_sel()
        if v:
            webbrowser.open(v.url)

    def ao_pipeline(self):
        v, c = self._vaga_sel(), self.candidato
        if v and c:
            novo = self.app.db.adicionar_pipeline(c.id, v)
            self.app.notificar("Vaga adicionada ao pipeline." if novo else "Essa vaga já está no pipeline do candidato.")

    def exportar(self):
        if not self.visiveis:
            return messagebox.showinfo("Exportar", "Faça uma busca primeiro.")
        caminho = exporter.exportar_excel(self.visiveis, self.candidato)
        self.app.abrir_arquivo(caminho)

    def relatorio(self):
        if not self.visiveis or not self.candidato:
            return messagebox.showinfo("Relatório", "Faça uma busca primeiro.")
        caminho = exporter.relatorio_html(self.visiveis, self.candidato)
        webbrowser.open(caminho.as_uri())

    def abrir_portais(self):
        c = self.candidato
        termo = (self.termos.get().split(",")[0].strip() or (c.cargo_desejado if c else "")) or "vagas"
        remoto = bool(c and c.lista("modalidades") == ["Remoto"])
        janela = ctk.CTkToplevel(self)
        janela.title("Pesquisar em outros portais")
        janela.geometry("440x560")
        janela.transient(self.winfo_toplevel())
        janela.configure(fg_color=T.BG)
        ctk.CTkLabel(janela, text="Busca pronta em outros portais", font=T.fonte(17, "bold"),
                     text_color=T.TEXTO).pack(anchor="w", padx=20, pady=(18, 2))
        ctk.CTkLabel(janela, text=f"Termo: “{termo}”. Estes sites não oferecem integração pública;\n"
                                  "a pesquisa abre já filtrada no seu navegador.",
                     font=T.fonte(12), text_color=T.TEXTO_2, justify="left").pack(anchor="w", padx=20, pady=(0, 10))
        lista = ctk.CTkScrollableFrame(janela, fg_color="transparent")
        lista.pack(fill="both", expand=True, padx=12, pady=(0, 12))
        for nome, url in links_busca(termo, c.cidade if c else "", c.uf if c else "", remoto):
            T.botao(lista, f"{nome}  ↗", lambda u=url: webbrowser.open(u), "neutro", anchor="w").pack(fill="x", pady=3)
        T.botao(janela, "Abrir todos", lambda: [webbrowser.open(u) for _, u in links_busca(
            termo, c.cidade if c else "", c.uf if c else "", remoto)[:9]], "primario").pack(fill="x", padx=20, pady=(0, 16))
