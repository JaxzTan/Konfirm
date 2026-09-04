# Konfirm — docker stack: nginx (TLS, host :80/:443) -> nextjs (internal :3400)
#
# next/.env is the single source of truth: it feeds both the build args
# (--env-file, for NEXT_PUBLIC_* inlined into the client bundle) and the
# container runtime environment (env_file in docker-compose.yml).

NAME     := konfirm
COMPOSE  := docker compose --env-file next/.env
CERT_DIR := nginx/certs
CERT     := $(CERT_DIR)/localhost.pem
CERT_KEY := $(CERT_DIR)/localhost-key.pem

.PHONY: all certs clean fclean re up down logs ps sh help

all: certs ## Build the images and start the stack in the background
	$(COMPOSE) up -d --build
	@ echo "https://localhost:8443/"

certs: $(CERT) ## Generate the local TLS cert nginx serves (idempotent)

$(CERT):
	@mkdir -p $(CERT_DIR)
	@if command -v mkcert >/dev/null 2>&1; then \
	  echo "==> mkcert: issuing a cert trusted by this machine's CA"; \
	  mkcert -cert-file $(CERT) -key-file $(CERT_KEY) localhost 127.0.0.1 ::1; \
	else \
	  echo "==> mkcert not found, falling back to openssl (browser will warn)"; \
	  openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
	    -keyout $(CERT_KEY) -out $(CERT) -subj '/CN=localhost' \
	    -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'; \
	fi

clean: ## Stop and remove containers + network (images and volumes kept)
	$(COMPOSE) down --remove-orphans

fclean: ## clean + drop this project's images, volumes and dangling layers
	$(COMPOSE) down --remove-orphans --volumes --rmi local
	docker image prune -f
	@echo "note: $(CERT_DIR) kept — delete it by hand to re-issue the TLS cert"

re: fclean all ## Full rebuild from scratch

up: all ## Alias for `all`

down: clean ## Alias for `clean`

logs: ## Follow logs from all services
	$(COMPOSE) logs -f

ps: ## Show running services
	$(COMPOSE) ps

sh: ## Shell into the running nextjs container
	$(COMPOSE) exec nextjs sh

help: ## Show this help
	@grep -E '^[a-z]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-7s\033[0m %s\n", $$1, $$2}'
