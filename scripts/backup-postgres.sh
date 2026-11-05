#!/usr/bin/env bash
# Backup do Postgres do AutoPeças ERP para fora do Railway.
# Uso: DATABASE_URL=... scripts/backup-postgres.sh
#
# Variáveis:
#   DATABASE_URL            obrigatório (o banco a copiar)
#   BACKUP_DIR              pasta local dos arquivos (padrão: ./backups)
#   BACKUP_RETENCAO_DIAS    apaga cópias locais mais velhas que isso (padrão: 14)
#   BACKUP_PREFIXO          prefixo do arquivo/objeto (padrão: autopecas-erp)
#   S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY
#                           se S3_BUCKET e as chaves existirem, envia o arquivo
#                           para o S3 (ou compatível: R2, B2, MinIO, Wasabi)
#   BACKUP_S3_PASTA         pasta dentro do bucket (padrão: backups/postgres)
#
# Formato: pg_dump -Fc (custom, já comprimido; restaura com pg_restore).
# Nada de senha em log: a URL do banco nunca é impressa.
set -euo pipefail

: "${DATABASE_URL:?defina DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENCAO="${BACKUP_RETENCAO_DIAS:-14}"
PREFIXO="${BACKUP_PREFIXO:-autopecas-erp}"
PASTA_S3="${BACKUP_S3_PASTA:-backups/postgres}"

mkdir -p "$BACKUP_DIR"
carimbo="$(date -u +%Y%m%dT%H%M%SZ)"
arquivo="$BACKUP_DIR/${PREFIXO}-${carimbo}.dump"

echo "[backup] gerando ${arquivo}"
# --no-owner/--no-privileges: restaura em outro servidor sem os papéis do Railway.
pg_dump --format=custom --compress=6 --no-owner --no-privileges \
  --file="$arquivo" "$DATABASE_URL"

# Confere que o arquivo abre (lista o índice); arquivo corrompido falha aqui.
pg_restore --list "$arquivo" > /dev/null
tamanho="$(wc -c < "$arquivo" | tr -d ' ')"
sha="$( (command -v sha256sum >/dev/null && sha256sum "$arquivo" || shasum -a 256 "$arquivo") | cut -d' ' -f1)"
echo "$sha  $(basename "$arquivo")" > "$arquivo.sha256"
echo "[backup] ok: ${tamanho} bytes, sha256 ${sha}"

if [[ -n "${S3_BUCKET:-}" && -n "${S3_ACCESS_KEY:-}" && -n "${S3_SECRET_KEY:-}" ]]; then
  regiao="${S3_REGION:-us-east-1}"
  endpoint="${S3_ENDPOINT:-https://s3.${regiao}.amazonaws.com}"
  endpoint="${endpoint%/}"
  for f in "$arquivo" "$arquivo.sha256"; do
    destino="${endpoint}/${S3_BUCKET}/${PASTA_S3}/$(basename "$f")"
    echo "[backup] enviando $(basename "$f") para o bucket ${S3_BUCKET}"
    # Assinatura AWS SigV4 nativa do curl (>= 7.75), estilo path (compatível
    # com R2/B2/MinIO). As chaves vão por --user, nunca impressas.
    curl --fail --silent --show-error \
      --aws-sigv4 "aws:amz:${regiao}:s3" \
      --user "${S3_ACCESS_KEY}:${S3_SECRET_KEY}" \
      -H "x-amz-content-sha256: UNSIGNED-PAYLOAD" \
      --upload-file "$f" "$destino" > /dev/null
  done
  echo "[backup] enviado. Retenção no bucket: use regra de ciclo de vida (docs/BACKUP.md)."
else
  echo "[backup] S3 não configurado: cópia ficou só em ${BACKUP_DIR}"
fi

# Retenção local.
find "$BACKUP_DIR" -name "${PREFIXO}-*.dump*" -type f -mtime +"$RETENCAO" -print -delete \
  | sed 's/^/[backup] removido (retenção): /' || true
