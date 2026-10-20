"""Testes unitários determinísticos de isolamento por papel e unidade (sem dados reais)."""
import unittest
from app.services.portal_permissoes import PAPEIS, capacidades, pode, pode_ver_solicitacao

class PortalPermissoesTest(unittest.TestCase):
    def test_perfil_desconhecido_nunca_recebe_privilegio(self):
        self.assertEqual(capacidades("desconhecido"), {"ver_proprias"})
        self.assertFalse(pode("desconhecido", "solicitar"))
        self.assertFalse(pode("desconhecido", "ver_todas"))

    def test_consulta_so_enxerga_pedido_proprio(self):
        self.assertTrue(pode_ver_solicitacao("consulta", 10, 10, 100, set()))
        self.assertFalse(pode_ver_solicitacao("consulta", 10, 11, 100, {100}))
        self.assertFalse(pode_ver_solicitacao("consulta", 10, None, 100, {100}))

    def test_gestor_regional_so_enxerga_suas_unidades(self):
        self.assertTrue(pode_ver_solicitacao("gestor_regional", 10, 11, 100, {100}))
        self.assertFalse(pode_ver_solicitacao("gestor_regional", 10, 11, 200, {100}))
        self.assertFalse(pode_ver_solicitacao("gestor_regional", 10, 10, 200, {100}))
        self.assertFalse(pode_ver_solicitacao("gestor_regional", 10, 11, None, {100}))

    def test_aprovador_nao_vira_admin(self):
        self.assertFalse(pode("aprovador", "gerenciar_usuarios"))
        self.assertTrue(pode("aprovador", "aprovar"))

    def test_gestor_geral_tem_visao_institucional(self):
        self.assertTrue(pode_ver_solicitacao("gestor_geral", 10, 11, 200, set()))
        self.assertFalse(pode("gestor_geral", "gerenciar_usuarios"))

    def test_extras_podem_restringir_nao_conceder(self):
        self.assertFalse(pode("consulta", "ver_todas", {"ver_todas": True}))
        self.assertFalse(pode("solicitante", "comentar", {"comentar": False}))
        self.assertTrue(pode("solicitante", "comentar", {"comentar": True}))

    def test_papel_admin_institucional_nao_vira_interno(self):
        self.assertTrue(pode("admin_institucional", "gerenciar_usuarios"))
        self.assertNotIn("admin_envox", PAPEIS["admin_institucional"])

if __name__ == "__main__":
    unittest.main()
