"""Registro dos conectores de vagas. Para adicionar um portal, crie uma subclasse de
`Fonte` e inclua-a em FONTES."""
from .base import Filtros, Fonte, FonteErro
from .outras import Adzuna, GitHubBR, Himalayas, Jooble, Remotive
from .portais_br import Gupy, InfoJobs, Programathor, VagasCom

FONTES: dict[str, type[Fonte]] = {cls.id: cls for cls in (
    Gupy, VagasCom, InfoJobs, Programathor, GitHubBR, Remotive, Himalayas, Adzuna, Jooble,
)}

__all__ = ["FONTES", "Filtros", "Fonte", "FonteErro"]
