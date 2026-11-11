# Edge rate-limit key: the real client address (after realip). Shared by compose and K8s.
# An empty key is not counted: edge-limit-key.off.inc switches the limit off for k6 load runs.
map $binary_remote_addr $edge_limit_key {
    default $binary_remote_addr;
}
