"""RBAC + escopo ABAC. O cliente nunca recebe capacidades de administrador interno."""
from typing import Any

PAPEIS = {
    "consulta": frozenset({"ver_proprias"}),
    "solicitante": frozenset({"ver_proprias", "solicitar", "comentar"}),
    "aprovador": frozenset({"ver_proprias", "ver_unidades", "comentar", "aprovar"}),
    "gestor_regional": frozenset({"ver_proprias", "ver_unidades", "solicitar", "comentar", "relatorios"}),
    "gestor_geral": frozenset({"ver_proprias", "ver_todas", "solicitar", "comentar", "relatorios"}),
    "admin_institucional": frozenset({"ver_proprias", "ver_todas", "solicitar", "comentar", "relatorios", "gerenciar_usuarios"}),
}

def capacidades(papel: str, extras: dict[str, Any] | None = None) -> set[str]:
    base = set(PAPEIS.get(papel, PAPEIS["consulta"]))
    # Extras só restringem, nunca concedem acesso acima do papel.
    for nome, valor in (extras or {}).items():
        if valor is False:
            base.discard(nome)
    return base

def pode(papel: str, acao: str, extras: dict | None = None) -> bool:
    return acao in capacidades(papel, extras)

def pode_ver_solicitacao(papel: str, contato_id: int, criador_id: int | None, unidade_id: int | None, unidades: set[int], extras: dict | None = None) -> bool:
    caps = capacidades(papel, extras)
    if "ver_todas" in caps:
        return True
    if criador_id is not None and criador_id == contato_id and "ver_proprias" in caps:
        return True
    return "ver_unidades" in caps and unidade_id is not None and unidade_id in unidades
