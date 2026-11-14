# Load runs only (tests/load/README.md): empty key = no edge rate limit. Never deployed.
map $binary_remote_addr $edge_limit_key {
    default "";
}
