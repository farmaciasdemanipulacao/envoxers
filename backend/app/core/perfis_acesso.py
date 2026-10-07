MODULOS_MENU = (
    "chat",
    "comercial",
    "operacao",
    "entregas",
    "farol",
    "icp",
    "desenvolvimento",
    "admin",
    "configuracoes",
)

MODULOS_PADRAO = {
    "admin": list(MODULOS_MENU),
    "gestor": ["chat","comercial","operacao","entregas","farol","icp","desenvolvimento","admin","configuracoes"],
    "envoxer": ["chat","comercial","operacao","entregas","farol","icp","desenvolvimento","configuracoes"],
    "comercial": ["chat","comercial","operacao"],
}

MODULOS_MAXIMOS = {
    "admin": set(MODULOS_MENU),
    "gestor": {"chat","comercial","operacao","entregas","farol","icp","desenvolvimento","admin","configuracoes"},
    "envoxer": {"chat","comercial","operacao","entregas","farol","icp","desenvolvimento","configuracoes"},
    "comercial": {"chat","comercial","operacao"},
}

def modulos_padrao(nivel_base: str) -> list[str]:
    return list(MODULOS_PADRAO.get(nivel_base, MODULOS_PADRAO["envoxer"]))

def validar_modulos(nivel_base: str, modulos: list[str]) -> list[str]:
    if nivel_base not in MODULOS_MAXIMOS:
        raise ValueError("Nível-base inválido")
    maximos = MODULOS_MAXIMOS[nivel_base]
    normalizados = []
    vistos = set()
    for modulo in modulos:
        if modulo not in maximos:
            raise ValueError(f'Módulo "{modulo}" não é permitido para o nível-base {nivel_base}')
        if modulo not in vistos:
            vistos.add(modulo)
            normalizados.append(modulo)
    if nivel_base == "admin" and "configuracoes" not in vistos:
        normalizados.append("configuracoes")
    return normalizados
