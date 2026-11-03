# Kubernetes: the api-gateway Service has a stable ClusterIP, resolved once at
# startup (nginx's resolver would ignore the namespace search domains).
proxy_pass https://api-gateway:3000;
