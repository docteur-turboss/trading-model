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
# The repository drops a client when Oracle reissues it (8.4.13 -> 8.4.13.1).
# age and rclone come from Oracle's EPEL mirror.
# `microdnf upgrade` pulls the OS security fixes published after the base
# digest: the release Trivy gate refuses fixed HIGH CVEs (v3.1.0-rc.3 failed on
# curl and util-linux).
FROM bitnami/kubectl:latest@sha256:8919c149c2e3d6860e0143c117900e64d71395172aaef0e01e604bb98c8e7ce0 AS kubectl

FROM mysql:8.4.13@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902 AS mysql

FROM oraclelinux:10-slim@sha256:5edf16c62270a7fa3012481efbef1921ba7159dc2441b99ed19eb6c0a88171cf
COPY --from=mysql /etc/pki/rpm-gpg/RPM-GPG-KEY-mysql /etc/pki/rpm-gpg/RPM-GPG-KEY-mysql
RUN printf '%s\n' '[mysql-8.4-community]' 'name=MySQL 8.4 Community' \
		'baseurl=https://repo.mysql.com/yum/mysql-8.4-community/el/10/$basearch/' \
		'enabled=1' 'gpgcheck=1' 'gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-mysql' 'module_hotfixes=true' \
		>/etc/yum.repos.d/mysql-community.repo \
	&& microdnf -y upgrade \
	&& microdnf -y install oracle-epel-release-el10 \
	&& microdnf --setopt=install_weak_deps=0 -y install \
		mysql-community-client-8.4.13.1 age rclone \
		bash coreutils-single findutils gawk grep gzip sed tar diffutils \
	&& microdnf clean all \
	&& mysqlbinlog --version && age --version && rclone version >/dev/null
COPY --from=kubectl /opt/bitnami/kubectl/bin/kubectl /usr/local/bin/kubectl
USER 1001
WORKDIR /tmp
