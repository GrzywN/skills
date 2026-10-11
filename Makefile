PYTHON_IMAGE ?= python:3.12-slim

.PHONY: validate
validate:
	docker run --rm --volume "$(CURDIR)":/repo:ro --workdir /repo $(PYTHON_IMAGE) sh -ec '\
	pip install --quiet --disable-pip-version-check --root-user-action=ignore ./repos/agentskills/skills-ref; \
	for skill in skills/*/; do skills-ref validate "$$skill"; done'
