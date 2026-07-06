"""Import de todos os models para o Alembic autogenerate e Base.metadata.create_all enxergarem as tabelas."""
from app.models.envoxer import Envoxer  # noqa: F401
from app.models.servico import Servico  # noqa: F401
from app.models.cliente import Cliente  # noqa: F401
from app.models.cliente_servico import ClienteServico  # noqa: F401
from app.models.escopo import Escopo  # noqa: F401
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
