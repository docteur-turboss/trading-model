# Backup tooling for the db-backup and db-backup-incremental CronJobs
# (scripts/backup-k8s.sh, scripts/backup-incremental-k8s.sh) and for restores
# (scripts/restore-k8s.sh), released as ghcr.io/trading-model/backup-tools:
#   kubectl      dumps through `kubectl exec` into the database pods
#   age          encrypts every dump before it is written (BACKUP_AGE_RECIPIENTS)
#   rclone       off-site copy to any S3-compatible store (AWS, MinIO on another
#                VPS, Backblaze B2, Scaleway, OVH...)
#   mysqlbinlog  turns archived binlogs back into SQL for a point-in-time
#                restore (restore-k8s.sh --until, ADR-0031)
# kubectl comes from the pinned bitnami image: distribution packages lag
# several Kubernetes minors behind.
#
# Oracle Linux, not alpine: mysqlbinlog is in neither the mysql image (server
# minimal) nor alpine (MariaDB's client cannot read MySQL 8.4 binlogs). It
# comes from the official MySQL repository, at the version of the server
# (deploy/k8s/infra/mysql.yaml), checked with the key the mysql image ships.
# age and rclone come from Oracle's EPEL mirror.
FROM bitnami/kubectl@sha256:b29d8c1665b70817259ceecaea16ab27aab6368b48daf485d19436c809067492 AS kubectl

FROM mysql@sha256:85b9bf2e29cf836ecb8c2a15a935d4ba0c606631dff1dd79531a11983c638f2a AS mysql

FROM oraclelinux:9-slim@sha256:38f3f1f40cd8f28d020f38d69fa30f8a9fe9f7e661dff78592f85d110ec4696d
COPY --from=mysql /etc/pki/rpm-gpg/RPM-GPG-KEY-mysql /etc/pki/rpm-gpg/RPM-GPG-KEY-mysql
RUN printf '%s\n' '[mysql-8.4-community]' 'name=MySQL 8.4 Community' \
		'baseurl=https://repo.mysql.com/yum/mysql-8.4-community/el/9/$basearch/' \
		'enabled=1' 'gpgcheck=1' 'gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-mysql' 'module_hotfixes=true' \
		>/etc/yum.repos.d/mysql-community.repo \
	&& microdnf -y install oracle-epel-release-el9 \
	&& microdnf --setopt=install_weak_deps=0 -y install \
		mysql-community-client-8.4.11 age rclone \
		bash coreutils-single findutils gawk grep gzip sed tar diffutils \
	&& microdnf clean all \
	&& mysqlbinlog --version && age --version && rclone version >/dev/null
COPY --from=kubectl /opt/bitnami/kubectl/bin/kubectl /usr/local/bin/kubectl
USER 1001
WORKDIR /tmp
