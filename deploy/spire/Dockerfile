# SPIRE tooling (ADR-0011). The official SPIRE images ship no shell, so the
# registration scripts and the compose agent's join-token entrypoint run on
# alpine with the statically linked SPIRE binaries copied in.
#   bootstrap: compose bootstrap (spire-bootstrap) + K8s entry reconciler
#              (spire-server sidecar); released as ghcr.io/trading-model/spire-tools
#   agent:     compose agent started with a join token
ARG SPIRE_VERSION=1.11.3

FROM ghcr.io/spiffe/spire-server:${SPIRE_VERSION} AS spire-server
FROM ghcr.io/spiffe/spire-agent:${SPIRE_VERSION} AS spire-agent

FROM alpine:3.20 AS bootstrap
COPY --from=spire-server /opt/spire/bin/spire-server /opt/spire/bin/spire-server
COPY bootstrap.sh /usr/local/bin/spire-bootstrap
COPY k8s-entries.sh /usr/local/bin/spire-k8s-entries
RUN chmod +x /usr/local/bin/spire-bootstrap /usr/local/bin/spire-k8s-entries
ENTRYPOINT ["/usr/local/bin/spire-bootstrap"]

FROM alpine:3.20 AS agent
COPY --from=spire-agent /opt/spire/bin/spire-agent /opt/spire/bin/spire-agent
COPY agent-entrypoint.sh /usr/local/bin/spire-agent-entrypoint
RUN chmod +x /usr/local/bin/spire-agent-entrypoint
ENTRYPOINT ["/usr/local/bin/spire-agent-entrypoint"]
