FROM nginx:1.27-alpine

# Certs are NOT baked in — they are bind-mounted at /etc/nginx/certs by
# docker-compose.yml (see the `certs` target in the root Makefile). Keeping
# private keys out of the image means the image is safe to push.
COPY nginx.conf /etc/nginx/conf.d/default.conf
