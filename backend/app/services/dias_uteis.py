"""Cálculo de dia útil — por ora só considera fins de semana (sáb/dom), sem
calendário de feriados. Se algum dia precisar de feriados nacionais/locais,
dá pra evoluir pra uma tabela de exceções sem mudar quem chama isso.
"""
from datetime import date, timedelta


def proximo_dia_util(data_base: date) -> date:
    """Primeiro dia útil (seg-sex) estritamente depois de `data_base`."""
    dia = data_base + timedelta(days=1)
    while dia.weekday() >= 5:  # 5 = sábado, 6 = domingo
        dia += timedelta(days=1)
    return dia
