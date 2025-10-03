import './styles.css';
import { AppPage } from './types';
import { getCurrentPage, setCurrentPage, getCurrentUser, setCurrentUser } from './utils/globalState';
import { renderLandingPage } from './pages/landingPage';
import { renderLoginPage } from './pages/loginPage';
import { renderGameSelectPage } from './pages/gameSelectPage';
import { renderProfilePage } from './pages/profilePage';
import { renderLobbyPage } from './pages/lobbyPage';
import { renderGamePage, pongGame } from './pages/gamePage';
import renderRegisterPage from './pages/registerPage';
import renderAuthCallbackPage from './pages/authCallback';

export async function renderApp(): Promise<void> {
    const page = getCurrentPage();
    
    switch (page) {
        case 'landing':
            renderLandingPage();
            break;
        case 'login':
            renderLoginPage();
            break;
        case 'gameSelect':
            renderGameSelectPage();
            break;
        case 'register':
            renderRegisterPage();
            break;
        case 'authCallback':
            renderAuthCallbackPage();
            break;
        case 'lobby':
            renderLobbyPage();
            break;
        case 'profile':
            renderProfilePage();
            break;
        default:
            renderGamePage();
    }
}

// Handle browser navigation (back/forward)
window.addEventListener('popstate', async () => {
    if (location.hash === '#game') {
        setCurrentPage('game');
        await renderApp();
    } else if (location.hash === '#login') {
        setCurrentPage('login');
        await renderApp();
    } else if (location.hash === '#gameSelect') {
        setCurrentPage('gameSelect');
        await renderApp();
    } else if (location.hash === '#profile') {
        setCurrentPage('profile');
        await renderApp();
    } else if (location.hash === '#lobby') {
        setCurrentPage('lobby');
        await renderApp();
    } else if (location.hash === '#register') {
        setCurrentPage('register');
        await renderApp();
    } else if (location.hash === '#authCallback') {
        setCurrentPage('authCallback');
        await renderApp();
    } else {
        if (pongGame) {
            await pongGame.pauseGame();
        }
        setCurrentUser('');
        setCurrentPage('landing');
        await renderApp();
    }
});

// Entry point with SSR support
document.addEventListener('DOMContentLoaded', async () => {
    console.log('App starting with SSR support...');
    
    if (window.__INITIAL_STATE__) {
        setCurrentPage((window.__CURRENT_PAGE__ as AppPage) || 'landing');
        setCurrentUser(window.__USERNAME__ || '');
    } else {
        console.log('No SSR data found, using URL-based routing');
        
        if (location.hash === '#game') {
            setCurrentPage('game');
        } else if (location.hash === '#login') {
            setCurrentPage('login');
        } else if (location.hash === '#gameSelect') {
            setCurrentPage('gameSelect');
        } else if (location.hash === '#profile') {
            setCurrentPage('profile');
        } else if (location.hash === '#lobby') {
            setCurrentPage('lobby');
        } else if (location.hash === '#register') {
            setCurrentPage('register');
        } else if (location.hash === '#authCallback') {
            setCurrentPage('authCallback');
        } else {
            setCurrentPage('landing');
        }
    }
    
    await renderApp();
});