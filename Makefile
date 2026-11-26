PROFILES ?= all
DEV_PROFILE_FLAGS = $(foreach profile,$(PROFILES),--profile $(profile))
DEV_COMPOSE = docker compose -f docker-compose.dev.yml --env-file .env $(DEV_PROFILE_FLAGS)

.PHONY: help dev-up dev-down dev-build dev-rebuild dev-logs dev-core dev-events dev-eval dev-notifications prod-up prod-down prod-build prod-rebuild prod-logs prod-restart prod-env-up prod-env-down prod-env-build prod-env-rebuild prod-env-logs proto-gen clean clean-all

help:
	@printf "Usage: make [target] [PROFILES=\"all|core|events|eval|notifications\"]\n\n"
	@printf "Development profiles (PROFILES ?= all):\n"
	@printf "  %-18s %s\n" \
		"all" "All 7 microservices plus postgres and redis (default)" \
		"core" "postgres, redis, auth-service, gateway" \
		"events" "postgres, redis, event-service, invitation-service" \
		"eval" "postgres, redis, evaluation-service, project-service" \
		"notifications" "postgres, redis, notification-service"
	@printf "\nAvailable targets:\n"
	@printf "  %-18s %s\n" \
		"clean" "Clean up Docker resources" \
		"clean-all" "Clean up all Docker resources including images" \
		"dev-build" "Build development services with .env file (uses PROFILES)" \
		"dev-core" "Start core services in background (PROFILES=core)" \
		"dev-down" "Stop development services (uses PROFILES)" \
		"dev-eval" "Start evaluation services in background (PROFILES=eval)" \
		"dev-events" "Start event services in background (PROFILES=events)" \
		"dev-logs" "Follow logs for development services (uses PROFILES)" \
		"dev-notifications" "Start notification service in background (PROFILES=notifications)" \
		"dev-rebuild" "Rebuild development services with .env file (no cache, uses PROFILES)" \
		"dev-up" "Start development services in background with .env file (uses PROFILES)" \
		"help" "Show this help message" \
		"prod-build" "Build all production services" \
		"prod-down" "Stop all production services" \
		"prod-env-build" "Build all production services with .env file" \
		"prod-env-down" "Stop all production services with .env file" \
		"prod-env-logs" "Show logs for all production services with .env file" \
		"prod-env-rebuild" "Rebuild all production services with .env file (no cache)" \
		"prod-env-up" "Start all services in production mode with .env file" \
		"prod-logs" "Show logs for all production services" \
		"prod-rebuild" "Rebuild all production services (no cache)" \
		"prod-restart" "Restart all production services" \
		"prod-up" "Start all services in production mode" \
		"proto-gen" "Generate protobuf TypeScript files"

dev-up:
	$(DEV_COMPOSE) up -d

dev-core:
	$(MAKE) dev-up PROFILES=core

dev-events:
	$(MAKE) dev-up PROFILES=events

dev-eval:
	$(MAKE) dev-up PROFILES=eval

dev-notifications:
	$(MAKE) dev-up PROFILES=notifications

dev-down:
	$(DEV_COMPOSE) down

dev-build:
	$(DEV_COMPOSE) build

dev-rebuild:
	$(DEV_COMPOSE) build --no-cache

dev-logs:
	$(DEV_COMPOSE) logs -f

prod-up:
	docker compose up -d

prod-down:
	docker compose down

prod-build:
	docker compose build

prod-rebuild:
	docker compose build --no-cache

prod-logs:
	docker compose logs -f

prod-restart:
	docker compose restart

prod-env-up:
	docker compose --env-file .env up -d

prod-env-down:
	docker compose --env-file .env down

prod-env-build:
	docker compose --env-file .env build

prod-env-rebuild:
	docker compose --env-file .env build --no-cache

prod-env-logs:
	docker compose --env-file .env logs -f

proto-gen:
	mkdir -p libs/common/src/generated
	pnpm run proto:generate

clean:
	docker compose down -v --remove-orphans
	docker system prune -f

clean-all:
	docker compose down -v --remove-orphans
	docker system prune -af
