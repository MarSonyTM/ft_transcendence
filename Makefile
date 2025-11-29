DB_FILE ?= ./src/database/database.db

all: up

setup:
	@echo "Setting up project..."
	@mkdir -p src/database

up: 
	@docker compose -f docker-compose.yml up

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

rebuild-up: clean setup
	@docker compose -f docker-compose.yml build --no-cache
	@docker compose -f docker-compose.yml up

status: 
	@docker ps

logs:
	@docker compose -f docker-compose.yml logs

logs-f:
	@docker compose -f docker-compose.yml logs -f

nuke:
	@docker stop $(docker ps -qa); docker rm $(docker ps -qa); docker rmi -f $(docker images -qa); docker volume rm $(docker volume ls -q); docker network rm $(docker network ls -q) 2>/dev/null

.PHONY: all setup up up-d down stop start restart clean rebuild rebuild-up status logs logs-f nuke