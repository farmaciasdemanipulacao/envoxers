"""Autorização do Portal: dois perfis novos, vínculos de áreas e aprovação opcional.

Admin/Gestor SECOVI vê toda SUA organização; solicitante enxerga a união das
regionais e frentes que lhe foram atribuídas. Não existe cargo regional.
O gestor interno do Envoxers usa outra autenticação, fora deste módulo.
Perfis legados permanecem reconhecidos para evitar bloqueio abrupto na migração.
"""
from typing import Any

PAPEIS = {
    "admin_institucional": frozenset({"ver_todas", "solicitar", "comentar", "aprovar", "relatorios", "gerenciar_usuarios"}),
    "solicitante": frozenset({"ver_unidades", "solicitar", "comentar"}),
    # Compatibilidade transitória. Não oferecer como novos perfis na UI.
    "consulta": frozenset({"ver_proprias"}),
    "aprovador": frozenset({"ver_unidades", "comentar", "aprovar"}),
    "gestor_regional": frozenset({"ver_unidades", "solicitar", "comentar", "relatorios"}),
    "gestor_geral": frozenset({"ver_todas", "solicitar", "comentar", "relatorios"}),
}


def capacidades(papel: str, extras: dict[str, Any] | None = None) -> set[str]:
    base = set(PAPEIS.get(papel, PAPEIS["consulta"]))
    extras = extras or {}
    # ÚNICA permissão acrescentável para o solicitante: aprovar demandas de
    # suas áreas. As demais permissões somente podem ser restringidas.
    if papel == "solicitante" and extras.get("aprovar") is True:
        base.add("aprovar")
    for nome, valor in extras.items():
        if valor is False:
            base.discard(nome)
    return base


def pode(papel: str, acao: str, extras: dict | None = None) -> bool:
    return acao in capacidades(papel, extras)


def pode_ver_solicitacao(
    papel: str,
    contato_id: int,
    criador_id: int | None,
    unidade_id: int | None,
    unidades: set[int],
    extras: dict | None = None,
    frente_id: int | None = None,
) -> bool:
    caps = capacidades(papel, extras)
    if "ver_todas" in caps:
        return True
    if "ver_unidades" in caps:
        # União de áreas autorizadas: Maringá OU Secovimed, sem limitar ao autor.
        # A consulta SQL aplica o mesmo critério, sempre dentro do cliente_id.
        return (unidade_id is not None and unidade_id in unidades) or (
            frente_id is not None and frente_id in unidades
        )
    return criador_id is not None and criador_id == contato_id and "ver_proprias" in caps
