# ft_transcendence
A real-time multiplayer Pong platform built as a Single Page Application, featuring OAuth authentication, WebSocket-driven gameplay, and a fully containerized multi-service architecture.

1. **Clone the repository**
2. **Start production**: `make up`
3. **Access production**: `https://localhost`
- Note: if you are having problems with missing dependencies, type in the terminal:
```bash
cd src/backend/ && npm install; cd ../src/frontend/ && npm install
```

### Components
- **Frontend**: TypeScript SPA built with Vite, rendered via HTML5 Canvas with Tailwind CSS styling
- **Backend**: Fastify (Node.js) REST API and WebSocket server handling game logic and user sessions
- **Database**: SQLite for persistent storage of user profiles, match history, and leaderboard data
- **Game Engine**: Server-side Pong physics — ball movement, paddle collision, and score state — broadcast to clients over WebSockets
- **Auth**: OAuth 2.0 integration for third-party login

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | Vite + TypeScript |
| Styling | Tailwind CSS |
| Game rendering | HTML5 Canvas API |
| Backend framework | Fastify (Node.js) |
| Real-time comms | WebSockets (ws) |
| Database | SQLite |
| Auth | OAuth 2.0 |
| Containerization | Docker + Docker Compose |
| Reverse proxy | nginx (production) |

## Docker Setup
Multi-container setup with development and production configs.

**Development:**
- Frontend: Vite dev server with HMR (port 5173)
- Backend: Fastify with live reload via nodemon (port 3000)
- Database: SQLite (file-based, volume-mounted for persistence)

**Production:**
- Frontend: nginx serving the compiled Vite/TypeScript bundle (port 443, HTTPS)
- Backend: Fastify production build (port 3000)
- Database: SQLite

## Makefile Commands
**Build and start**
- `make up` - Start production
- `make down` - Stop production
- `make rebuild` - Rebuild containers

**Utilities:**
- `make clean` - Clean everything
- `make status` - Show containers

## Usage
**Production:** `make up`
- Frontend: https://localhost
- Backend: http://localhost:3000

## API
**Auth Routes:**
- `GET /api/auth/login` - Initiate OAuth flow
- `GET /api/auth/callback` - OAuth callback handler
- `POST /api/auth/logout` - End session

**User Routes:**
- `GET /api/user/:id` - Get user profile
- `GET /api/leaderboard` - Get ranked player list

**Game Routes:**
- `GET /api/game` - List games
- `POST /api/game/new` - Create game
- `POST /api/game/:id/start` - Start game
- `POST /api/game/:id/stop` - Stop game

**WebSocket:**
- `ws://localhost:3000/game/:gameId/ws` - Real-time game connection

WebSocket messages carry serialized game state (ball position, paddle positions, scores) at a fixed tick rate, allowing the Canvas renderer on the frontend to stay in sync with server-side physics.

## Game Engine
Server-side Pong simulation written in TypeScript running inside Fastify.

**Features:**
- Deterministic ball physics — velocity, direction, and boundary reflection
- Paddle collision detection with angle-of-incidence response
- Fixed game loop broadcasting state updates over WebSocket
- Score tracking with win condition and game-over handling
- Clients are authoritative only for paddle input; all other state lives on the server

## Frontend
SPA built with Vite and TypeScript, no frontend framework — just the DOM and Canvas API.

**Features:**
- HTML5 Canvas game rendering — paddles, ball, score HUD drawn each frame
- WebSocket client for receiving live game state and sending paddle input
- Tailwind CSS utility-first styling across all views (lobby, game, profile, leaderboard)
- OAuth login flow with session persistence
- Client-side routing for SPA navigation without page reloads

## Pictures
### Landing Page
![Landing Page](/imgs/main.png)
### Start a Game
![Alt text](/imgs/gamestart.png)
### Playing a game
![Alt text](/imgs/gamescreen.png)
### Profile Screen
![Alt text](/imgs/profile.png)
### Leaderboard
![Alt text](/imgs/leaderboard.png)
