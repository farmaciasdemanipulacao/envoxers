#!/bin/bash
# Backup diário do banco do Envoxers (database `envox_kanban`, dentro do
# container Postgres compartilhado `envox-intel-postgres`). Mesmo padrão do
# /opt/todasbr/scripts/backup.sh — dump comprimido no host + cópia dentro do
# volume do container, retenção de 30 dias (produção real, sem rede de
# segurança de "é tudo teste" como antes).
set -euo pipefail

STAMP=$(date +%Y%m%d_%H%M%S)
HOST_BACKUP_DIR="/docker/envoxers/backups"
FILENAME="envox_kanban_${STAMP}.sql.gz"
LOG_FILE="/docker/envoxers/logs/backup.log"

# DATABASE_URL vem no formato postgresql+asyncpg://USER:PASS@HOST:PORT/DB
DB_URL=$(grep -E "^DATABASE_URL=" /docker/envoxers/.env | cut -d= -f2-)
DB_USER=$(echo "$DB_URL" | sed -E 's#.*://([^:]+):.*#\1#')
DB_PASS=$(echo "$DB_URL" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
DB_NAME=$(echo "$DB_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')

docker exec -e PGPASSWORD="${DB_PASS}" envox-intel-postgres \
  sh -c "pg_dump -U '${DB_USER}' -d '${DB_NAME}' | gzip" > "${HOST_BACKUP_DIR}/${FILENAME}"

# mantém só os últimos 30 backups (retenção 30 dias, 1x/dia)
find "${HOST_BACKUP_DIR}" -name "envox_kanban_*.sql.gz" -mtime +30 -delete

echo "$(date '+%Y-%m-%d %H:%M:%S') — Backup criado: ${HOST_BACKUP_DIR}/${FILENAME} ($(du -h "${HOST_BACKUP_DIR}/${FILENAME}" | cut -f1))" >> "${LOG_FILE}"
