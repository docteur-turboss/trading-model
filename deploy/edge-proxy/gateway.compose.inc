# Compose: container addresses change when compose recreates the gateway, so
# re-resolve the name through Docker's DNS (a variable in proxy_pass makes nginx
# resolve it at request time, cached `valid` seconds).
resolver 127.0.0.11 valid=10s ipv6=off;
set $gateway api-gateway;
proxy_pass https://$gateway:3000;
proxy_ssl_name api-gateway;
