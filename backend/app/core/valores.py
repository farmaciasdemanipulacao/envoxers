"""Helpers pra restringir campos monetários por papel.

Duas famílias, D-090 (só admin) e D-10x (admin+gestor, só envoxer fica sem ver
— reforma pedida pelo Gus: colaborador não vê nenhum R$/% de margem em lugar
nenhum, mas gestor passa a ter paridade com admin na maioria das telas).
Salário/custo-hora (dado de RH, `routes/envoxers.py`) é a EXCEÇÃO deliberada
que continua na família "só admin" mesmo depois da reforma — decisão explícita
do Gus, mais sensível que valor de contrato de cliente.
"""
from app.models.envoxer import Envoxer


def eh_admin(envoxer: Envoxer) -> bool:
    return envoxer.permissao == "admin"


def eh_admin_ou_gestor(envoxer: Envoxer) -> bool:
    return envoxer.permissao in ("admin", "gestor")


def redigir(obj, campos: list[str], envoxer: Envoxer) -> None:
    """Zera in-place os atributos `campos` de um schema Pydantic (mutável) se o
    envoxer não for admin — família restrita (só admin), usar só pra salário/custo-hora."""
    if eh_admin(envoxer):
        return
    for campo in campos:
        setattr(obj, campo, None)


def redigir_dict(dados: dict, campos: list[str], envoxer: Envoxer) -> dict:
    """Mesma coisa que `redigir`, mas pra dict puro (rotas que retornam dict, não schema)."""
    if eh_admin(envoxer):
        return dados
    for campo in campos:
        if campo in dados:
            dados[campo] = None
    return dados


def redigir_gestor(obj, campos: list[str], envoxer: Envoxer) -> None:
    """Como `redigir`, mas família admin+gestor — usar pra valor de contrato, MRR,
    margem, ticket etc. (tudo que não é salário). Envoxer não vê, o resto vê."""
    if eh_admin_ou_gestor(envoxer):
        return
    for campo in campos:
        setattr(obj, campo, None)


def redigir_gestor_dict(dados: dict, campos: list[str], envoxer: Envoxer) -> dict:
    if eh_admin_ou_gestor(envoxer):
        return dados
    for campo in campos:
        if campo in dados:
            dados[campo] = None
    return dados
