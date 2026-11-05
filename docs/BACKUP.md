# Backup do banco (fora do Railway)

O backup nativo do Railway só restaura no mesmo projeto e ambiente, e apagar o volume apaga os backups ([doc do Railway](https://docs.railway.com/reference/backups)). Por isso há uma cópia própria, fora dele.

## O que roda
`scripts/backup-postgres.sh`:
1. `pg_dump` em formato custom (já comprimido), sem dono nem permissões, para restaurar em qualquer Postgres.
2. Confere o arquivo com `pg_restore --list` e grava o `sha256` ao lado.
3. Se `S3_BUCKET`, `S3_ACCESS_KEY` e `S3_SECRET_KEY` existirem, envia os dois arquivos para o bucket (S3 ou compatível: Cloudflare R2, Backblaze B2, MinIO, Wasabi), com assinatura SigV4 do próprio `curl` (7.75 ou mais novo). Não precisa do AWS CLI.
4. Apaga as cópias locais mais velhas que `BACKUP_RETENCAO_DIAS` (padrão: 14).

A URL do banco e as chaves nunca são impressas.

## Variáveis
| Variável | Padrão | Para quê |
|---|---|---|
| `DATABASE_URL` | obrigatório | banco a copiar |
| `BACKUP_DIR` | `./backups` | pasta local |
| `BACKUP_RETENCAO_DIAS` | `14` | retenção local |
| `BACKUP_PREFIXO` | `autopecas-erp` | nome do arquivo |
| `S3_ENDPOINT` | `https://s3.<região>.amazonaws.com` | endpoint compatível (ex.: `https://<conta>.r2.cloudflarestorage.com`) |
| `S3_REGION` | `us-east-1` | região (R2 usa `auto`) |
| `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | — | destino; use um bucket **só de backup**, com chave que só grava nele |
| `BACKUP_S3_PASTA` | `backups/postgres` | pasta no bucket |

## Retenção no bucket
Configure uma regra de ciclo de vida no próprio bucket (por exemplo: apagar objetos de `backups/postgres/` com mais de 35 dias). Ligue o versionamento ou o *object lock*, se o provedor tiver, para que uma chave vazada não consiga apagar os backups.

## Como agendar
- **Railway:** crie um serviço Cron com a mesma imagem, comando `bash scripts/backup-postgres.sh` e agenda `0 6 * * *` (03:00 em Brasília). Ele precisa das variáveis acima. A imagem precisa ter `pg_dump` da mesma versão maior do servidor (ou mais nova).
- **Máquina própria:** `crontab -e` e `0 3 * * * cd /caminho/autopecas-erp && DATABASE_URL=... scripts/backup-postgres.sh >> backup.log 2>&1`.

## Restaurar (teste isso uma vez por mês)
```bash
createdb autopecas_restaurado
pg_restore --no-owner --no-privileges -d autopecas_restaurado autopecas-erp-AAAAMMDDTHHMMSSZ.dump
```
Confira contagem de `vendas`, `produtos` e `movimentos_estoque` contra a produção. Backup que nunca foi restaurado não é backup.

## O que foi testado
Em 04/11/2026: geração e conferência local contra um banco de desenvolvimento. O envio ao bucket foi testado só até a conexão (sem bucket real). Valide o primeiro envio com a conta de storage do dono.
