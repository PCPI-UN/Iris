.PHONY: help dev-up dev-down dev-build dev-rebuild dev-logs dev-core dev-events dev-eval dev-notifications prod-up prod-down prod-build prod-rebuild prod-logs prod-restart prod-env-up prod-env-down prod-env-build prod-env-rebuild prod-env-logs proto-gen clean clean-all

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \\033[36m%-18s\\033[0m %s\\n", $$1, $$2}'

# Development targets
dev-up: ## Start all services in development mode with .env file
	docker compose -f docker-compose.dev.yml --profile all --env-file .env up

dev-core: ## Start core services (postgres, redis, auth, gateway)
	docker compose -f docker-compose.dev.yml --profile core --env-file .env up

dev-events: ## Start event services (postgres, redis, events, invitations)
	docker compose -f docker-compose.dev.yml --profile events --env-file .env up

dev-eval: ## Start evaluation services (postgres, redis, evaluation, project)
	docker compose -f docker-compose.dev.yml --profile eval --env-file .env up

dev-notifications: ## Start notification service
	docker compose -f docker-compose.dev.yml --profile notifications --env-file .env up

dev-down: ## Stop all development services
	docker compose -f docker-compose.dev.yml --profile all --env-file .env down

dev-build: ## Build all development services with .env file
	docker compose -f docker-compose.dev.yml --profile all --env-file .env build

dev-rebuild: ## Rebuild all development services with .env file (no cache)
	docker compose -f docker-compose.dev.yml --profile all --env-file .env build --no-cache

dev-logs: ## Show logs for all development services
	docker compose -f docker-compose.dev.yml --profile all --env-file .env logs -f

# Production targets
prod-up: ## Start all services in production mode
	docker compose up -d

prod-down: ## Stop all production services
	docker compose down

prod-build: ## Build all production services
	docker compose build

prod-rebuild: ## Rebuild all production services (no cache)
	docker compose build --no-cache

prod-logs: ## Show logs for all production services
	docker compose logs -f

prod-restart: ## Restart all production services
	docker compose restart

# Production targets with explicit .env file
prod-env-up: ## Start all services in production mode with .env file
	docker compose --env-file .env up -d

prod-env-down: ## Stop all production services with .env file
	docker compose --env-file .env down

prod-env-build: ## Build all production services with .env file
	docker compose --env-file .env build

prod-env-rebuild: ## Rebuild all production services with .env file (no cache)
	docker compose --env-file .env build --no-cache

prod-env-logs: ## Show logs for all production services with .env file
	docker compose --env-file .env logs -f

# Utility targets
proto-gen: ## Generate protobuf TypeScript files
	mkdir -p libs/common/src/generated
	pnpm run proto:generate

clean: ## Clean up Docker resources
	docker compose down -v --remove-orphans
	docker system prune -f

clean-all: ## Clean up all Docker resources including images
	docker compose down -v --remove-orphans
	docker system prune -af
