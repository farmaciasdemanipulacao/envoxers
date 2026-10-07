"""Helpers para restringir campos monetários.

Regra vigente: salário, custo/hora, contrato, MRR, ticket, margem e qualquer
valor financeiro do negócio são visíveis apenas para admin.
"""
from app.models.envoxer import Envoxer

def eh_admin(envoxer: Envoxer) -> bool:
    return envoxer.permissao == "admin"

def eh_admin_ou_gestor(envoxer: Envoxer) -> bool:
    # Mantido por compatibilidade com imports antigos. Dados financeiros não usam
    # mais este helper para liberar gestor.
    return envoxer.permissao in ("admin", "gestor")

def redigir(obj, campos: list[str], envoxer: Envoxer) -> None:
    if eh_admin(envoxer):
        return
    for campo in campos:
        setattr(obj, campo, None)

def redigir_dict(dados: dict, campos: list[str], envoxer: Envoxer) -> dict:
    if eh_admin(envoxer):
        return dados
    for campo in campos:
        if campo in dados:
            dados[campo] = None
    return dados

def redigir_gestor(obj, campos: list[str], envoxer: Envoxer) -> None:
    # Nome histórico; regra atual é admin-only.
    redigir(obj, campos, envoxer)

def redigir_gestor_dict(dados: dict, campos: list[str], envoxer: Envoxer) -> dict:
    return redigir_dict(dados, campos, envoxer)
