"""Constantes de marcação compartilhadas entre seed_dados.py e limpar_seed.py.

Qualquer registro fake criado pelo seed tem que carregar essas marcas, pra dar
pra identificar e apagar tudo de novo com segurança.
"""

SEED_PREFIX = "[SEED] "
SEED_TAG = "SEED_DATA_2026"
SEED_EMAIL_DOMAIN = "@seedtest.envox.com.br"
SEED_SENHA_PADRAO = "SeedTeste123!"
