# Kubernetes: the api-gateway Service has a stable ClusterIP, resolved once at
# startup (nginx's resolver would ignore the namespace search domains).
# `gateway` is the keep-alive pool of gateway-upstream.k8s.conf; keep-alive to
# an upstream needs HTTP/1.1 and no `Connection: close`.
proxy_pass https://gateway;
proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_ssl_name api-gateway;
