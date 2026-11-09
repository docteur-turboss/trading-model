# Kubernetes: the ingress controller (TLS end) connects from a pod IP and sets
# X-Forwarded-For to the caller's address (ingress-nginx overwrites an incoming
# value unless `use-forwarded-headers` is set: keep it unset, KUBERNETES.md).
# Trust the header only from the pod network; narrow the CIDRs per overlay by
# patching this ConfigMap key. The caller is then $remote_addr, truncated by
# `map $remote_addr` before it is logged or forwarded.
set_real_ip_from 10.0.0.0/8;
set_real_ip_from 172.16.0.0/12;
set_real_ip_from 192.168.0.0/16;
real_ip_header X-Forwarded-For;
real_ip_recursive on;
