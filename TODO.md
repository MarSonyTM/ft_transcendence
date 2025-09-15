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
- [ ] Tournament system implementation
- [ ] Basic matchmaking system
- [ ] Player alias registration for tournaments

## ❌ Required (Mandatory Part)

### Technical Requirements
- [ ] Single-page application (SPA) implementation
- [ ] Firefox compatibility verification
- [ ] Error handling and validation
- [ ] HTTPS setup for all connections (including WebSocket)

### Game Features
- [ ] Complete tournament system
  - [ ] Player registration with aliases
  - [ ] Tournament matchmaking
  - [ ] Display of player matchups
  - [ ] Match order management
- [ ] Equal paddle speeds for all players
- [ ] Original Pong (1972) look and feel verification

### Security
- [ ] Password hashing implementation
- [ ] SQL injection protection
- [ ] XSS attack protection
- [ ] Form validation (client/server)
- [ ] Input sanitization
- [ ] Environment variable management (.env)

## 🎯 Modules to Choose (Need 7 Major)

### Web (Choose from)
- [ ] Backend Framework (Fastify + Node.js) - Major
- [ ] Frontend Framework (Typescript + Tailwind) - Minor
- [ ] Database (SQLite) - Minor
- [ ] Blockchain Score Storage - Major

### User Management
- [ ] Standard User Management - Major
  - [ ] User registration/login
  - [ ] Profile management
  - [ ] Avatar support
  - [ ] Friend system
  - [ ] Match history
- [ ] OAuth Authentication - Major

### Gameplay & UX
- [ ] Remote Players - Major
- [ ] Multiple Players (3+ players) - Major
- [ ] Additional Game - Major
- [ ] Game Customization - Minor
- [ ] Live Chat - Major

### AI & Analytics
- [ ] AI Opponent - Major
- [ ] Stats Dashboard - Minor

### Security
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
- [ ] SSR Integration - Minor

### Server-Side Features
- [ ] Server-side Pong + API - Major
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
