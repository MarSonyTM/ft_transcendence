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

## Repository setup (what’s already configured)

- Branches created: `MAIN`, `DEV`, `PRE`, `PROD`.
- Protections:
  - `PRE`, `MAIN`, `PROD`: Pull Request required, 1+ approval required, branch must be up to date. (Status checks can be required once code adds stable checks.)
  - `DEV`: Can be flexible; adjust protections as needed.
- CI workflow: `.github/workflows/ci.yml`
  - Triggers on PRs and pushes to `DEV`, `PRE`, `MAIN`, `PROD`.
  - Manual trigger available via Actions → CI → Run workflow.
  - If `package.json` exists → Node 20 setup, `npm ci`/`npm install`, `npm run lint --if-present`, `npm test --if-present`.
  - If `Dockerfile` exists → `docker build` to catch build errors.

## How to contribute (for teammates)

1) Create a feature branch from the target branch (usually `DEV`).
2) Push your branch and open a PR into the target branch.
3) Wait for CI to finish. Address any failures.
4) Request a teammate’s approval (required on protected branches).
5) Merge only after requirements are met (approvals, CI, up-to-date).

## Next steps (when code is added)

- Add npm scripts: `lint`, `test`, optionally `typecheck` and we’ll enforce them in CI.
- Optionally split CI into jobs (node checks, docker build) and mark required checks in branch protections.
