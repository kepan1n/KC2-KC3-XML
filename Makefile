SHELL := /usr/bin/env bash

VENV_DIR ?= .venv
PYTHON ?= python3
HOST ?= 0.0.0.0
PORT ?= 8080

ACTIVATE = source $(VENV_DIR)/bin/activate

.PHONY: help venv install run check check-fast check-xsd

help:
	@echo "Targets:"
	@echo "  make install      # create venv + install deps"
	@echo "  make run          # run web app (HOST/PORT configurable)"
	@echo "  make check        # run scenario checks (business rules)"
	@echo "  make check-xsd    # run scenario checks with strict XSD validation"
	@echo "  make check-fast   # alias of make check"

venv:
	@test -d $(VENV_DIR) || $(PYTHON) -m venv $(VENV_DIR)

install: venv
	@bash -lc '$(ACTIVATE) && python -m pip install --upgrade pip && pip install -r requirements.txt'

run: install
	@bash -lc '$(ACTIVATE) && exec uvicorn app.main:app --reload --host "$(HOST)" --port "$(PORT)"'

check-fast: check

check: install
	@bash -lc '$(ACTIVATE) && python scripts/check_scenarios.py'

check-xsd: install
	@bash -lc '$(ACTIVATE) && python scripts/check_scenarios.py --xsd'
