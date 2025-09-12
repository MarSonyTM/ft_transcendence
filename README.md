[![CI](https://github.com/MarSonyTM/ft_transcendence/actions/workflows/ci.yml/badge.svg?branch=DEV)](https://github.com/MarSonyTM/ft_transcendence/actions/workflows/ci.yml)
# ft_transcendence

Pong platform with SPA frontend and optional backend, containerized with Docker.

## Branching model

Long-lived branches:
- MAIN (default)
- DEV
- PRE
- PROD

All changes flow via Pull Requests with manual review.

## CI

GitHub Actions workflow runs on PRs and pushes to long-lived branches. It conditionally:
- Runs Node setup, install, lint/tests if `package.json` exists.
- Builds Docker image if `Dockerfile` exists.

## Run locally

- To be documented by the team as the project evolves.
# Trigger CI
