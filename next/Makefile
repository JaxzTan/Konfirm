.PHONY: help build up down restart logs ps sh clean

help: ## Show this help
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-9s\033[0m %s\n", $$1, $$2}'

build: ## Build the nextjs image
	docker compose build

up: ## Build (if needed) and start the stack in the background
	docker compose up -d --build

down: ## Stop and remove the stack
	docker compose down

restart: down up ## Restart the stack

logs: ## Follow logs
	docker compose logs -f

ps: ## Show running services
	docker compose ps

sh: ## Shell into the running nextjs container
	docker compose exec nextjs sh

clean: ## Stop the stack and remove volumes + dangling images
	docker compose down -v
	docker image prune -f
