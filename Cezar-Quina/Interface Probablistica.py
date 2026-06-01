"""
╔══════════════════════════════════════════════════════════════╗
║         LOTTERY STATISTICAL ANALYZER — v2.0                 ║
║    Análise Probabilística Avançada para Dados de Loteria     ║
╚══════════════════════════════════════════════════════════════╝
Desenvolvido com Python | pandas | scipy | matplotlib | tkinter
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import pandas as pd
import numpy as np
from scipy import stats
from scipy.stats import chi2_contingency, poisson
from collections import Counter
import matplotlib
matplotlib.use("TkAgg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg, NavigationToolbar2Tk
from matplotlib.figure import Figure
import matplotlib.gridspec as gridspec
from matplotlib.colors import LinearSegmentedColormap
import json
import os
import warnings
warnings.filterwarnings("ignore")

# ─── PALETA DE CORES ────────────────────────────────────────────────────────
BG_DARK      = "#0A0E1A"
BG_CARD      = "#111827"
BG_PANEL     = "#1A2035"
ACCENT_GOLD  = "#F5C518"
ACCENT_TEAL  = "#00D4AA"
ACCENT_ROSE  = "#FF6B8A"
ACCENT_BLUE  = "#4A9EFF"
ACCENT_PURP  = "#B983FF"
TEXT_PRIMARY = "#E8EAF0"
TEXT_MUTED   = "#6B7280"
BORDER       = "#2A3550"

# ─── MOTOR ESTATÍSTICO ──────────────────────────────────────────────────────
class LotteryEngine:
    def __init__(self):
        self.df = None
        self.number_cols = []
        self.all_numbers = []
        self.freq = {}
        self.max_number = 60

    def load_csv(self, path):
        df = pd.read_csv(path)
        return self._process_df(df, path)

    def load_json(self, path):
        with open(path) as f:
            data = json.load(f)
        df = pd.DataFrame(data)
        return self._process_df(df, path)

    def _process_df(self, df, path):
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        # Detect number columns (values between 1–99, typically)
        number_cols = []
        for col in numeric_cols:
            col_max = df[col].max()
            col_min = df[col].min()
            if 1 <= col_min and col_max <= 99:
                number_cols.append(col)

        if not number_cols:
            raise ValueError("Nenhuma coluna de números de loteria detectada.\n"
                             "As colunas numéricas devem conter valores entre 1 e 99.")

        self.df = df
        self.number_cols = number_cols
        self.all_numbers = df[number_cols].values.flatten().tolist()
        self.all_numbers = [int(x) for x in self.all_numbers if not np.isnan(x)]
        self.max_number = max(self.all_numbers)
        self.freq = Counter(self.all_numbers)
        return True

    def frequency_analysis(self):
        """Frequência absoluta e relativa de cada número."""
        total = len(self.all_numbers)
        freq_df = pd.DataFrame([
            {"numero": n, "frequencia": self.freq.get(n, 0),
             "frequencia_relativa": round(self.freq.get(n, 0) / total * 100, 2)}
            for n in range(1, self.max_number + 1)
        ])
        return freq_df.sort_values("frequencia", ascending=False)

    def hot_cold_numbers(self, top_n=10):
        """Números quentes (mais sorteados) e frios (menos sorteados)."""
        freq_df = self.frequency_analysis()
        hot  = freq_df.head(top_n)["numero"].tolist()
        cold = freq_df.tail(top_n)["numero"].tolist()
        return hot, cold

    def consecutive_analysis(self):
        """Analisa padrão de consecutivos por sorteio."""
        results = []
        for _, row in self.df[self.number_cols].iterrows():
            nums = sorted(row.tolist())
            consec = sum(1 for a, b in zip(nums, nums[1:]) if b - a == 1)
            results.append(consec)
        return np.array(results)

    def parity_analysis(self):
        """Par vs ímpar por sorteio."""
        draws = []
        for _, row in self.df[self.number_cols].iterrows():
            nums = row.tolist()
            even = sum(1 for n in nums if n % 2 == 0)
            odd  = len(nums) - even
            draws.append({"pares": even, "impares": odd})
        return pd.DataFrame(draws)

    def sum_analysis(self):
        """Soma dos números por sorteio."""
        return self.df[self.number_cols].sum(axis=1)

    def delay_analysis(self):
        """Atraso de cada número (sorteios desde última aparição)."""
        n_draws = len(self.df)
        last_seen = {}
        for i, row in enumerate(self.df[self.number_cols].values):
            for n in row:
                last_seen[int(n)] = i

        delays = {}
        for n in range(1, self.max_number + 1):
            delays[n] = n_draws - last_seen.get(n, -1) - 1
        return delays

    def markov_transition(self):
        """Matriz de transição de Markov simplificada (décadas)."""
        decades = {n: (n - 1) // 10 for n in range(1, self.max_number + 1)}
        n_dec = (self.max_number - 1) // 10 + 1
        matrix = np.zeros((n_dec, n_dec))

        for i in range(len(self.df) - 1):
            row_a = [decades[int(x)] for x in self.df[self.number_cols].iloc[i].tolist()]
            row_b = [decades[int(x)] for x in self.df[self.number_cols].iloc[i+1].tolist()]
            for a in row_a:
                for b in row_b:
                    matrix[a][b] += 1

        row_sums = matrix.sum(axis=1, keepdims=True)
        row_sums[row_sums == 0] = 1
        return matrix / row_sums

    def poisson_expected(self):
        """Frequência esperada por Poisson."""
        total_draws = len(self.df)
        nums_per_draw = len(self.number_cols)
        λ = (total_draws * nums_per_draw) / self.max_number
        expected = {n: round(poisson.pmf(self.freq.get(n, 0), λ) * total_draws, 4)
                    for n in range(1, self.max_number + 1)}
        return expected, λ

    def chi2_test(self):
        """Teste Qui-Quadrado de uniformidade."""
        observed = [self.freq.get(n, 0) for n in range(1, self.max_number + 1)]
        total = sum(observed)
        expected = [total / self.max_number] * self.max_number
        chi2, p = stats.chisquare(observed, f_exp=expected)
        return chi2, p

    def predict_numbers(self, strategy="balanced", n=6):
        """
        Prediz próximos números usando múltiplas estratégias estatísticas.
        strategy: 'hot' | 'cold' | 'balanced' | 'delay' | 'poisson'
        """
        n_draws = len(self.df)
        freq_df = self.frequency_analysis()

        if strategy == "hot":
            candidates = freq_df.head(20)["numero"].tolist()
            return sorted(np.random.choice(candidates, size=n, replace=False).tolist())

        elif strategy == "cold":
            candidates = freq_df.tail(20)["numero"].tolist()
            return sorted(np.random.choice(candidates, size=n, replace=False).tolist())

        elif strategy == "delay":
            delays = self.delay_analysis()
            # Números com maior atraso têm maior peso
            nums = list(delays.keys())
            weights = np.array([delays[k] + 1 for k in nums], dtype=float)
            weights /= weights.sum()
            chosen = np.random.choice(nums, size=n, replace=False, p=weights)
            return sorted(chosen.tolist())

        elif strategy == "poisson":
            _, λ = self.poisson_expected()
            # Números com frequência abaixo da esperada são candidatos
            under = [n for n in range(1, self.max_number + 1)
                     if self.freq.get(n, 0) < λ]
            if len(under) < n:
                under = list(range(1, self.max_number + 1))
            return sorted(np.random.choice(under, size=n, replace=False).tolist())

        else:  # balanced — ponderado pela frequência inversa normalizada
            freq_arr = np.array([self.freq.get(i, 0) for i in range(1, self.max_number + 1)], dtype=float)
            # Combina frequência (40%) + atraso (40%) + aleatoriedade (20%)
            max_freq = freq_arr.max() if freq_arr.max() > 0 else 1
            w_freq = (max_freq - freq_arr + 1) / (max_freq + 1)

            delays = self.delay_analysis()
            d_arr  = np.array([delays.get(i, 0) for i in range(1, self.max_number + 1)], dtype=float)
            max_d  = d_arr.max() if d_arr.max() > 0 else 1
            w_del  = d_arr / max_d

            w_rand = np.random.random(self.max_number)
            weights = 0.40 * w_freq + 0.40 * w_del + 0.20 * w_rand
            weights /= weights.sum()

            nums = list(range(1, self.max_number + 1))
            chosen = np.random.choice(nums, size=n, replace=False, p=weights)
            return sorted(chosen.tolist())

    def statistics_summary(self):
        """Resumo estatístico completo."""
        sums  = self.sum_analysis()
        parity = self.parity_analysis()
        consec = self.consecutive_analysis()
        freq_df = self.frequency_analysis()
        chi2, p = self.chi2_test()
        hot, cold = self.hot_cold_numbers(5)

        return {
            "total_sorteios": len(self.df),
            "numeros_por_sorteio": len(self.number_cols),
            "universo": self.max_number,
            "numero_mais_frequente": int(freq_df.iloc[0]["numero"]),
            "max_frequencia": int(freq_df.iloc[0]["frequencia"]),
            "numero_menos_frequente": int(freq_df.iloc[-1]["numero"]),
            "min_frequencia": int(freq_df.iloc[-1]["frequencia"]),
            "media_soma": round(sums.mean(), 2),
            "desvio_soma": round(sums.std(), 2),
            "media_pares": round(parity["pares"].mean(), 2),
            "chi2": round(chi2, 4),
            "p_value": round(p, 6),
            "distribuicao_uniforme": "Sim ✓" if p > 0.05 else "Não ✗",
            "hot": hot,
            "cold": cold,
            "media_consecutivos": round(consec.mean(), 2),
        }


# ─── INTERFACE GRÁFICA ──────────────────────────────────────────────────────
class LotteryApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.engine = LotteryEngine()
        self.title("🎰 Analise Estatística Loterica")
        self.configure(bg=BG_DARK)
        self.geometry("1400x900")
        self.minsize(1100, 700)

        # Configurar estilo
        self._setup_style()
        self._build_ui()

    def _setup_style(self):
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TNotebook",       background=BG_DARK,    borderwidth=0)
        style.configure("TNotebook.Tab",   background=BG_PANEL,   foreground=TEXT_MUTED,
                        padding=[20, 10], font=("Courier New", 10, "bold"))
        style.map("TNotebook.Tab",
                  background=[("selected", BG_CARD)],
                  foreground=[("selected", ACCENT_GOLD)])
        style.configure("TFrame",  background=BG_DARK)
        style.configure("TLabel",  background=BG_DARK, foreground=TEXT_PRIMARY)
        style.configure("Treeview", background=BG_CARD, foreground=TEXT_PRIMARY,
                        fieldbackground=BG_CARD, rowheight=28,
                        font=("Courier New", 10))
        style.configure("Treeview.Heading", background=BG_PANEL, foreground=ACCENT_GOLD,
                        font=("Courier New", 10, "bold"))
        style.map("Treeview", background=[("selected", ACCENT_BLUE)])

    def _build_ui(self):
        # ── Header ────────────────────────────────────────────────────────
        hdr = tk.Frame(self, bg=BG_CARD, height=70)
        hdr.pack(fill="x", side="top")
        hdr.pack_propagate(False)

        tk.Label(hdr, text="🎰  ANALISE ESTATISTICA LOTERICA",
                 bg=BG_CARD, fg=ACCENT_GOLD,
                 font=("Courier New", 18, "bold")).pack(side="left", padx=30, pady=15)

        tk.Label(hdr, text="Análise Probabilística Avançada",
                 bg=BG_CARD, fg=TEXT_MUTED,
                 font=("Courier New", 10)).pack(side="left", padx=5, pady=22)

        # Import button
        btn_frame = tk.Frame(hdr, bg=BG_CARD)
        btn_frame.pack(side="right", padx=20)
        self._btn(btn_frame, "  📂  IMPORTAR CSV", self._load_csv,
                  ACCENT_TEAL).pack(side="left", padx=5, pady=15)
        self._btn(btn_frame, "  📂  IMPORTAR JSON", self._load_json,
                  ACCENT_BLUE).pack(side="left", padx=5, pady=15)
        self._btn(btn_frame, "  📊  DEMO", self._load_demo,
                  ACCENT_PURP).pack(side="left", padx=5, pady=15)

        # ── Status bar ───────────────────────────────────────────────────
        self.status_var = tk.StringVar(value="⬡  Aguardando importação de dados...")
        status = tk.Label(self, textvariable=self.status_var,
                          bg=BG_PANEL, fg=TEXT_MUTED,
                          font=("Courier New", 9), anchor="w", padx=15)
        status.pack(fill="x", side="bottom", ipady=5)

        # ── Main notebook ─────────────────────────────────────────────────
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True, padx=10, pady=8)

        self.tab_overview   = tk.Frame(self.notebook, bg=BG_DARK)
        self.tab_frequency  = tk.Frame(self.notebook, bg=BG_DARK)
        self.tab_charts     = tk.Frame(self.notebook, bg=BG_DARK)
        self.tab_predict    = tk.Frame(self.notebook, bg=BG_DARK)
        self.tab_advanced   = tk.Frame(self.notebook, bg=BG_DARK)

        self.notebook.add(self.tab_overview,  text="  ◈  VISÃO GERAL  ")
        self.notebook.add(self.tab_frequency, text="  ◈  FREQUÊNCIAS  ")
        self.notebook.add(self.tab_charts,    text="  ◈  GRÁFICOS     ")
        self.notebook.add(self.tab_predict,   text="  ◈  PREDIÇÃO     ")
        self.notebook.add(self.tab_advanced,  text="  ◈  AVANÇADO     ")

        self._build_overview_tab()
        self._build_frequency_tab()
        self._build_charts_tab()
        self._build_predict_tab()
        self._build_advanced_tab()

    def _btn(self, parent, text, cmd, color):
        b = tk.Button(parent, text=text, command=cmd,
                      bg=color, fg=BG_DARK,
                      font=("Courier New", 9, "bold"),
                      relief="flat", padx=14, pady=6,
                      activebackground=TEXT_PRIMARY, cursor="hand2")
        return b

    # ── Tab: Visão Geral ─────────────────────────────────────────────────
    def _build_overview_tab(self):
        self.ov_cards_frame = tk.Frame(self.tab_overview, bg=BG_DARK)
        self.ov_cards_frame.pack(fill="x", padx=20, pady=20)

        self.ov_hot_frame = tk.Frame(self.tab_overview, bg=BG_DARK)
        self.ov_hot_frame.pack(fill="x", padx=20, pady=5)

        self.ov_fig_frame = tk.Frame(self.tab_overview, bg=BG_DARK)
        self.ov_fig_frame.pack(fill="both", expand=True, padx=20, pady=10)

        self._ov_placeholder()

    def _ov_placeholder(self):
        tk.Label(self.ov_cards_frame,
                 text="⬡  Importe um arquivo CSV ou JSON para começar a análise",
                 bg=BG_DARK, fg=TEXT_MUTED,
                 font=("Courier New", 13)).pack(pady=60)

    def _update_overview(self):
        for w in self.ov_cards_frame.winfo_children(): w.destroy()
        for w in self.ov_hot_frame.winfo_children(): w.destroy()
        for w in self.ov_fig_frame.winfo_children(): w.destroy()

        s = self.engine.statistics_summary()

        # ── Stat cards ─────────────────────────────────────────────────
        cards_data = [
            ("🎯 Total Sorteios",        str(s["total_sorteios"]),   ACCENT_TEAL),
            ("🔢 Números/Sorteio",       str(s["numeros_por_sorteio"]), ACCENT_BLUE),
            ("🌐 Universo",              f"1 – {s['universo']}",      ACCENT_PURP),
            ("🔥 Nº Mais Frequente",     str(s["numero_mais_frequente"]), ACCENT_GOLD),
            ("❄️  Nº Menos Frequente",   str(s["numero_menos_frequente"]), ACCENT_ROSE),
            ("Σ  Média da Soma",         str(s["media_soma"]),        ACCENT_TEAL),
            ("χ² Uniforme?",             s["distribuicao_uniforme"],  ACCENT_BLUE),
            ("⧖  Média Consecutivos",   str(s["media_consecutivos"]), ACCENT_PURP),
        ]

        for i, (label, value, color) in enumerate(cards_data):
            card = tk.Frame(self.ov_cards_frame, bg=BG_CARD,
                            highlightbackground=color, highlightthickness=1)
            card.grid(row=0, column=i, padx=6, pady=4, sticky="nsew")
            self.ov_cards_frame.columnconfigure(i, weight=1)

            tk.Label(card, text=label, bg=BG_CARD, fg=TEXT_MUTED,
                     font=("Courier New", 8)).pack(padx=12, pady=(10, 2))
            tk.Label(card, text=value, bg=BG_CARD, fg=color,
                     font=("Courier New", 16, "bold")).pack(padx=12, pady=(0, 10))

        # ── Hot / Cold ──────────────────────────────────────────────────
        hc_frame = tk.Frame(self.ov_hot_frame, bg=BG_DARK)
        hc_frame.pack(fill="x")

        hot_frame = tk.LabelFrame(hc_frame, text="  🔥 NÚMEROS QUENTES (Top 5)  ",
                                  bg=BG_CARD, fg=ACCENT_GOLD,
                                  font=("Courier New", 10, "bold"),
                                  bd=1, relief="flat",
                                  highlightbackground=ACCENT_GOLD)
        hot_frame.pack(side="left", fill="x", expand=True, padx=(0,8), pady=5)

        cold_frame = tk.LabelFrame(hc_frame, text="  ❄️  NÚMEROS FRIOS (Bottom 5)  ",
                                   bg=BG_CARD, fg=ACCENT_BLUE,
                                   font=("Courier New", 10, "bold"),
                                   bd=1, relief="flat",
                                   highlightbackground=ACCENT_BLUE)
        cold_frame.pack(side="left", fill="x", expand=True, padx=(8,0), pady=5)

        for n in s["hot"]:
            freq = self.engine.freq.get(n, 0)
            self._num_badge(hot_frame, n, freq, ACCENT_GOLD).pack(side="left", padx=8, pady=10)

        for n in s["cold"]:
            freq = self.engine.freq.get(n, 0)
            self._num_badge(cold_frame, n, freq, ACCENT_BLUE).pack(side="left", padx=8, pady=10)

        # ── Mini chart: Top 20 frequências ─────────────────────────────
        fig = Figure(figsize=(12, 3.2), facecolor=BG_CARD)
        ax  = fig.add_subplot(111, facecolor=BG_PANEL)

        freq_df = self.engine.frequency_analysis().head(20)
        bars = ax.bar(freq_df["numero"].astype(str), freq_df["frequencia"],
                      color=ACCENT_GOLD, alpha=0.85, edgecolor=BG_DARK, linewidth=0.5)

        # Color gradient
        max_f = freq_df["frequencia"].max()
        for bar, f in zip(bars, freq_df["frequencia"]):
            ratio = f / max_f
            bar.set_facecolor(plt.cm.YlOrRd(0.3 + 0.7 * ratio))

        ax.set_title("TOP 20 NÚMEROS MAIS FREQUENTES", color=ACCENT_GOLD,
                     fontsize=11, fontweight="bold", pad=10)
        ax.set_xlabel("Número", color=TEXT_MUTED, fontsize=9)
        ax.set_ylabel("Frequência", color=TEXT_MUTED, fontsize=9)
        ax.tick_params(colors=TEXT_MUTED, labelsize=8)
        ax.spines[:].set_color(BORDER)
        ax.grid(axis="y", color=BORDER, alpha=0.5)
        fig.tight_layout(pad=1.5)

        canvas = FigureCanvasTkAgg(fig, self.ov_fig_frame)
        canvas.draw()
        canvas.get_tk_widget().pack(fill="both", expand=True)

    def _num_badge(self, parent, n, freq, color):
        f = tk.Frame(parent, bg=color, width=64, height=64)
        f.pack_propagate(False)
        tk.Label(f, text=str(n), bg=color, fg=BG_DARK,
                 font=("Courier New", 18, "bold")).pack(pady=4)
        tk.Label(f, text=f"×{freq}", bg=color, fg=BG_DARK,
                 font=("Courier New", 8)).pack()
        return f

    # ── Tab: Frequências ─────────────────────────────────────────────────
    def _build_frequency_tab(self):
        top = tk.Frame(self.tab_frequency, bg=BG_DARK)
        top.pack(fill="x", padx=20, pady=10)

        tk.Label(top, text="Filtrar:", bg=BG_DARK, fg=TEXT_MUTED,
                 font=("Courier New", 10)).pack(side="left")

        self.freq_filter_var = tk.StringVar(value="todos")
        for val, lbl in [("todos","Todos"), ("hot","Quentes"), ("cold","Frios"), ("delay","Por Atraso")]:
            rb = tk.Radiobutton(top, text=lbl, variable=self.freq_filter_var,
                                value=val, bg=BG_DARK, fg=TEXT_PRIMARY,
                                selectcolor=BG_PANEL, activebackground=BG_DARK,
                                font=("Courier New", 9), command=self._refresh_freq_table)
            rb.pack(side="left", padx=10)

        # Treeview
        cols = ("numero","frequencia","freq_relativa","atraso","classificacao")
        self.freq_tree = ttk.Treeview(self.tab_frequency, columns=cols,
                                      show="headings", height=25)
        for c, w, h in [("numero",80,"Nº"), ("frequencia",110,"Freq. Abs."),
                         ("freq_relativa",110,"Freq. Rel. %"),
                         ("atraso",110,"Atraso"), ("classificacao",140,"Classificação")]:
            self.freq_tree.heading(c, text=h)
            self.freq_tree.column(c, width=w, anchor="center")

        vsb = ttk.Scrollbar(self.tab_frequency, orient="vertical",
                             command=self.freq_tree.yview)
        self.freq_tree.configure(yscrollcommand=vsb.set)
        self.freq_tree.pack(side="left", fill="both", expand=True, padx=(20,0), pady=10)
        vsb.pack(side="left", fill="y", pady=10, padx=(0,20))

        # Tags
        self.freq_tree.tag_configure("hot",    background="#1A1500", foreground=ACCENT_GOLD)
        self.freq_tree.tag_configure("cold",   background="#001522", foreground=ACCENT_BLUE)
        self.freq_tree.tag_configure("normal", background=BG_CARD,   foreground=TEXT_PRIMARY)

    def _refresh_freq_table(self):
        if self.engine.df is None: return
        for row in self.freq_tree.get_children():
            self.freq_tree.delete(row)

        freq_df = self.engine.frequency_analysis()
        delays  = self.engine.delay_analysis()
        hot, cold = self.engine.hot_cold_numbers(10)

        filt = self.freq_filter_var.get()
        if filt == "hot":
            freq_df = freq_df[freq_df["numero"].isin(hot)]
        elif filt == "cold":
            freq_df = freq_df[freq_df["numero"].isin(cold)]
        elif filt == "delay":
            freq_df["_delay"] = freq_df["numero"].map(delays)
            freq_df = freq_df.sort_values("_delay", ascending=False)

        for _, row in freq_df.iterrows():
            n = int(row["numero"])
            f = int(row["frequencia"])
            fr= float(row["freq_relativa"])
            d = delays.get(n, 0)

            if n in hot:
                tag = "hot"; cl = "🔥 QUENTE"
            elif n in cold:
                tag = "cold"; cl = "❄️  FRIO"
            else:
                tag = "normal"; cl = "◌  NORMAL"

            self.freq_tree.insert("", "end",
                                   values=(n, f, f"{fr}%", d, cl), tags=(tag,))

    # ── Tab: Gráficos ────────────────────────────────────────────────────
    def _build_charts_tab(self):
        left = tk.Frame(self.tab_charts, bg=BG_CARD, width=200)
        left.pack(side="left", fill="y", padx=(10,0), pady=10)
        left.pack_propagate(False)

        tk.Label(left, text="GRÁFICOS", bg=BG_CARD, fg=ACCENT_GOLD,
                 font=("Courier New", 11, "bold")).pack(pady=(20,10))

        self.chart_var = tk.StringVar(value="heatmap")
        charts = [
            ("heatmap",   "🌡  Heatmap Freq."),
            ("histogram", "📊  Histograma"),
            ("parity",    "⊕  Par vs Ímpar"),
            ("sums",      "Σ  Distribuição Soma"),
            ("delay",     "⧖  Mapa de Atrasos"),
            ("markov",    "↻  Matriz Markov"),
        ]
        for val, lbl in charts:
            rb = tk.Radiobutton(left, text=lbl, variable=self.chart_var,
                                value=val, bg=BG_CARD, fg=TEXT_PRIMARY,
                                selectcolor=BG_PANEL, activebackground=BG_CARD,
                                font=("Courier New", 9),
                                command=self._render_chart)
            rb.pack(anchor="w", padx=15, pady=4)

        self._btn(left, " ↻ Atualizar", self._render_chart, ACCENT_TEAL).pack(pady=20)

        self.chart_frame = tk.Frame(self.tab_charts, bg=BG_DARK)
        self.chart_frame.pack(side="left", fill="both", expand=True, padx=10, pady=10)

    def _render_chart(self):
        if self.engine.df is None: return
        for w in self.chart_frame.winfo_children(): w.destroy()

        chart = self.chart_var.get()
        fig = Figure(figsize=(10, 6), facecolor=BG_DARK)

        if chart == "heatmap":
            self._chart_heatmap(fig)
        elif chart == "histogram":
            self._chart_histogram(fig)
        elif chart == "parity":
            self._chart_parity(fig)
        elif chart == "sums":
            self._chart_sums(fig)
        elif chart == "delay":
            self._chart_delay(fig)
        elif chart == "markov":
            self._chart_markov(fig)

        fig.tight_layout(pad=2)
        canvas = FigureCanvasTkAgg(fig, self.chart_frame)
        canvas.draw()
        toolbar = NavigationToolbar2Tk(canvas, self.chart_frame)
        toolbar.config(background=BG_PANEL)
        toolbar.update()
        canvas.get_tk_widget().pack(fill="both", expand=True)

    def _chart_heatmap(self, fig):
        ax = fig.add_subplot(111, facecolor=BG_PANEL)
        max_n = self.engine.max_number
        cols  = 10
        rows  = (max_n + cols - 1) // cols
        grid  = np.zeros((rows, cols))
        for n in range(1, max_n + 1):
            r, c = divmod(n - 1, cols)
            if r < rows: grid[r][c] = self.engine.freq.get(n, 0)

        cmap = LinearSegmentedColormap.from_list("lotto",
               [BG_PANEL, "#1A3050", ACCENT_TEAL, ACCENT_GOLD, ACCENT_ROSE])
        im = ax.imshow(grid, cmap=cmap, aspect="auto")

        for r in range(rows):
            for c in range(cols):
                n = r * cols + c + 1
                if n <= max_n:
                    f = self.engine.freq.get(n, 0)
                    ax.text(c, r, str(n), ha="center", va="center",
                            fontsize=8, fontweight="bold",
                            color="white" if f > grid.max() * 0.5 else TEXT_MUTED)

        ax.set_xticks(range(cols))
        ax.set_xticklabels([f"_{i+1}" for i in range(cols)], color=TEXT_MUTED, fontsize=8)
        ax.set_yticks(range(rows))
        ax.set_yticklabels([f"D{i+1}" for i in range(rows)], color=TEXT_MUTED, fontsize=8)
        ax.set_title("HEATMAP DE FREQUÊNCIAS", color=ACCENT_GOLD,
                     fontsize=12, fontweight="bold", pad=12)
        fig.colorbar(im, ax=ax, label="Frequência").ax.yaxis.label.set_color(TEXT_MUTED)

    def _chart_histogram(self, fig):
        ax = fig.add_subplot(111, facecolor=BG_PANEL)
        freq_df = self.engine.frequency_analysis().sort_values("numero")
        max_f = freq_df["frequencia"].max()

        colors = [plt.cm.YlOrRd(0.2 + 0.8 * f / max_f) for f in freq_df["frequencia"]]
        ax.bar(freq_df["numero"], freq_df["frequencia"],
               color=colors, edgecolor=BG_DARK, linewidth=0.3, width=0.8)

        mean_f = freq_df["frequencia"].mean()
        ax.axhline(mean_f, color=ACCENT_BLUE, linestyle="--", linewidth=1.5,
                   label=f"Média: {mean_f:.1f}")
        ax.legend(facecolor=BG_CARD, edgecolor=BORDER, labelcolor=TEXT_PRIMARY)

        ax.set_title("DISTRIBUIÇÃO DE FREQUÊNCIAS", color=ACCENT_GOLD,
                     fontsize=12, fontweight="bold")
        ax.set_xlabel("Número", color=TEXT_MUTED)
        ax.set_ylabel("Frequência", color=TEXT_MUTED)
        ax.tick_params(colors=TEXT_MUTED)
        ax.spines[:].set_color(BORDER)
        ax.grid(axis="y", color=BORDER, alpha=0.4)

    def _chart_parity(self, fig):
        parity = self.engine.parity_analysis()
        ax = fig.add_subplot(111, facecolor=BG_PANEL)
        x = range(len(parity))
        ax.fill_between(x, parity["pares"], alpha=0.7, color=ACCENT_TEAL, label="Pares")
        ax.fill_between(x, parity["impares"], alpha=0.7, color=ACCENT_ROSE, label="Ímpares")
        ax.set_title("PAR vs ÍMPAR POR SORTEIO", color=ACCENT_GOLD,
                     fontsize=12, fontweight="bold")
        ax.set_xlabel("Sorteio", color=TEXT_MUTED)
        ax.set_ylabel("Quantidade", color=TEXT_MUTED)
        ax.legend(facecolor=BG_CARD, edgecolor=BORDER, labelcolor=TEXT_PRIMARY)
        ax.tick_params(colors=TEXT_MUTED)
        ax.spines[:].set_color(BORDER)
        ax.grid(color=BORDER, alpha=0.3)

        # Pie inset
        ax2 = fig.add_axes([0.75, 0.65, 0.2, 0.25], facecolor=BG_PANEL)
        totals = [parity["pares"].sum(), parity["impares"].sum()]
        ax2.pie(totals, labels=["Pares","Ímpares"],
                colors=[ACCENT_TEAL, ACCENT_ROSE], autopct="%1.1f%%",
                textprops={"color": TEXT_PRIMARY, "fontsize": 8})

    def _chart_sums(self, fig):
        sums = self.engine.sum_analysis()
        ax = fig.add_subplot(111, facecolor=BG_PANEL)
        n, bins, patches = ax.hist(sums, bins=30, color=ACCENT_PURP,
                                    edgecolor=BG_DARK, alpha=0.8)

        # Fit normal
        mu, sigma = sums.mean(), sums.std()
        x = np.linspace(sums.min(), sums.max(), 200)
        y = stats.norm.pdf(x, mu, sigma) * len(sums) * (bins[1] - bins[0])
        ax.plot(x, y, color=ACCENT_GOLD, linewidth=2, label=f"Normal(μ={mu:.0f}, σ={sigma:.0f})")
        ax.axvline(mu, color=ACCENT_ROSE, linestyle="--", linewidth=1.5,
                   label=f"Média: {mu:.1f}")

        ax.set_title("DISTRIBUIÇÃO DA SOMA DOS SORTEIOS", color=ACCENT_GOLD,
                     fontsize=12, fontweight="bold")
        ax.set_xlabel("Soma dos Números", color=TEXT_MUTED)
        ax.set_ylabel("Frequência", color=TEXT_MUTED)
        ax.legend(facecolor=BG_CARD, edgecolor=BORDER, labelcolor=TEXT_PRIMARY)
        ax.tick_params(colors=TEXT_MUTED)
        ax.spines[:].set_color(BORDER)
        ax.grid(color=BORDER, alpha=0.3)

    def _chart_delay(self, fig):
        delays = self.engine.delay_analysis()
        ax = fig.add_subplot(111, facecolor=BG_PANEL)
        nums = list(delays.keys())
        vals = [delays[n] for n in nums]
        colors = [ACCENT_ROSE if v > np.percentile(vals, 75) else
                  ACCENT_TEAL if v < np.percentile(vals, 25) else ACCENT_PURP
                  for v in vals]
        ax.bar(nums, vals, color=colors, edgecolor=BG_DARK, linewidth=0.3)
        ax.set_title("MAPA DE ATRASOS (sorteios desde última aparição)",
                     color=ACCENT_GOLD, fontsize=12, fontweight="bold")
        ax.set_xlabel("Número", color=TEXT_MUTED)
        ax.set_ylabel("Atraso (sorteios)", color=TEXT_MUTED)
        ax.tick_params(colors=TEXT_MUTED)
        ax.spines[:].set_color(BORDER)
        ax.grid(axis="y", color=BORDER, alpha=0.3)

        legend = [mpatches.Patch(color=ACCENT_ROSE, label="Alto atraso"),
                  mpatches.Patch(color=ACCENT_PURP, label="Médio"),
                  mpatches.Patch(color=ACCENT_TEAL, label="Baixo atraso")]
        ax.legend(handles=legend, facecolor=BG_CARD, edgecolor=BORDER,
                  labelcolor=TEXT_PRIMARY)

    def _chart_markov(self, fig):
        matrix = self.engine.markov_transition()
        ax = fig.add_subplot(111, facecolor=BG_PANEL)
        n_dec = matrix.shape[0]
        cmap = LinearSegmentedColormap.from_list("m", [BG_PANEL, ACCENT_TEAL, ACCENT_GOLD])
        im = ax.imshow(matrix, cmap=cmap, vmin=0, vmax=1)
        labels = [f"D{i+1}" for i in range(n_dec)]
        ax.set_xticks(range(n_dec)); ax.set_xticklabels(labels, color=TEXT_MUTED)
        ax.set_yticks(range(n_dec)); ax.set_yticklabels(labels, color=TEXT_MUTED)
        ax.set_title("MATRIZ DE TRANSIÇÃO DE MARKOV (por Dezena)",
                     color=ACCENT_GOLD, fontsize=12, fontweight="bold")
        ax.set_xlabel("Dezena destino", color=TEXT_MUTED)
        ax.set_ylabel("Dezena origem", color=TEXT_MUTED)
        for i in range(n_dec):
            for j in range(n_dec):
                ax.text(j, i, f"{matrix[i][j]:.2f}", ha="center", va="center",
                        fontsize=8, color="white" if matrix[i][j] > 0.4 else TEXT_MUTED)
        fig.colorbar(im, ax=ax).ax.yaxis.label.set_color(TEXT_MUTED)

    # ── Tab: Predição ─────────────────────────────────────────────────────
    def _build_predict_tab(self):
        left = tk.Frame(self.tab_predict, bg=BG_CARD, width=320)
        left.pack(side="left", fill="y", padx=(10,0), pady=10)
        left.pack_propagate(False)

        tk.Label(left, text="⚙  CONFIGURAÇÕES", bg=BG_CARD, fg=ACCENT_GOLD,
                 font=("Courier New", 11, "bold")).pack(pady=(20,15), padx=20, anchor="w")

        # Estratégia
        tk.Label(left, text="Estratégia:", bg=BG_CARD, fg=TEXT_MUTED,
                 font=("Courier New", 9)).pack(anchor="w", padx=20)

        self.strat_var = tk.StringVar(value="balanced")
        strategies = [
            ("balanced", "⚖  Balanceada (Recomendada)"),
            ("hot",      "🔥 Números Quentes"),
            ("cold",     "❄️  Números Frios"),
            ("delay",    "⧖  Por Atraso"),
            ("poisson",  "λ  Distribuição Poisson"),
        ]
        for val, lbl in strategies:
            tk.Radiobutton(left, text=lbl, variable=self.strat_var, value=val,
                           bg=BG_CARD, fg=TEXT_PRIMARY, selectcolor=BG_PANEL,
                           activebackground=BG_CARD,
                           font=("Courier New", 9)).pack(anchor="w", padx=25, pady=3)

        ttk.Separator(left, orient="horizontal").pack(fill="x", padx=20, pady=15)

        tk.Label(left, text="Quantidade de números:", bg=BG_CARD, fg=TEXT_MUTED,
                 font=("Courier New", 9)).pack(anchor="w", padx=20)
        self.n_nums_var = tk.IntVar(value=6)
        spin = tk.Spinbox(left, from_=3, to=20, textvariable=self.n_nums_var,
                          bg=BG_PANEL, fg=TEXT_PRIMARY, insertbackground=TEXT_PRIMARY,
                          font=("Courier New", 11), width=5, relief="flat")
        spin.pack(anchor="w", padx=25, pady=5)

        ttk.Separator(left, orient="horizontal").pack(fill="x", padx=20, pady=10)

        tk.Label(left, text="Jogos a gerar:", bg=BG_CARD, fg=TEXT_MUTED,
                 font=("Courier New", 9)).pack(anchor="w", padx=20)
        self.n_games_var = tk.IntVar(value=5)
        spin2 = tk.Spinbox(left, from_=1, to=50, textvariable=self.n_games_var,
                           bg=BG_PANEL, fg=TEXT_PRIMARY, insertbackground=TEXT_PRIMARY,
                           font=("Courier New", 11), width=5, relief="flat")
        spin2.pack(anchor="w", padx=25, pady=5)

        self._btn(left, "  🎲  GERAR PREDIÇÕES", self._run_prediction,
                  ACCENT_GOLD).pack(pady=20, padx=20, fill="x")

        # Right side: results
        self.pred_right = tk.Frame(self.tab_predict, bg=BG_DARK)
        self.pred_right.pack(side="left", fill="both", expand=True, padx=10, pady=10)

        tk.Label(self.pred_right,
                 text="⬡  Configure e clique em GERAR PREDIÇÕES",
                 bg=BG_DARK, fg=TEXT_MUTED,
                 font=("Courier New", 11)).pack(pady=60)

    def _run_prediction(self):
        if self.engine.df is None:
            messagebox.showwarning("Atenção", "Importe dados primeiro.")
            return

        for w in self.pred_right.winfo_children(): w.destroy()

        strat = self.strat_var.get()
        n     = self.n_nums_var.get()
        games = self.n_games_var.get()

        strat_names = {
            "balanced": "⚖  BALANCEADA",
            "hot":      "🔥 QUENTES",
            "cold":     "❄️  FRIOS",
            "delay":    "⧖  ATRASO",
            "poisson":  "λ  POISSON",
        }

        # Header
        hdr = tk.Frame(self.pred_right, bg=BG_CARD,
                       highlightbackground=ACCENT_GOLD, highlightthickness=1)
        hdr.pack(fill="x", pady=(0,15))
        tk.Label(hdr,
                 text=f"  PREDIÇÕES  ·  ESTRATÉGIA: {strat_names[strat]}  ·  {games} JOGOS",
                 bg=BG_CARD, fg=ACCENT_GOLD,
                 font=("Courier New", 11, "bold")).pack(pady=12, padx=15)

        freq_df = self.engine.frequency_analysis()
        freq_map = dict(zip(freq_df["numero"], freq_df["frequencia"]))
        hot, cold = self.engine.hot_cold_numbers(10)
        delays = self.engine.delay_analysis()

        canvas_frame = tk.Frame(self.pred_right, bg=BG_DARK)
        canvas_frame.pack(fill="both", expand=True)
        canvas_inner = tk.Canvas(canvas_frame, bg=BG_DARK, highlightthickness=0)
        vsb = ttk.Scrollbar(canvas_frame, orient="vertical", command=canvas_inner.yview)
        canvas_inner.configure(yscrollcommand=vsb.set)
        vsb.pack(side="right", fill="y")
        canvas_inner.pack(side="left", fill="both", expand=True)

        inner = tk.Frame(canvas_inner, bg=BG_DARK)
        canvas_inner.create_window((0,0), window=inner, anchor="nw")
        inner.bind("<Configure>",
                   lambda e: canvas_inner.configure(
                       scrollregion=canvas_inner.bbox("all")))

        for g in range(games):
            nums = self.engine.predict_numbers(strat, n)
            game_frame = tk.Frame(inner, bg=BG_CARD,
                                  highlightbackground=BORDER, highlightthickness=1)
            game_frame.pack(fill="x", pady=6, padx=5)

            tk.Label(game_frame, text=f"  JOGO {g+1:02d}",
                     bg=BG_CARD, fg=TEXT_MUTED,
                     font=("Courier New", 9, "bold")).pack(side="left", padx=10)

            balls_frame = tk.Frame(game_frame, bg=BG_CARD)
            balls_frame.pack(side="left", pady=8, padx=5)

            sum_val = sum(nums)
            n_even = sum(1 for x in nums if x % 2 == 0)

            for num in nums:
                if num in hot:    col = ACCENT_GOLD
                elif num in cold: col = ACCENT_BLUE
                else:             col = ACCENT_PURP

                ball = tk.Frame(balls_frame, bg=col, width=44, height=44)
                ball.pack_propagate(False)
                ball.pack(side="left", padx=4)
                tk.Label(ball, text=str(num), bg=col, fg=BG_DARK,
                         font=("Courier New", 13, "bold")).pack(expand=True)

            # Stats inline
            stats_txt = (f"   Σ={sum_val}   "
                         f"Pares={n_even}   "
                         f"Ímpares={n-n_even}   "
                         f"Freq.média={sum(freq_map.get(x,0) for x in nums)/n:.1f}")
            tk.Label(game_frame, text=stats_txt, bg=BG_CARD, fg=TEXT_MUTED,
                     font=("Courier New", 9)).pack(side="left", padx=10)

        # Legend
        leg = tk.Frame(inner, bg=BG_DARK)
        leg.pack(anchor="w", padx=10, pady=10)
        for col, lbl in [(ACCENT_GOLD,"🔥 Quente"), (ACCENT_BLUE,"❄️ Frio"),
                          (ACCENT_PURP,"◌ Normal")]:
            dot = tk.Frame(leg, bg=col, width=14, height=14)
            dot.pack(side="left")
            tk.Label(leg, text=f" {lbl}   ", bg=BG_DARK, fg=TEXT_MUTED,
                     font=("Courier New", 9)).pack(side="left")

    # ── Tab: Avançado ────────────────────────────────────────────────────
    def _build_advanced_tab(self):
        top = tk.Frame(self.tab_advanced, bg=BG_DARK)
        top.pack(fill="x", padx=20, pady=10)
        tk.Label(top, text="ANÁLISE ESTATÍSTICA AVANÇADA", bg=BG_DARK, fg=ACCENT_GOLD,
                 font=("Courier New", 13, "bold")).pack(side="left")

        self.adv_frame = tk.Frame(self.tab_advanced, bg=BG_DARK)
        self.adv_frame.pack(fill="both", expand=True, padx=10)
        tk.Label(self.adv_frame,
                 text="⬡  Importe dados para ver análises avançadas",
                 bg=BG_DARK, fg=TEXT_MUTED,
                 font=("Courier New", 11)).pack(pady=60)

    def _update_advanced(self):
        for w in self.adv_frame.winfo_children(): w.destroy()

        # Create 2x3 grid of charts
        fig = Figure(figsize=(13, 8), facecolor=BG_DARK)
        gs  = gridspec.GridSpec(2, 3, figure=fig,
                                hspace=0.45, wspace=0.35)

        # 1) Frequência por dezena
        ax1 = fig.add_subplot(gs[0, 0], facecolor=BG_PANEL)
        decades = {}
        for n in range(1, self.engine.max_number + 1):
            d = (n - 1) // 10
            decades[d] = decades.get(d, 0) + self.engine.freq.get(n, 0)
        dk = sorted(decades.keys())
        ax1.bar([f"D{k+1}" for k in dk], [decades[k] for k in dk],
                color=ACCENT_TEAL, edgecolor=BG_DARK)
        ax1.set_title("Freq. por Dezena", color=ACCENT_GOLD, fontsize=9, fontweight="bold")
        ax1.tick_params(colors=TEXT_MUTED, labelsize=7)
        ax1.spines[:].set_color(BORDER)

        # 2) Boxplot das frequências
        ax2 = fig.add_subplot(gs[0, 1], facecolor=BG_PANEL)
        freqs = [self.engine.freq.get(n, 0) for n in range(1, self.engine.max_number + 1)]
        bp = ax2.boxplot(freqs, vert=True, patch_artist=True,
                         medianprops={"color": ACCENT_GOLD, "linewidth": 2},
                         boxprops={"facecolor": ACCENT_PURP, "alpha": 0.7},
                         whiskerprops={"color": TEXT_MUTED},
                         capprops={"color": TEXT_MUTED},
                         flierprops={"marker": "o", "color": ACCENT_ROSE, "markersize": 4})
        ax2.set_title("Boxplot Frequências", color=ACCENT_GOLD, fontsize=9, fontweight="bold")
        ax2.tick_params(colors=TEXT_MUTED, labelsize=7)
        ax2.spines[:].set_color(BORDER)

        # 3) QQ-Plot das frequências
        ax3 = fig.add_subplot(gs[0, 2], facecolor=BG_PANEL)
        (osm, osr), (slope, intercept, r) = stats.probplot(freqs)
        ax3.plot(osm, osr, "o", color=ACCENT_TEAL, markersize=3, alpha=0.7)
        ax3.plot(osm, slope * np.array(osm) + intercept, color=ACCENT_GOLD, linewidth=1.5)
        ax3.set_title(f"Q-Q Plot (R²={r**2:.3f})", color=ACCENT_GOLD, fontsize=9, fontweight="bold")
        ax3.tick_params(colors=TEXT_MUTED, labelsize=7)
        ax3.spines[:].set_color(BORDER)

        # 4) Soma ao longo do tempo
        ax4 = fig.add_subplot(gs[1, 0], facecolor=BG_PANEL)
        sums = self.engine.sum_analysis()
        ax4.plot(range(len(sums)), sums, color=ACCENT_PURP, linewidth=0.8, alpha=0.8)
        roll = pd.Series(sums.values).rolling(10).mean()
        ax4.plot(range(len(roll)), roll, color=ACCENT_GOLD, linewidth=2, label="Média móv. 10")
        ax4.set_title("Soma ao Longo do Tempo", color=ACCENT_GOLD, fontsize=9, fontweight="bold")
        ax4.tick_params(colors=TEXT_MUTED, labelsize=7)
        ax4.spines[:].set_color(BORDER)
        ax4.legend(fontsize=7, facecolor=BG_CARD, labelcolor=TEXT_PRIMARY, edgecolor=BORDER)

        # 5) Consecutivos
        ax5 = fig.add_subplot(gs[1, 1], facecolor=BG_PANEL)
        consec = self.engine.consecutive_analysis()
        vals, counts = np.unique(consec, return_counts=True)
        ax5.bar(vals, counts, color=ACCENT_ROSE, edgecolor=BG_DARK)
        ax5.set_title("Pares Consecutivos/Sorteio", color=ACCENT_GOLD, fontsize=9, fontweight="bold")
        ax5.tick_params(colors=TEXT_MUTED, labelsize=7)
        ax5.spines[:].set_color(BORDER)

        # 6) Chi² info
        ax6 = fig.add_subplot(gs[1, 2], facecolor=BG_PANEL)
        ax6.axis("off")
        chi2, p = self.engine.chi2_test()
        _, λ = self.engine.poisson_expected()
        s = self.engine.statistics_summary()

        info = [
            ["TESTE QUI-QUADRADO", ""],
            [f"χ² estatística", f"{chi2:.4f}"],
            [f"p-valor", f"{p:.6f}"],
            [f"α = 0.05", f"{'Uniforme ✓' if p > 0.05 else 'Não Uniforme ✗'}"],
            ["", ""],
            ["POISSON", ""],
            [f"λ (esperado/num)", f"{λ:.2f}"],
            ["", ""],
            ["RESUMO", ""],
            [f"Assimetria soma", f"{pd.Series(self.engine.sum_analysis().values).skew():.4f}"],
            [f"Curtose soma", f"{pd.Series(self.engine.sum_analysis().values).kurt():.4f}"],
            [f"Média pares/sort.", f"{s['media_pares']:.2f}"],
        ]
        y = 0.97
        for row in info:
            if row[1] == "":
                ax6.text(0.05, y, row[0], color=ACCENT_GOLD, fontsize=8,
                         fontweight="bold", transform=ax6.transAxes)
            else:
                ax6.text(0.05, y, row[0], color=TEXT_MUTED, fontsize=8,
                         transform=ax6.transAxes)
                ax6.text(0.65, y, row[1], color=ACCENT_TEAL, fontsize=8,
                         fontweight="bold", transform=ax6.transAxes)
            y -= 0.082

        ax6.set_title("Testes Estatísticos", color=ACCENT_GOLD, fontsize=9, fontweight="bold")

        canvas = FigureCanvasTkAgg(fig, self.adv_frame)
        canvas.draw()
        canvas.get_tk_widget().pack(fill="both", expand=True)

    # ── Load callbacks ────────────────────────────────────────────────────
    def _load_csv(self):
        path = filedialog.askopenfilename(
            title="Abrir CSV de Loteria",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")])
        if path: self._load_file(path, "csv")

    def _load_json(self):
        path = filedialog.askopenfilename(
            title="Abrir JSON de Loteria",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")])
        if path: self._load_file(path, "json")

    def _load_demo(self):
        demo = os.path.join(os.path.dirname(os.path.abspath(__file__)), "loteria_sample.csv")
        if os.path.exists(demo):
            self._load_file(demo, "csv")
        else:
            messagebox.showerror("Erro", "Arquivo demo não encontrado.")

    def _load_file(self, path, fmt):
        try:
            if fmt == "csv":
                self.engine.load_csv(path)
            else:
                self.engine.load_json(path)

            fname = os.path.basename(path)
            n = len(self.engine.df)
            self.status_var.set(
                f"✓  {fname}  ·  {n} sorteios  ·  "
                f"{len(self.engine.number_cols)} números/sorteio  ·  "
                f"Universo: 1–{self.engine.max_number}")

            self._update_overview()
            self._refresh_freq_table()
            self._render_chart()
            self._update_advanced()

            self.notebook.select(0)
            messagebox.showinfo("✓ Dados carregados",
                                f"Arquivo: {fname}\n"
                                f"Sorteios: {n}\n"
                                f"Números por sorteio: {len(self.engine.number_cols)}\n"
                                f"Universo: 1 – {self.engine.max_number}")
        except Exception as e:
            messagebox.showerror("Erro ao importar", str(e))


# ─── ENTRY POINT ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = LotteryApp()
    app.mainloop()