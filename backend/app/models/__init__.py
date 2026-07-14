"""Import de todos os models para o Alembic autogenerate e Base.metadata.create_all enxergarem as tabelas."""
from app.models.envoxer import Envoxer  # noqa: F401
from app.models.servico import Servico  # noqa: F401
from app.models.cliente import Cliente  # noqa: F401
from app.models.cliente_servico import ClienteServico  # noqa: F401
from app.models.cliente_contato import ClienteContato  # noqa: F401
from app.models.escopo import Escopo  # noqa: F401
from app.models.item_escopo import ItemEscopo  # noqa: F401
from app.models.item_escopo_historico import ItemEscopoHistorico  # noqa: F401
from app.models.entrega_manual import EntregaManual  # noqa: F401
from app.models.alerta_entrega import AlertaEntrega  # noqa: F401
from app.models.tarefa import Tarefa  # noqa: F401
from app.models.registro_foco import RegistroFoco  # noqa: F401
from app.models.aprovacao import Aprovacao  # noqa: F401
from app.models.alteracao import Alteracao  # noqa: F401
from app.models.solicitacao import Solicitacao  # noqa: F401
from app.models.pulso_satisfacao import PulsoSatisfacao  # noqa: F401
from app.models.check_in import CheckIn  # noqa: F401
from app.models.farol_calculo import FarolCalculo, FarolCalculoHistorico  # noqa: F401
from app.models.alerta_farol import AlertaFarol  # noqa: F401
from app.models.perfil_cliente import PerfilCliente, PerfilClienteHistorico  # noqa: F401
from app.models.motivo_churn import MotivoChurnCatalogo  # noqa: F401
from app.models.churn_snapshot import ChurnSnapshot  # noqa: F401
from app.models.evento import Evento  # noqa: F401
from app.models.chat_canal import ChatCanal  # noqa: F401
from app.models.chat_mensagem import ChatMensagem  # noqa: F401
from app.models.chat_leitura import ChatLeitura  # noqa: F401
from app.models.push_subscription import PushSubscription  # noqa: F401
from app.models.alerta_config import AlertaConfig  # noqa: F401
from app.models.etapa import Etapa  # noqa: F401
from app.models.automacao_etapa import AutomacaoEtapa  # noqa: F401
from app.models.pendencia import Pendencia  # noqa: F401
from app.models.etapa_template import EtapaTemplate  # noqa: F401
from app.models.automacao_etapa_template import AutomacaoEtapaTemplate  # noqa: F401
