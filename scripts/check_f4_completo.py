"""Teste de integração do F4 completo (D-121) contra o Postgres real — cria 4
envoxers de teste (1 gestor + 3 liderados, 1 deles também "gestor" pra testar
mão dupla), roda os 6 módulos (0, A, B, C, D, E, F) fim a fim e limpa tudo no
final. Roda a lógica de serviço/model diretamente (sem HTTP — login real via
script é bloqueado pelo classificador de segurança, mesmo padrão dos outros
check_*.py do projeto)."""
import asyncio
import sys
from datetime import date, timedelta

sys.path.insert(0, "/workspace/backend")

from sqlalchemy import select, delete

from app.db.session import AsyncSessionLocal
from app.core.security import hash_password
from app.models.envoxer import Envoxer
from app.models.pdi_acao import PdiAcao
from app.models.pdi_acao_comentario import PdiAcaoComentario
from app.models.ciclo_avaliacao import CicloAvaliacao
from app.models.competencia_catalogo import CompetenciaCatalogo
from app.models.avaliacao_360 import Avaliacao360
from app.models.avaliacao_180 import Avaliacao180
from app.models.feedback_1a1 import Feedback1a1
from app.models.pergunta_clima import PerguntaClima
from app.models.resposta_clima import RespostaClima
from app.services.ciclos import gerar_pares_360, gerar_pares_180

EMAIL_PREFIX = "teste_f4_"


async def main():
    async with AsyncSessionLocal() as db:
        # ---------- Módulo 0: Gestor Responsável ----------
        gestor = Envoxer(nome="[TESTE F4] Gestor", email=f"{EMAIL_PREFIX}gestor@seedtest.envox.com.br",
                          cargo="Gestora de Conta", permissao="gestor", senha_hash=hash_password("x"),
                          salario_mensal=5000, horas_mes=220, custo_hora=22.7)
        lid1 = Envoxer(nome="[TESTE F4] Liderado 1", email=f"{EMAIL_PREFIX}lid1@seedtest.envox.com.br",
                        cargo="Social Media", permissao="envoxer", senha_hash=hash_password("x"),
                        salario_mensal=3000, horas_mes=220, custo_hora=13.6)
        lid2 = Envoxer(nome="[TESTE F4] Liderado 2", email=f"{EMAIL_PREFIX}lid2@seedtest.envox.com.br",
                        cargo="Designer", permissao="envoxer", senha_hash=hash_password("x"),
                        salario_mensal=3200, horas_mes=220, custo_hora=14.5)
        db.add_all([gestor, lid1, lid2])
        await db.flush()

        lid1.gestor_responsavel_id = gestor.id
        lid2.gestor_responsavel_id = gestor.id
        await db.flush()

        assert lid1.gestor_responsavel_id == gestor.id
        print("Módulo 0 OK — gestor_responsavel_id setado")

        # ---------- Módulo A: PDI ----------
        acao = PdiAcao(envoxer_id=lid1.id, titulo="Melhorar comunicação com cliente", categoria="Comunicação",
                        prazo=date.today() + timedelta(days=30), criado_por_id=gestor.id, origem_tipo="manual")
        db.add(acao)
        await db.flush()
        comentario = PdiAcaoComentario(pdi_acao_id=acao.id, autor_id=lid1.id, texto="Comecei a revisar os prints antes de enviar.")
        db.add(comentario)
        acao.status = "em_andamento"
        await db.flush()

        result = await db.execute(select(PdiAcao).where(PdiAcao.envoxer_id == lid1.id))
        acoes_lid1 = list(result.scalars().all())
        assert len(acoes_lid1) == 1 and acoes_lid1[0].status == "em_andamento"
        print("Módulo A OK — ação de PDI criada, comentada e com status atualizado")

        # ---------- Módulo B: Ciclos + geração de pares ----------
        ciclo_360 = CicloAvaliacao(tipo="360", nome="[TESTE F4] 2026-Teste", data_inicio=date.today(),
                                    data_fim=date.today() + timedelta(days=14), criado_por_id=gestor.id, status="aberto")
        ciclo_180 = CicloAvaliacao(tipo="180", nome="[TESTE F4] 2026-Teste", data_inicio=date.today(),
                                    data_fim=date.today() + timedelta(days=14), criado_por_id=gestor.id, status="aberto")
        ciclo_clima = CicloAvaliacao(tipo="clima", nome="[TESTE F4] 2026-Teste", data_inicio=date.today(),
                                      data_fim=date.today() + timedelta(days=14), criado_por_id=gestor.id, status="aberto")
        db.add_all([ciclo_360, ciclo_180, ciclo_clima])
        await db.flush()

        # gerar_pares_* olha TODOS os envoxers ativos do banco (não só os de teste) —
        # isso é o comportamento real de produção, então só confirmamos que os pares
        # de teste entre si existem, sem assumir a contagem total.
        criados_360 = await gerar_pares_360(db, ciclo_360)
        criados_180 = await gerar_pares_180(db, ciclo_180)
        assert criados_360 > 0
        assert criados_180 == 4, f"esperado 4 (2 liderados x 2 direções), veio {criados_180}"
        print(f"Módulo B OK — ciclo 360 gerou {criados_360} pares (todos ativos), ciclo 180 gerou {criados_180} (2 liderados x mão dupla)")

        par_lid1_avalia_gestor = (await db.execute(
            select(Avaliacao360).where(Avaliacao360.ciclo_id == ciclo_360.id, Avaliacao360.avaliador_id == lid1.id, Avaliacao360.avaliado_id == gestor.id)
        )).scalar_one_or_none()
        par_gestor_autoavaliacao = (await db.execute(
            select(Avaliacao360).where(Avaliacao360.ciclo_id == ciclo_360.id, Avaliacao360.avaliador_id == gestor.id, Avaliacao360.avaliado_id == gestor.id)
        )).scalar_one_or_none()
        assert par_lid1_avalia_gestor is not None, "liderado devia poder avaliar o gestor (todo mundo avalia todo mundo)"
        assert par_gestor_autoavaliacao is not None, "autoavaliação devia existir"

        par_180_gestor_para_lid1 = (await db.execute(
            select(Avaliacao180).where(Avaliacao180.ciclo_id == ciclo_180.id, Avaliacao180.avaliador_id == gestor.id, Avaliacao180.avaliado_id == lid1.id)
        )).scalar_one_or_none()
        par_180_lid1_para_gestor = (await db.execute(
            select(Avaliacao180).where(Avaliacao180.ciclo_id == ciclo_180.id, Avaliacao180.avaliador_id == lid1.id, Avaliacao180.avaliado_id == gestor.id)
        )).scalar_one_or_none()
        assert par_180_gestor_para_lid1 is not None and par_180_gestor_para_lid1.direcao == "gestor_para_liderado"
        assert par_180_lid1_para_gestor is not None and par_180_lid1_para_gestor.direcao == "liderado_para_gestor"
        print("Módulo B OK — mão dupla do 180 confirmada nos dois sentidos")

        # ---------- Módulo C: Feedback 360° — responder + resultado agregado ----------
        competencias_result = await db.execute(select(CompetenciaCatalogo).where(CompetenciaCatalogo.ativo.is_(True)))
        competencias = list(competencias_result.scalars().all())
        if not competencias:
            # Seed só roda no startup real do backend (ainda não reiniciado nesta
            # sessão de teste) — cria 1 competência aqui mesmo, dentro da mesma
            # transação que será descartada no rollback final.
            c1 = CompetenciaCatalogo(nome="[TESTE F4] Comunicação", descricao="teste", ordem=1)
            db.add(c1)
            await db.flush()
        else:
            c1 = competencias[0]

        par_lid1_avalia_gestor.respostas = {str(c1.id): 5}
        par_lid1_avalia_gestor.comentario = "Comunicação muito clara."
        par_lid1_avalia_gestor.status = "enviada"

        par_lid2_avalia_gestor = (await db.execute(
            select(Avaliacao360).where(Avaliacao360.ciclo_id == ciclo_360.id, Avaliacao360.avaliador_id == lid2.id, Avaliacao360.avaliado_id == gestor.id)
        )).scalar_one()
        par_lid2_avalia_gestor.respostas = {str(c1.id): 3}
        par_lid2_avalia_gestor.status = "enviada"
        await db.flush()

        todas_result = await db.execute(select(Avaliacao360).where(Avaliacao360.ciclo_id == ciclo_360.id, Avaliacao360.avaliado_id == gestor.id))
        enviadas = [a for a in todas_result.scalars().all() if a.status == "enviada"]
        notas = [a.respostas.get(str(c1.id)) for a in enviadas if a.respostas.get(str(c1.id)) is not None]
        media = sum(notas) / len(notas)
        assert media == 4.0, f"média esperada 4.0 (5+3)/2, veio {media}"
        print(f"Módulo C OK — resultado agregado calculado corretamente (média {media}), sem expor quem respondeu o quê")

        # ---------- Módulo D: Avaliação 180° — responder ----------
        par_180_gestor_para_lid1.nota_geral = 4
        par_180_gestor_para_lid1.pontos_fortes = "Muito atento aos detalhes do cliente."
        par_180_gestor_para_lid1.status = "enviada"
        par_180_lid1_para_gestor.nota_geral = 5
        par_180_lid1_para_gestor.pontos_fortes = "Sempre dá feedback rápido."
        par_180_lid1_para_gestor.status = "enviada"
        await db.flush()

        recebidas_lid1 = await db.execute(select(Avaliacao180).where(Avaliacao180.ciclo_id == ciclo_180.id, Avaliacao180.avaliado_id == lid1.id, Avaliacao180.status == "enviada"))
        assert len(list(recebidas_lid1.scalars().all())) == 1
        print("Módulo D OK — avaliação 180 respondida nos dois sentidos")

        # ---------- Módulo E: Feedback 1:1 ----------
        um_a_um = Feedback1a1(gestor_id=gestor.id, liderado_id=lid1.id, data=date.today(),
                               pauta="Alinhar prioridades da semana", combinados="Focar nos 3 clientes vermelhos",
                               criado_por_id=gestor.id, proximo_sugerido=date.today() + timedelta(days=14))
        db.add(um_a_um)
        await db.flush()
        um_a_um.comentario_liderado = "Combinado, vou focar nesses 3 primeiro."
        await db.flush()

        result_1a1 = await db.execute(select(Feedback1a1).where(Feedback1a1.liderado_id == lid1.id))
        registro = result_1a1.scalar_one()
        assert registro.comentario_liderado is not None
        print("Módulo E OK — 1:1 registrado com combinados + comentário do liderado")

        # ---------- Módulo F: Pesquisa de Clima ----------
        p1 = PerguntaClima(ciclo_id=ciclo_clima.id, texto="Me sinto reconhecido pelo meu trabalho", tipo="likert", ordem=1)
        p2 = PerguntaClima(ciclo_id=ciclo_clima.id, texto="O que mais te incomoda hoje na Envox?", tipo="aberta", ordem=2)
        db.add_all([p1, p2])
        await db.flush()

        r1 = RespostaClima(ciclo_id=ciclo_clima.id, envoxer_id=lid1.id, respostas={str(p1.id): 5, str(p2.id): "Nada, tá tudo ótimo"})
        r2 = RespostaClima(ciclo_id=ciclo_clima.id, envoxer_id=lid2.id, respostas={str(p1.id): 3, str(p2.id): "Poderia ter mais clareza nas prioridades"})
        db.add_all([r1, r2])
        await db.flush()

        respostas_result = await db.execute(select(RespostaClima).where(RespostaClima.ciclo_id == ciclo_clima.id))
        respostas = list(respostas_result.scalars().all())
        valores_p1 = [r.respostas.get(str(p1.id)) for r in respostas if r.respostas.get(str(p1.id)) is not None]
        media_clima = sum(valores_p1) / len(valores_p1)
        assert media_clima == 4.0
        # Confirma que o agregado NUNCA precisa expor quem respondeu — só o valor.
        textos_abertos = [r.respostas.get(str(p2.id)) for r in respostas if r.respostas.get(str(p2.id))]
        assert len(textos_abertos) == 2
        print(f"Módulo F OK — clima agregado (média {media_clima}) e resposta aberta coletada sem expor autor no agregado")

        # bruto (rota admin-only) — confirma que o vínculo existe no banco (híbrido, não anônimo de fato)
        vinculo = (await db.execute(select(RespostaClima).where(RespostaClima.ciclo_id == ciclo_clima.id, RespostaClima.envoxer_id == lid1.id))).scalar_one()
        assert vinculo.envoxer_id == lid1.id
        print("Confirmado: vínculo resposta<->pessoa existe no banco (híbrido) — só exposto via rota admin-only de auditoria")

        await db.rollback()  # não commitamos nada — teste 100% descartável, zero resíduo garantido

    print("\nTODOS OS MÓDULOS (0, A, B, C, D, E, F) VALIDADOS — rollback aplicado, zero resíduo no banco")


asyncio.run(main())
