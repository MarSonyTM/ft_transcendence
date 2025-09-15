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

<br>

# From Michael

## Quick Start Guide

1. **Clone the repository**
2. **Start development**: `make dev`
3. **Access game**: `http://localhost:5173`

or 

4. **Start production**: `make up`
5. **Access production**: `https://localhost`

- Note: if you are having problems with missing dependencies, go to:
```bash
src/backend/  and  src/frontend/
```
and type in the terminal

```bash
npm install
```

### Components
- **Frontend**: Web interface for gameplay
- **Backend**: Game logic, API endpoints, WebSocket server
- **Database**: Game state, user data, match history
- **Game Engine**: Server-side Pong physics and collision detection

## Docker Setup

Multi-container setup with development and production configs.

**Development:**
- Frontend: Vite dev server (port 5173)
- Backend: Node.js with live reload (port 3000)
- Database: SQLite

**Production:**
- Frontend: nginx (port 443)
- Backend: Node.js production build (port 3000)
- Database: SQLite

## Makefile Commands

**Development:**
- `make dev` - Start development
- `make dev-d` - Start in background
- `make dev-down` - Stop development

**Production:**
- `make up` - Start production
- `make down` - Stop production
- `make rebuild` - Rebuild containers

**Utilities:**
- `make clean` - Clean everything
- `make status` - Show containers

## Usage

**Development:** `make dev`
- Frontend: http://localhost:5173
- Backend: http://localhost:3000

**Production:** `make up`
- Frontend: https://localhost
- Backend: http://localhost:3000

## API

**Game Routes:**
- `GET /api/game` - List games
- `POST /api/game/new` - Create game
- `POST /api/game/:id/start` - Start game
- `POST /api/game/:id/stop` - Stop game

**WebSocket:**
- `ws://localhost:3000/game/:gameId/ws` - Real-time game connection

## Game Engine

Server-side Pong game with physics and collision detection.

**Features:**
- Ball physics and movement
- Paddle collision detection
- Real-time WebSocket updates
- Score tracking

## Frontend

Web interface built with Vite, TypeScript, and Tailwind CSS.

**Features:**
- HTML5 Canvas game rendering
- WebSocket real-time communication
- Hot reload in development

## Troubleshooting

**Common issues:**
- Port conflicts: `lsof -i :3000` or `lsof -i :5173`
- Docker issues: `make clean && make rebuild`
- WebSocket issues: Check backend is running on port 3000


## Python CLI

**WARNING!!**

This application is incomplete and needs fixing, however if you want to test it, youll need to install some packages. I have created a bash script to help solve this issue. Its creates a venv in the '~' dir, aptly named "fuckpy". Running the script creates said venv and installs the necessary packages (i.e httpx, websocket etc")


To use PongCLI:

- Start the server through make (dev or prod)
- Start the pong_cli.py script
- .....That's it