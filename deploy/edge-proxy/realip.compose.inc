# Compose: no ingress controller in front of the edge-proxy, the caller connects
# directly. X-Forwarded-For is never trusted here (a caller could forge it).
