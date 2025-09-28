# ft_transcendence Project TODO

## ✅ Completed

### Infrastructure & Setup
- [x] Basic project structure (frontend/backend)
- [x] Docker setup with development and production configs
- [x] GitHub workflow with branch protections (DEV, PRE, MAIN, PROD)
- [x] CI pipeline for automated checks

### Game Implementation
- [x] Basic Pong game implementation
- [x] Two-player local controls (W/S for P1, O/L for P2)
- [x] Basic WebSocket connection for game state
- [x] Canvas rendering with proper paddle movement

## 🚧 In Progress
- [ ] Tournament system implementation (MVP)
  - [ ] Data model: tournaments, participants (aliases), matches, rounds
  - [ ] Endpoints: create tournament, register alias, generate bracket
  - [ ] Endpoints: get next match, report result, advance round
  - [ ] UI: alias entry form, bracket view, "Next match" announcement
  - [ ] Matchmaking logic: fair seeding and deterministic progression
- [ ] Basic matchmaking system (covered by Tournament MVP)
- [ ] Player alias registration for tournaments (covered by Tournament MVP)

## ❌ Required (Mandatory Part)

### Technical Requirements
- [ ] Single-page application (SPA) implementation
  - [ ] Back/Forward navigation works within app
  - [ ] 404 handling and fallback route
- [ ] Firefox compatibility verification
  - [ ] Canvas render, keyboard input, WebSocket work on latest stable Firefox
  - [ ] No console errors/warnings in gameplay flow
- [ ] Error handling and validation
  - [ ] Centralized error handler (server)
  - [ ] User-friendly error UI (client)
  - [ ] Fastify JSON schemas for all routes (validation)
  - [ ] Parameterized DB access to prevent SQLi
  - [ ] Output encoding/sanitization to prevent XSS
- [X] HTTPS setup for all connections (including WebSocket)
  - [ ] Nginx TLS in production (self-signed or mkcert for local)
  - [X] Frontend uses https and wss in production
  - [ ] README documents certificate setup and trust instructions

### Game Features @lbaumeis
- [ ] Complete tournament system
  - [ ] Player registration with aliases
  - [ ] Tournament matchmaking
  - [ ] Display of player matchups
  - [ ] Match order management
- [x] Equal paddle speeds for all players
- [ ] Original Pong (1972) look and feel verification

### Security - @mafurnic
- [ ] Password hashing implementation
- [ ] SQL injection protection
- [ ] XSS attack protection
- [ ] Form validation (client/server)
- [ ] Input sanitization
- [ ] Environment variable management (.env)

## 🎯 Modules to Choose (Need 7 Major)

### Web (Choose from)
- [x] Backend Framework (Fastify + Node.js) - Major
- [x] Frontend Framework (Typescript + Tailwind) - Minor
- [x] Database (SQLite) - Minor
- [ ] Blockchain Score Storage - Major

### User Management- @bmahdi
- [ ] Standard User Management - Major
  - [ ] User registration/login
  - [ ] Profile management
  - [ ] Avatar support
  - [ ] Friend system
  - [ ] Match history
- [ ] OAuth Authentication - Major

### Gameplay & UX - @mgeiger-
- [ ] Remote Players - Major
- [ ] Multiple Players (3+ players) - Major
- [ ] Additional Game - Major
- [ ] Game Customization - Minor
- [ ] Live Chat - Major

### AI & Analytics
- [ ] AI Opponent - Major
- [ ] Stats Dashboard - Minor

### Security - @bmahdi
- [ ] WAF/ModSecurity + HashiCorp Vault - Major
- [ ] GDPR Compliance - Minor
- [ ] 2FA & JWT - Major

### DevOps
- [ ] ELK Stack Integration - Major
- [ ] Monitoring (Prometheus/Grafana) - Minor
- [ ] Microservices Architecture - Major

### Graphics & Accessibility
- [ ] 3D Graphics (Babylon.js) - Major
- [ ] Multi-device Support - Minor
- [ ] Browser Compatibility - Minor
- [ ] Multi-language Support - Minor
- [ ] Accessibility Features - Minor
- [X] SSR Integration - Minor

### Server-Side Features
- [x] Server-side Pong + API - Major
  - [ ] Document existing API endpoints in README
  - [ ] Confirm all gameplay flows are available via API
  - [ ] Stabilize response contracts used by frontend
- [ ] CLI Gaming Support - Major

## Next Steps
1. Complete mandatory requirements first
2. Choose and assign 7 major modules among team members
3. Add minor modules based on team capacity
4. Ensure all security measures are implemented
5. Test thoroughly on Firefox

## Team Task Distribution

### Current Assignments
Format: [Task] - @username - Status - Branch

#### In Progress
- None yet

#### Available Tasks
- All tasks from above sections are available for assignment

### Task Management Rules
- Add your name to a task before starting work
- Create a GitHub issue for tracking
- Create feature branch following naming convention
- Regular progress updates via PRs
- Code review required for all PRs

Remember:
- Mandatory part must be perfect before bonus evaluation
- Each major module = 10 points
- Each minor module = 5 points
- Two minor modules = one major module
