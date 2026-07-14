"""Teste de integração do Portal do Cliente — Módulo C: Documento de
Aditivo/Acordo (D-076) — roda contra o Postgres real, chamando a lógica
diretamente (sem HTTP/JWT). Cria e depois apaga seu próprio Cliente de teste.

Uso (de dentro do host, container tem que estar na rede envox-intel-internal):
    docker run --rm --network envox-intel-internal --env-file /docker/envoxers/.env \\
        -v /docker/envoxers:/workspace envoxers-backend:latest \\
        python /workspace/scripts/check_documento_acordo.py
"""
import asyncio
import os
import sys

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select, delete  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from app.db.session import AsyncSessionLocal  # noqa: E402
from app.models.envoxer import Envoxer  # noqa: E402
from app.models.cliente import Cliente  # noqa: E402
from app.models.cliente_contato import ClienteContato  # noqa: E402
from app.models.item_escopo import ItemEscopo  # noqa: E402
from app.models.item_escopo_historico import ItemEscopoHistorico  # noqa: E402
from app.models.documento_acordo import DocumentoAcordo  # noqa: E402
from app.api.routes.item_escopo import criar_item_escopo  # noqa: E402
from app.api.routes.documento_acordo import criar_documento_acordo_rota, confirmar_documento_acordo_rota, cancelar_documento_acordo_rota  # noqa: E402
from app.services.documentos_acordo import confirmar_como_cliente_contato  # noqa: E402
from app.schemas.item_escopo import ItemEscopoCreate  # noqa: E402
from app.schemas.documento_acordo import DocumentoAcordoCreate, ItemAlteradoInput  # noqa: E402


class FakeRequest:
    class _Client:
        host = "203.0.113.42"
    client = _Client()
    headers = {"user-agent": "check-script/1.0"}


async def assert_true(cond, msg):
    if not cond:
        raise AssertionError(f"FALHOU: {msg}")
    print(f"  ok: {msg}")


async def main():
    async with AsyncSessionLocal() as db:
        admin = (await db.execute(select(Envoxer).where(Envoxer.permissao == "admin", Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        gestor = (await db.execute(select(Envoxer).where(Envoxer.permissao.in_(["gestor", "envoxer"]), Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        assert admin and gestor, "precisa de 1 admin e mais 1 envoxer/gestor ativos"

        cliente = Cliente(nome="[TESTE ADITIVO] Cliente Check", segmento="Teste", valor_contrato=1000, tipo_receita="recorrente", ativo=True)
        db.add(cliente)
        await db.flush()
        cliente_id = cliente.id

        contato = ClienteContato(cliente_id=cliente_id, nome="Contato Cliente Teste", email="aditivo.teste@clienteteste.com.br", senha_hash="x")
        db.add(contato)
        await db.flush()
        contato_id = contato.id

        item = await criar_item_escopo(cliente_id, ItemEscopoCreate(tipo="post_social", cadencia="mensal", quantidade=8), db, admin)
        await db.commit()
        print(f"Cliente={cliente_id} contato={contato_id} item={item.id} (quantidade inicial {item.quantidade})")

        # 1) criar documento sem itens -> 400
        try:
            await criar_documento_acordo_rota(cliente_id, DocumentoAcordoCreate(motivo="teste", itens=[], envoxer_ids=[gestor.id]), db, admin)
            raise AssertionError("FALHOU: deveria exigir ao menos 1 item")
        except HTTPException as e:
            await assert_true(e.status_code == 400, "criar sem itens é rejeitado (400)")

        # 2) criar documento sem ninguém pra confirmar -> 400
        try:
            await criar_documento_acordo_rota(cliente_id, DocumentoAcordoCreate(motivo="teste", itens=[ItemAlteradoInput(item_escopo_id=item.id, quantidade_nova=12)], envoxer_ids=[], cliente_contato_ids=[]), db, admin)
            raise AssertionError("FALHOU: deveria exigir ao menos 1 confirmante")
        except HTTPException as e:
            await assert_true(e.status_code == 400, "criar sem confirmantes é rejeitado (400)")

        # 3) criar documento de verdade: gestor + admin (internos) + contato do cliente
        doc = await criar_documento_acordo_rota(
            cliente_id,
            DocumentoAcordoCreate(motivo="Cliente pediu aumento de posts", itens=[ItemAlteradoInput(item_escopo_id=item.id, quantidade_nova=12)], envoxer_ids=[gestor.id, admin.id], cliente_contato_ids=[contato_id]),
            db, admin,
        )
        await assert_true(doc.status == "aguardando_confirmacoes", "documento criado aguardando confirmações")
        await assert_true(len(doc.confirmacoes) == 3, "3 confirmações criadas (2 internos + 1 contato)")
        await assert_true(doc.itens_alterados[0].quantidade_anterior == 8 and doc.itens_alterados[0].quantidade_nova == 12, "snapshot do item alterado correto (8 -> 12)")

        item_ainda_nao_mudou = (await db.execute(select(ItemEscopo).where(ItemEscopo.id == item.id))).scalar_one()
        await assert_true(item_ainda_nao_mudou.quantidade == 8, "quantidade do item NÃO muda antes de todo mundo confirmar")

        # 4) confirmar como envoxer não convidado -> 403
        outro_envoxer = (await db.execute(select(Envoxer).where(Envoxer.id.not_in([gestor.id, admin.id]), Envoxer.ativo.is_(True)).limit(1))).scalar_one_or_none()
        if outro_envoxer:
            try:
                await confirmar_documento_acordo_rota(doc.id, FakeRequest(), db, outro_envoxer)
                raise AssertionError("FALHOU: envoxer não convidado não deveria conseguir confirmar")
            except HTTPException as e:
                await assert_true(e.status_code == 403, "envoxer não convidado é rejeitado (403)")

        # 5) confirmar como gestor (1 de 3) — ainda não deve efetivar
        doc = await confirmar_documento_acordo_rota(doc.id, FakeRequest(), db, gestor)
        await assert_true(doc.status == "aguardando_confirmacoes", "com 1 de 3 confirmações ainda aguardando")
        conf_gestor = next(c for c in doc.confirmacoes if c.nome_snapshot == gestor.nome)
        await assert_true(conf_gestor.confirmado_em is not None and conf_gestor.ip == "203.0.113.42", "confirmação do gestor gravou timestamp + IP")

        # 6) confirmar de novo (idempotente) não quebra nem duplica
        doc = await confirmar_documento_acordo_rota(doc.id, FakeRequest(), db, gestor)
        await assert_true(doc.status == "aguardando_confirmacoes", "confirmar de novo não muda nada (idempotente)")

        # 7) confirmar como admin (2 de 3) — ainda não efetiva
        doc = await confirmar_documento_acordo_rota(doc.id, FakeRequest(), db, admin)
        await assert_true(doc.status == "aguardando_confirmacoes", "com 2 de 3 ainda aguardando")

        item_ainda_nao_mudou2 = (await db.execute(select(ItemEscopo).where(ItemEscopo.id == item.id))).scalar_one()
        await assert_true(item_ainda_nao_mudou2.quantidade == 8, "quantidade ainda não mudou com 2 de 3")

        # 8) confirmar como o contato do cliente (3 de 3) — AGORA efetiva
        doc = await confirmar_como_cliente_contato(db, doc.id, contato_id, "198.51.100.7", "portal-browser/1.0")
        await db.commit()
        await assert_true(doc.status == "vigente", "documento vira vigente com as 3 confirmações completas")
        await assert_true(doc.vigente_em is not None, "vigente_em preenchido")

        item_atualizado = (await db.execute(select(ItemEscopo).where(ItemEscopo.id == item.id))).scalar_one()
        await assert_true(item_atualizado.quantidade == 12, "quantidade do item finalmente atualizada pra 12")

        hist = (await db.execute(select(ItemEscopoHistorico).where(ItemEscopoHistorico.item_escopo_id == item.id))).scalar_one()
        await assert_true(hist.quantidade_anterior == 8 and hist.quantidade_nova == 12 and hist.documento_acordo_id == doc.id, "histórico gravado com o documento_acordo_id vinculado")

        # 9) documento vigente não aceita mais confirmação nem cancelamento
        try:
            await confirmar_documento_acordo_rota(doc.id, FakeRequest(), db, gestor)
            raise AssertionError("FALHOU: documento vigente não deveria aceitar confirmação")
        except HTTPException as e:
            await assert_true(e.status_code == 400, "documento vigente rejeita nova confirmação (400)")
        try:
            await cancelar_documento_acordo_rota(doc.id, db, admin)
            raise AssertionError("FALHOU: documento vigente não deveria ser cancelável")
        except HTTPException as e:
            await assert_true(e.status_code == 400, "documento vigente não pode ser cancelado (400)")

        # 10) cenário de cancelamento: novo documento, cancelado antes de todo mundo confirmar
        doc2 = await criar_documento_acordo_rota(
            cliente_id, DocumentoAcordoCreate(motivo="Teste de cancelamento", itens=[ItemAlteradoInput(item_escopo_id=item.id, quantidade_nova=99)], envoxer_ids=[gestor.id]),
            db, admin,
        )
        doc2_cancelado = await cancelar_documento_acordo_rota(doc2.id, db, admin)
        await assert_true(doc2_cancelado.status == "cancelado", "documento cancelado com sucesso")
        item_nao_afetado = (await db.execute(select(ItemEscopo).where(ItemEscopo.id == item.id))).scalar_one()
        await assert_true(item_nao_afetado.quantidade == 12, "cancelar documento não mexe na quantidade do item")

        # limpeza
        await db.execute(delete(ItemEscopoHistorico).where(ItemEscopoHistorico.item_escopo_id == item.id))
        await db.execute(delete(DocumentoAcordo).where(DocumentoAcordo.cliente_id == cliente_id))
        await db.execute(delete(ItemEscopo).where(ItemEscopo.cliente_id == cliente_id))
        await db.execute(delete(ClienteContato).where(ClienteContato.id == contato_id))
        await db.execute(delete(Cliente).where(Cliente.id == cliente_id))
        await db.commit()
        print("\nLimpeza feita. Todos os cenários passaram.")


if __name__ == "__main__":
    asyncio.run(main())
