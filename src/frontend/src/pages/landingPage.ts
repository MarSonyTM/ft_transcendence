import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';

export async function renderLandingPage(): Promise<void> {
    const root = document.getElementById('app-root');
    if (!root) return;

    if (!authService.isAuthenticated()) {
        root.innerHTML = `
        <div class="landing-container">
            <h1 class="main-title">PING PONG</h1>
            <button id="loginBtn" class="btn btn-login">Login</button>
            <button id="registerBtn" class="btn btn-register">Register</button>
            <button id="guestBtn" class="btn btn-register">Play as Guest</button>
        </div>
        `;
    }
    else {
        await authService.fetchUserProfile();
        // const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || ''; // TODO: mgeiger- Friend Notification
        // const newFriends = await fetch(`${apiEndpoint}/api/friends/requests/pending`, {
        //     headers: {
        //         'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        //     }
        // });
        // ${!newFriends ? '<button id="profileBtn" class="btn btn-profile">New Friend</button>' : '<button id="profileBtn" class="btn btn-profile">Profile</button>'}
        
        root.innerHTML = `
        <div class="landing-container">
        <h1 class="main-title">PING PONG</h1>
        <button id="profileBtn" class="btn btn-profile">Profile</button>
        <button id="playBtn" class="btn btn-play">Play</button>
        </div>
        `;
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

    const guestBtn = document.getElementById('guestBtn');
    if (guestBtn) {
        guestBtn.addEventListener('click', () => {
            history.pushState({ page: 'tempLogin' }, '', '/tempLogin');
            setCurrentPage('tempLogin');
            renderApp();
        });
    }
    
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
}