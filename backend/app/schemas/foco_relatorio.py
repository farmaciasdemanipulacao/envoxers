from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class FocoRelatorioResumo(BaseModel):
    periodo_inicio: date
    periodo_fim: date
    total_min: float
    total_sessoes: int
    pessoas_com_foco: int
    dias_com_registro: int
    media_sessao_min: float
    media_dia_min: float
    registros_ajustados: int
    ativos_agora: int


class FocoRelatorioPessoa(BaseModel):
    envoxer_id: int
    nome: str
    cargo: Optional[str] = None
    foto_url: Optional[str] = None
    total_min: float
    sessoes: int
    dias_com_foco: int
    media_dia_min: float
    media_sessao_min: float
    operacao_min: float
    comercial_min: float
    avulsa_min: float
    registros_ajustados: int
    ultimo_inicio: Optional[datetime] = None
    ativo_agora: bool = False


class FocoRelatorioOrigem(BaseModel):
    origem: str
    label: str
    total_min: float
    sessoes: int
    percentual: float


class FocoRelatorioContexto(BaseModel):
    contexto: str
    origem: str
    total_min: float
    sessoes: int
    percentual: float


class FocoRelatorioDia(BaseModel):
    data: date
    total_min: float
    sessoes: int
    pessoas: int


class FocoRelatorioRegistro(BaseModel):
    id: int
    envoxer_id: int
    envoxer_nome: str
    origem: str
    contexto: Optional[str] = None
    titulo: Optional[str] = None
    inicio: datetime
    fim: datetime
    duracao_min: float
    duracao_segundos: int = 0
    duracao_pausada_min: float
    duracao_pausada_segundos: int = 0
    comentario: Optional[str] = None
    ajustado: bool = False
    ajustes_admin: list[dict] = Field(default_factory=list)




class FocoRelatorioRegistroAjuste(BaseModel):
    duracao_min: int = Field(ge=0, le=1440)
    duracao_pausada_min: int = Field(ge=0, le=1440)
    motivo: Optional[str] = Field(default=None, max_length=1000)


class FocoRelatorioPessoaOpcao(BaseModel):
    id: int
    nome: str


class FocoRelatorioResponse(BaseModel):
    resumo: FocoRelatorioResumo
    equipe: list[FocoRelatorioPessoa]
    origens: list[FocoRelatorioOrigem]
    contextos: list[FocoRelatorioContexto]
    dias: list[FocoRelatorioDia]
    registros: list[FocoRelatorioRegistro]
    pessoas_opcoes: list[FocoRelatorioPessoaOpcao]
