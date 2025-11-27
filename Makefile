DB_FILE ?= ./src/database/database.db

all: up

setup:
	@echo "Setting up project..."
	@mkdir -p src/database

# Production commands (nginx)
up: 
	@docker compose -f docker-compose.yml up

# Run in background (detached)
up-d:
	@docker compose -f docker-compose.yml up -d

down: 
	@docker compose -f docker-compose.yml down

stop: 
	@docker compose -f docker-compose.yml stop

start: 
	@docker compose -f docker-compose.yml start

restart: down up

clean: down
	@docker compose -f docker-compose.yml down -v
	@docker system prune -f

rebuild: clean setup
	@docker compose -f docker-compose.yml build --no-cache
	@docker compose -f docker-compose.yml up -d

# Rebuild and run in foreground with visible output
rebuild-up: clean setup
	@docker compose -f docker-compose.yml build --no-cache
	@docker compose -f docker-compose.yml up

# Development commands (Vite dev server)
dev:
	@docker compose -f docker-compose.dev.yml up

dev-d:
	@docker compose -f docker-compose.dev.yml up -d

dev-down:
	@docker compose -f docker-compose.dev.yml down

dev-stop:
	@docker compose -f docker-compose.dev.yml stop

dev-start:
	@docker compose -f docker-compose.dev.yml start

dev-restart: dev-down dev

dev-clean: dev-down
	@docker compose -f docker-compose.dev.yml down -v
	@docker system prune -f

dev-rebuild: dev-clean setup
	@docker compose -f docker-compose.dev.yml build --no-cache
	@docker compose -f docker-compose.dev.yml up -d

# Rebuild and run development in foreground with visible output
dev-rebuild-up: dev-clean setup
	@docker compose -f docker-compose.dev.yml build --no-cache
	@docker compose -f docker-compose.dev.yml up

dev-logs:
	@docker compose -f docker-compose.dev.yml logs

dev-logs-f:
	@docker compose -f docker-compose.dev.yml logs -f

status: 
	@docker ps

logs:
	@docker compose -f docker-compose.yml logs

logs-f:
	@docker compose -f docker-compose.yml logs -f

dev-dbreset: dev-down
	@rm -f $(DB_FILE) $(DB_FILE)-wal $(DB_FILE)-shm || true
	@echo "Database removed: $(DB_FILE)*"

nuke:
	@docker stop $(docker ps -qa); docker rm $(docker ps -qa); docker rmi -f $(docker images -qa); docker volume rm $(docker volume ls -q); docker network rm $(docker network ls -q) 2>/dev/null

.PHONY: all setup up up-d down stop start restart clean rebuild rebuild-up dev dev-d dev-down dev-stop dev-start dev-restart dev-clean dev-rebuild dev-rebuild-up dev-logs dev-logs-f status logs logs-f dev-dbreset nuke