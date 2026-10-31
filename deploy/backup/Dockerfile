# Backup tooling for the db-backup CronJob (scripts/backup-k8s.sh), released
# as ghcr.io/trading-model/backup-tools:
#   kubectl  dumps through `kubectl exec` into the database pods
#   age      encrypts every dump before it is written (BACKUP_AGE_RECIPIENTS)
#   rclone   off-site copy to any S3-compatible store (AWS, MinIO on another
#            VPS, Backblaze B2, Scaleway, OVH...)
# kubectl comes from the pinned bitnami image: alpine's package lags several
# Kubernetes minors behind.
FROM bitnami/kubectl@sha256:b29d8c1665b70817259ceecaea16ab27aab6368b48daf485d19436c809067492 AS kubectl

FROM alpine:3.20
RUN apk add --no-cache bash age rclone coreutils findutils gzip tar
COPY --from=kubectl /opt/bitnami/kubectl/bin/kubectl /usr/local/bin/kubectl
USER 1001
WORKDIR /tmp
