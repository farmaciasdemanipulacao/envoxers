"""F4 — geração automática de pares ao abrir um CicloAvaliacao (D-121).

Sem scheduler, mesmo padrão do resto do projeto — roda uma vez, na hora que o
ciclo é aberto (POST /ciclos/{id}/abrir), não recalcula depois.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.envoxer import Envoxer
from app.models.avaliacao_360 import Avaliacao360
from app.models.avaliacao_180 import Avaliacao180
from app.models.ciclo_avaliacao import CicloAvaliacao


async def _envoxers_ativos(db: AsyncSession) -> list[Envoxer]:
    result = await db.execute(select(Envoxer).where(Envoxer.ativo.is_(True)))
    return list(result.scalars().all())


async def gerar_pares_360(db: AsyncSession, ciclo: CicloAvaliacao) -> int:
    """Todo envoxer ativo avalia todo envoxer ativo, incluindo autoavaliação
    (decisão do Gus: "todo mundo avalia todo mundo", D-121)."""
    pessoas = await _envoxers_ativos(db)
    existentes = await db.execute(select(Avaliacao360.avaliador_id, Avaliacao360.avaliado_id).where(Avaliacao360.ciclo_id == ciclo.id))
    pares_existentes = {(a, b) for a, b in existentes.all()}

    criados = 0
    for avaliador in pessoas:
        for avaliado in pessoas:
            if (avaliador.id, avaliado.id) in pares_existentes:
                continue
            db.add(Avaliacao360(ciclo_id=ciclo.id, avaliador_id=avaliador.id, avaliado_id=avaliado.id))
            criados += 1
    await db.flush()
    return criados


async def gerar_pares_180(db: AsyncSession, ciclo: CicloAvaliacao) -> int:
    """Mão dupla via gestor_responsavel_id: quem tem gestor responsável definido
    (e o gestor está ativo) ganha os 2 sentidos de avaliação nesse ciclo."""
    pessoas = await _envoxers_ativos(db)
    ativos_por_id = {p.id: p for p in pessoas}
    existentes = await db.execute(select(Avaliacao180.avaliador_id, Avaliacao180.avaliado_id).where(Avaliacao180.ciclo_id == ciclo.id))
    pares_existentes = {(a, b) for a, b in existentes.all()}

    criados = 0
    for liderado in pessoas:
        gestor_id = liderado.gestor_responsavel_id
        if gestor_id is None or gestor_id not in ativos_por_id or gestor_id == liderado.id:
            continue
        if (gestor_id, liderado.id) not in pares_existentes:
            db.add(Avaliacao180(ciclo_id=ciclo.id, avaliador_id=gestor_id, avaliado_id=liderado.id, direcao="gestor_para_liderado"))
            criados += 1
        if (liderado.id, gestor_id) not in pares_existentes:
            db.add(Avaliacao180(ciclo_id=ciclo.id, avaliador_id=liderado.id, avaliado_id=gestor_id, direcao="liderado_para_gestor"))
            criados += 1
    await db.flush()
    return criados
