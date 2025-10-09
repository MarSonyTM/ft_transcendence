# ft_transcendence Project TODO

## 📋 Mandatory Part (Must be Perfect)

### ✅ Completed Core Features
- [x] Basic project structure (frontend/backend)
- [x] Docker setup with development and production configs
- [x] Basic Pong game implementation
- [x] Two-player local controls (W/S for P1, O/L for P2)
- [x] Basic WebSocket connection for game state
- [x] Canvas rendering with proper paddle movement
- [x] Equal paddle speeds for all players
- [x] HTTPS/WSS for connections

### ❌ Required Core Features
1. Game Mechanics
   - [ ] Verify identical paddle speeds (including future AI)
   - [ ] Match original Pong (1972) visual style and gameplay
   - [ ] Ensure smooth gameplay without errors
   - [ ] Test all game controls and interactions

2. Tournament System (Core)
   - [ ] Implement alias registration for tournaments
   - [ ] Ensure aliases reset between tournaments
   - [ ] Display clear matchmaking order
   - [ ] Show who plays against whom
   - [ ] Basic matchmaking system implementation
   - [ ] Tournament progression logic
   - [ ] Next match announcements

3. Technical Requirements
   - [ ] Single-page application (SPA)
     - [ ] Working browser Back/Forward navigation
     - [ ] Proper 404 handling
   - [ ] Firefox Latest Version Compatibility
     - [ ] Test all features in Firefox
     - [ ] No console errors/warnings
   - [ ] Docker
     - [ ] Single command launch
     - [ ] All services properly connected

4. Basic Security (Mandatory Minimum)
   - [ ] Basic form validation
   - [ ] Input sanitization
   - [ ] Basic SQL injection protection
   - [ ] Basic XSS protection
   - [ ] Environment variables in .env
   - [ ] Secure HTTPS/WSS setup

## 🎯 Optional Modules (Need 7 Major)

### ✅ Completed Modules
1. Major Modules (10 points each)
   - [x] Backend Framework (Fastify + Node.js)
   - [x] Standard User Management
   - [x] OAuth Authentication
   - [x] 2FA & JWT
   - [x] Server-side Pong + API

2. Minor Modules (5 points each)
   - [x] Frontend Framework (Typescript + Tailwind)
   - [x] Database (SQLite)
   - [x] SSR Integration

### 🚧 In Progress Modules
- None currently in progress

### 📝 Available Modules

1. Web & Infrastructure
   - [ ] Blockchain Score Storage (Major)

2. User Experience (@mgeiger-)
   - [ ] Remote Players (Major)
   - [ ] Multiple Players (3+ players) (Major)
   - [ ] Additional Game (Major)
   - [ ] Game Customization (Minor)
   - [ ] Live Chat (Major)

3. AI & Analytics
   - [ ] AI Opponent (Major)
   - [ ] Stats Dashboard (Minor)

4. Security (@bmahdi)
   - [ ] WAF/ModSecurity + HashiCorp Vault (Major)
   - [ ] GDPR Compliance (Minor)

5. DevOps
   - [ ] ELK Stack Integration (Major)
   - [ ] Monitoring (Prometheus/Grafana) (Minor)
   - [ ] Microservices Architecture (Major)

6. Graphics & Accessibility
   - [ ] 3D Graphics (Babylon.js) (Major)
   - [ ] Multi-device Support (Minor)
   - [ ] Browser Compatibility (Minor)
   - [ ] Multi-language Support (Minor)
   - [ ] Accessibility Features (Minor)

7. Server-Side Features
   - [ ] CLI Gaming Support (Major)

## 📊 Progress Tracking

### Current Module Count
- Major Modules Completed: 5/7 required
- Minor Modules Completed: 3
- Points from Major Modules: 50
- Points from Minor Modules: 15
- Total Points: 65

### Next Steps
1. ⚠️ Complete ALL mandatory requirements first
2. Choose remaining 2 major modules
3. Add minor modules based on team capacity
4. Test thoroughly on Firefox

### Team Task Distribution
Format: [Task] - @username - Status - Branch

### Task Management Rules
- Add your name to a task before starting work
- Create GitHub issue for tracking
- Create feature branch following naming convention
- Regular progress updates via PRs
- Code review required for all PRs

Remember:
- Mandatory part must be PERFECT before modules are evaluated
- Each major module = 10 points
- Each minor module = 5 points
- Two minor modules = one major module


// Host cant end, remote can
// Remote cant host the game, only Host
// Only host of the match should be updating the database. Possible double up