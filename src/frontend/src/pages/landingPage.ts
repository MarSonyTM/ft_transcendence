import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';

export function renderLandingPage(): void {
    const root = document.getElementById('app-root');
    if (!root) return;
    
    root.innerHTML = `
        <button id="profileBtn" class="btn btn-profile">Profile</button>
        <div class="landing-container">
            <h1 class="main-title">PING PONG</h1>
            <button id="loginBtn" class="btn btn-login">Login</button>
            <button id="registerBtn" class="btn btn-register">Register</button>
            <button id="playBtn" class="btn btn-play">Play</button>
        </div>
    `;
    
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
    
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            history.pushState({ page: 'gameSelect' }, '', '#gameSelect');
            setCurrentPage('gameSelect');
            renderApp();
        });
    }

    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            history.pushState({ page: 'profile' }, '', '#profile');
            setCurrentPage('profile');
            renderApp();
        });
    }
}