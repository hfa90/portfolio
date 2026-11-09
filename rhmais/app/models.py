"""Modelos de dados."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict

MODALIDADES = ["Presencial", "Híbrido", "Remoto"]
SENIORIDADES = ["Estágio", "Júnior", "Pleno", "Sênior", "Especialista", "Gestão"]
STATUS_PIPELINE = [
    "Sugerida", "Enviada ao candidato", "Candidatura feita",
    "Entrevista", "Proposta", "Contratado", "Descartada",
]
UFS = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
    "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]


@dataclass
class Candidato:
    id: int | None = None
    nome: str = ""
    email: str = ""
    telefone: str = ""
    cargo_desejado: str = ""
    cargos_alternativos: str = ""          # separados por vírgula
    skills: str = ""                       # separados por vírgula
    senioridade: str = ""
    cidade: str = ""
    uf: str = ""
    modalidades: str = "Presencial,Híbrido,Remoto"
    pretensao_salarial: float = 0.0
    aceita_mudanca: int = 0
    resumo: str = ""
    criado_em: str = ""

    def lista(self, campo: str) -> list[str]:
        return [p.strip() for p in (getattr(self, campo) or "").split(",") if p.strip()]

    @property
    def cargos(self) -> list[str]:
        return [c for c in [self.cargo_desejado.strip(), *self.lista("cargos_alternativos")] if c]

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Vaga:
    titulo: str
    empresa: str = ""
    url: str = ""
    fonte: str = ""
    cidade: str = ""
    uf: str = ""
    modalidade: str = ""                   # Presencial | Híbrido | Remoto | ""
    senioridade: str = ""
    salario: str = ""
    contrato: str = ""                     # CLT, PJ, Estágio...
    descricao: str = ""
    tags: list[str] = field(default_factory=list)
    publicada_em: str = ""                 # ISO yyyy-mm-dd
    # preenchidos pelo motor de compatibilidade
    score: float = 0.0
    detalhes_score: dict = field(default_factory=dict)

    @property
    def local(self) -> str:
        if self.modalidade == "Remoto" and not self.cidade:
            return "Remoto"
        partes = [p for p in (self.cidade, self.uf) if p]
        return " / ".join(partes) or "Não informado"

    def to_dict(self) -> dict:
        d = asdict(self)
        d["tags"] = ",".join(self.tags)
        return d
