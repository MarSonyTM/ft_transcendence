import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { createPingPongBalls } from '../utils/pingPongBalls';


export async function renderStartPage(): Promise<void> {
  const root = document.getElementById('app-root');
  if (!root) return;

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

  const guestBtn = document.getElementById('guestBtn');
  if (guestBtn) {
    guestBtn.addEventListener('click', () => {
      history.pushState({ page: 'temp-login' }, '', '/temp-login');
      setCurrentPage('temp-login');
      renderApp();
    });
  }
  
  // Add ping pong balls animation
  createPingPongBalls();
}