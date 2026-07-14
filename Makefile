COMPOSE ?= docker compose
WAIT_TIMEOUT ?= 300

.PHONY: restart
restart:
	@echo "Stopping Dental Trust containers..."
	$(COMPOSE) down --remove-orphans
	@echo "Building images, applying migrations, and starting the platform..."
	$(COMPOSE) up --detach --build --force-recreate --wait --wait-timeout $(WAIT_TIMEOUT)
	@echo "Dental Trust is ready."
	$(COMPOSE) ps
