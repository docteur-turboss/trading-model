# SPIRE tooling (ADR-0011). The official SPIRE images ship no shell, so the
# registration scripts and the compose agent's join-token entrypoint run on
# alpine with the statically linked SPIRE binaries copied in.
#   bootstrap: compose bootstrap (spire-bootstrap) + K8s entry reconciler
#              (spire-server sidecar); released as ghcr.io/trading-model/spire-tools
#   agent:     compose agent started with a join token
FROM ghcr.io/spiffe/spire-server:1.16.0@sha256:ff546f4c62dafc479a0cd79eae9a7b6df2975754d75efd31706098e0d7548837 AS spire-server
FROM ghcr.io/spiffe/spire-agent:1.16.0@sha256:ab3a8ce70435374cc5d84c81eabf0278dc046ddbc0a736d59694ba9e5975b1b6 AS spire-agent

# Runs as root: writes the shared bootstrap volumes and, in K8s, the SPIRE server datastore owned by root.
FROM alpine:3.24.4@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf AS bootstrap
# sqlite: consistent snapshot of the K8s server datastore by the backup job
# (`sqlite3 .backup` through the spire-entries sidecar, ADR-0065).
RUN apk add --no-cache sqlite
COPY --from=spire-server /opt/spire/bin/spire-server /opt/spire/bin/spire-server
COPY bootstrap.sh /usr/local/bin/spire-bootstrap
COPY k8s-entries.sh /usr/local/bin/spire-k8s-entries
RUN chmod +x /usr/local/bin/spire-bootstrap /usr/local/bin/spire-k8s-entries
ENTRYPOINT ["/usr/local/bin/spire-bootstrap"]

# Runs as root: with pid: host the agent attests workloads by reading /proc and the Docker socket.
FROM alpine:3.24.4@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf AS agent
COPY --from=spire-agent /opt/spire/bin/spire-agent /opt/spire/bin/spire-agent
COPY agent-entrypoint.sh /usr/local/bin/spire-agent-entrypoint
RUN chmod +x /usr/local/bin/spire-agent-entrypoint
ENTRYPOINT ["/usr/local/bin/spire-agent-entrypoint"]
