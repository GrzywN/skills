.PHONY: validate
validate:
	docker run --rm --volume "$(CURDIR)":/repo:ro --workdir /repo python:3.12-slim sh -ec '\
	pip install --quiet --disable-pip-version-check --root-user-action=ignore ./repos/agentskills/skills-ref; \
	for skill in skills/*/; do skills-ref validate "$$skill"; done'
