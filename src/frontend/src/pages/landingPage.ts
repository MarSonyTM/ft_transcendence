import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';

export async function renderLandingPage(): Promise<void> {
    const root = document.getElementById('app-root');
    if (!root) return;

    // Ensure auth initialization completes before deciding what to render
    // to avoid briefly showing guest/login UI when a valid session exists.
    await authService.whenReady();
    const res = await authService.fetchUserProfile();

    if (!res) {
        // Public landing for unauthenticated users
        root.innerHTML = `
        <div class="neon-grid landing-tight landing-container" style="gap: 1.2em; margin-top: 2.2em; width:100%; max-width: 980px;">
          <div class="grid-anim"></div>
          <div class="glass-card" style="padding:2.2em 2em; text-align:center; width:100%; position: relative;">
            <h1 class="main-title title-neon" style="margin-bottom:.25em;">PING PONG</h1>
            <p style="color:#9ca3af; text-align:center; max-width:640px; margin: 0 auto 1em auto;">Welcome to ft_transcendence. Play classic Pong, join rooms, and compete on the leaderboard.</p>
            <div style="display:flex; gap:0.8em; flex-wrap:wrap; justify-content:center; margin-top: .75em;">
              <button id="guestBtn" class="btn-neon primary">Play as Guest</button>
              <button id="loginBtn" class="btn-neon accent">Login</button>
              <button id="registerBtn" class="btn-neon accent">Register</button>
            </div>
          </div>
        </div>`;
        const guestBtn = document.getElementById('guestBtn');
        if (guestBtn) {
            guestBtn.addEventListener('click', () => {
                history.pushState({ page: 'tempLogin' }, '', '/tempLogin');
                setCurrentPage('tempLogin');
                renderApp();
            });
        }
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                history.pushState({ page: 'login' }, '', '/login');
                setCurrentPage('login');
                renderApp();
            });
        }
        const registerBtn = document.getElementById('registerBtn');
        if (registerBtn) {
            registerBtn.addEventListener('click', () => {
                history.pushState({ page: 'register' }, '', '/register');
                setCurrentPage('register');
                renderApp();
            });
        }
        // Leaderboard is only available for authenticated users
        return;
    }

    // Authenticated landing
    root.innerHTML = `
    <div class="neon-grid landing-tight landing-container" style="width:100%; max-width: 980px;">
      <div class="grid-anim"></div>
      <div class="glass-card" style="padding:2.2em 2em; text-align:center; width:100%;">
        <h1 class="main-title title-neon" style="margin-bottom:.25em;">PING PONG</h1>
        <div style="display:flex; gap:0.8em; flex-wrap:wrap; justify-content:center; margin-top: .75em;">
          <button id="profileBtn" class="btn-neon accent">Profile</button>
          <button id="leaderboardBtn" class="btn-neon accent">Leaderboard</button>
          <button id="playBtn" class="btn-neon primary">Play</button>
        </div>
      </div>
    </div>`;
    
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            history.pushState({ page: 'gameSelect' }, '', '/gameSelect');
            setCurrentPage('gameSelect');
            renderApp();
        });
    }

    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            history.pushState({ page: 'profile' }, '', '/profile');
            setCurrentPage('profile');
            renderApp();
        });
    }

    const leaderboardBtn = document.getElementById('leaderboardBtn');
    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', () => {
            history.pushState({ page: 'leaderboard' }, '', '/leaderboard');
            setCurrentPage('leaderboard');
            renderApp();
        });
    }
}
