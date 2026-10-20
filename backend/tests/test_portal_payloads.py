"""Contrato de payload: nenhuma informação interna de aprovadores na projeção externa."""
import unittest
from datetime import datetime, timezone
from app.models.solicitacao import Solicitacao
from app.api.routes.portal_operacao import representacao
from app.api.routes.portal_documentos import projetar_documento_cliente
from app.schemas.documento_acordo import DocumentoAcordoResponse, DocumentoConfirmacaoResponse

class PortalPayloadTest(unittest.TestCase):
    def test_pedido_nao_expoe_status_interno(self):
        s=Solicitacao(cliente_id=3,tipo="evento",titulo="Teste",descricao="Fictício",status="nova",solicitante_nome="Pessoa teste",briefing_estruturado={})
        s.id=77; s.created_at=datetime.now(timezone.utc)
        payload=representacao(s)
        self.assertNotIn("status_interno_solicitacao",payload)
        self.assertNotIn("tenant_id",payload)
        self.assertNotIn("custo",payload)

    def test_documento_omite_emails_ips_aprovadores_internos(self):
        now=datetime.now(timezone.utc)
        d=DocumentoAcordoResponse(id=1,cliente_id=3,tipo="aditivo",motivo="Teste",
            itens_alterados=[],status="aguardando_confirmacoes",created_at=now,
            confirmacoes=[
                DocumentoConfirmacaoResponse(id=1,tipo_confirmante="envoxer",
                    envoxer_id=42,nome_snapshot="Privado",email_snapshot="interno@example.invalid",ip="192.0.2.1"),
                DocumentoConfirmacaoResponse(id=2,tipo_confirmante="cliente_contato",
                    cliente_contato_id=12,nome_snapshot="Outro",email_snapshot="outro@example.invalid",ip="192.0.2.2"),
                DocumentoConfirmacaoResponse(id=3,tipo_confirmante="cliente_contato",
                    cliente_contato_id=11,nome_snapshot="Próprio",email_snapshot="proprio@example.invalid",confirmado_em=now,ip="192.0.2.3"),
            ])
        proj=projetar_documento_cliente(d,11)
        self.assertEqual(len(proj["confirmacoes"]),1)
        self.assertEqual(proj["confirmacoes"][0]["cliente_contato_id"],11)
        self.assertNotIn("envoxer_id",str(proj))
        for sensivel in ("interno@example.invalid","outro@example.invalid","192.0.2.","Privado","email_snapshot","nome_snapshot","ip"):
            self.assertNotIn(sensivel,str(proj))

if __name__ == "__main__": unittest.main()
