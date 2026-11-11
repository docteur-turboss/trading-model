# Pods allowed to set the caller's address through X-Forwarded-For (the ingress
# controller).
# PLACEHOLDER: replace with the pod CIDR of the production cluster (kubeadm
# podSubnet / cloud pod range) before the first deploy.
set_real_ip_from 10.0.0.0/8;
real_ip_header X-Forwarded-For;
real_ip_recursive on;
