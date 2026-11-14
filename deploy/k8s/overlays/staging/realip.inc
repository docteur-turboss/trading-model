# Pods allowed to set the caller's address through X-Forwarded-For (the ingress
# controller). kind default pod CIDR; change it if the cluster uses another.
set_real_ip_from 10.244.0.0/16;
real_ip_header X-Forwarded-For;
real_ip_recursive on;
