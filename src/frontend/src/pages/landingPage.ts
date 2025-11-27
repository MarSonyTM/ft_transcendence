import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { createPingPongBalls } from '../utils/pingPongBalls';
import { createUserNav, attachUserNavListeners } from '../utils/navigation';
import { presenceService } from '../utils/presenceService';

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
        <div class="neon-grid profile-container" style="width:100%; max-width:1200px; margin: 0 auto;">
          <div class="grid-anim"></div>
          <div class="glass-card" style=" text-align:center; width:100%; position: relative;">
            <h1 class="main-title title-neon" style="margin-bottom:.25em;">PING PONG</h1>
            <p style="color:#9ca3af; text-align:center; max-width:640px; margin: 0 auto 1em auto;">Welcome to ft_transcendence. Play classic Pong, join rooms, and compete on the leaderboard.</p>
            <div style="display:flex; gap:0.8em; flex-wrap:wrap; justify-content:center; margin: .75em;">
              <button id="guestBtn" class="btn-neon primary">Play as Guest</button>
              <button id="loginBtn" class="btn-neon accent">Login</button>
              <button id="registerBtn" class="btn-neon accent">Register</button>
            </div>
          </div>
        </div>`;
        const guestBtn = document.getElementById('guestBtn');
        if (guestBtn) {
            guestBtn.addEventListener('click', () => {
                history.pushState({ page: 'temp-login' }, '', '/temp-login');
                setCurrentPage('temp-login');
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
        // Add ping pong balls animation
        createPingPongBalls();
        return;
    }

    // Authenticated landing
    const userNavHTML = await createUserNav();
    root.innerHTML = `
    ${userNavHTML}
    <div class="neon-grid profile-container" style="width:100%; max-width:1200px; margin: 0 auto;">
      <div class="grid-anim"></div>
      <div style="width:100%; display:flex; flex-direction:column; align-items:center; gap:1em; padding:0.75em 1.5em 0.5em 1.5em; justify-content: center; min-height: 80vh;">
        <div style="text-align:center; width:100%;">
          <h1 class="main-title title-neon" style="margin:0 0 0.15em 0; font-size:4rem;">PING PONG</h1>
          <p style="color:#9ca3af; font-size:1rem; max-width:600px; margin:0 auto;">Welcome back! Ready to play?</p>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1.25em; width:100%; max-width:1000px;">
          <div class="glass-card action-card" style="padding:1.5em 1.25em; text-align:center; cursor:pointer; transition:transform 0.2s ease;" id="playCard">
            <div style="font-size:2.25rem; margin-bottom:0.3em;">🎮</div>
            <h2 style="font-size:1.4rem; font-weight:600; margin-bottom:0.3em; color:#fff;">Play Game</h2>
            <p style="color:#9ca3af; font-size:0.875rem; margin-bottom:1em;">Start a new match and compete</p>
            <button id="playBtn" class="btn-neon primary" style="width:100%; padding:0.75em; font-size:0.95rem; font-weight:600;">Play Now</button>
          </div>
          <div class="glass-card action-card" style="padding:1.5em 1.25em; text-align:center; cursor:pointer; transition:transform 0.2s ease;" id="leaderboardCard">
            <div style="font-size:2.25rem; margin-bottom:0.3em;">🏆</div>
            <h2 style="font-size:1.4rem; font-weight:600; margin-bottom:0.3em; color:#fff;">Leaderboard</h2>
            <p style="color:#9ca3af; font-size:0.875rem; margin-bottom:1em;">View top players and rankings</p>
            <button id="leaderboardBtn" class="btn-neon accent" style="width:100%; padding:0.75em; font-size:0.95rem; font-weight:600;">View Rankings</button>
          </div>
          <div class="glass-card action-card" style="padding:1.5em 1.25em; text-align:center; cursor:pointer; transition:transform 0.2s ease;" id="profileCard">
            <div style="font-size:2.25rem; margin-bottom:0.3em;">👤</div>
            <h2 style="font-size:1.4rem; font-weight:600; margin-bottom:0.3em; color:#fff;">Profile</h2>
            <p style="color:#9ca3af; font-size:0.875rem; margin-bottom:1em;">Manage your account and stats</p>
            <button id="profileBtn" class="btn-neon accent" style="width:100%; padding:0.75em; font-size:0.95rem; font-weight:600;">View Profile</button>
          </div>
        </div>
      </div>
    </div>`;
    
    attachUserNavListeners();
    
    const playBtn = document.getElementById('playBtn');
    const playCard = document.getElementById('playCard');
    const playHandler = () => {
        history.pushState({ page: 'gameSelect' }, '', '/game-select');
        setCurrentPage('gameSelect');
        renderApp();
    };
    if (playBtn) playBtn.addEventListener('click', playHandler);
    if (playCard) playCard.addEventListener('click', playHandler);

    const profileBtn = document.getElementById('profileBtn');
    const profileCard = document.getElementById('profileCard');
    const profileHandler = () => {
        history.pushState({ page: 'profile' }, '', '/profile');
        setCurrentPage('profile');
        renderApp();
    };
    if (profileBtn) profileBtn.addEventListener('click', profileHandler);
    if (profileCard) profileCard.addEventListener('click', profileHandler);

    const createBtn = document.getElementById('createBtn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            renderApp();
        });
    }

    const leaderboardBtn = document.getElementById('leaderboardBtn');
    const leaderboardCard = document.getElementById('leaderboardCard');
    const leaderboardHandler = () => {
        history.pushState({ page: 'leaderboard' }, '', '/leaderboard');
        setCurrentPage('leaderboard');
        renderApp();
    };
    if (leaderboardBtn) leaderboardBtn.addEventListener('click', leaderboardHandler);
    if (leaderboardCard) leaderboardCard.addEventListener('click', leaderboardHandler);
    
    // Add ping pong balls animation
    createPingPongBalls();
	  await presenceService.setOnline();
}
