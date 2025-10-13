import './styles.css';
import { AppPage } from './types';
import { getCurrentPage, setCurrentPage, getCurrentUser, setCurrentUser } from './utils/globalState';
import { renderLandingPage } from './pages/landingPage';
import { renderLoginPage } from './pages/loginPage';
import { renderGameSelectPage } from './pages/gameSelectPage';
import { renderProfilePage } from './pages/profilePage';
import { render2PlayerGame } from './pages/2PlayerGame';
import { render4PlayerGame } from './pages/4PlayerGame';
import renderRegisterPage from './pages/registerPage';
import renderAuthCallbackPage from './pages/authCallback';
import { renderJoinPage } from './pages/joinPage';
import { renderLobbyPage, cleanupLobby } from './pages/lobbyPage';
import { renderFriendsPage } from './pages/friendsPage';

// Store current room ID for join links
let currentRoomId: string | null = null;

// Centralized routing handler
function handleRouting(): void {
  const path = window.location.pathname;
  const hash = window.location.hash;

  // Handle /join/:roomId URLs (path-based routing)
  const joinMatch = path.match(/^\/join\/([a-z0-9]+)$/i);
  if (joinMatch) {
    currentRoomId = joinMatch[1];
    console.log('Joining room:', currentRoomId);
    setCurrentPage('join');
    renderApp();
    return;
  }

  // Handle hash-based routing
  if (hash) {
    const hashPage = hash.replace('#', '');
    switch (hashPage) {
      //case 'game':
      //  setCurrentPage('game');
      //  break;
      case 'login':
        setCurrentPage('login');
        break;
      case 'gameSelect':
        setCurrentPage('gameSelect');
        break;
      case 'profile':
        setCurrentPage('profile');
        break;
      case 'lobby':
        setCurrentPage('lobby');
        break;
      case 'register':
        setCurrentPage('register');
        break;
      case 'authCallback':
        setCurrentPage('authCallback');
        break;
      case 'friends':
        setCurrentPage('friends');
        break;
      case '2playergame':
        setCurrentPage('2playergame');
        break;
      case '4playergame':
        setCurrentPage('4playergame');
        break;
      default:
        setCurrentPage('landing');
    }
    renderApp();
    return;
  }

  // Handle path-based routing
  switch (path) {
    case '/':
    case '/home':
      setCurrentPage('landing');
      break;
    case '/login':
      setCurrentPage('login');
      break;
    case '/register':
      setCurrentPage('register');
      break;
    case '/lobby':
      setCurrentPage('lobby');
      break;
    //case '/game':
    //  setCurrentPage('game');
    //  break;
    case '/gameSelect':
      setCurrentPage('gameSelect');
      break;
    case '/profile':
      setCurrentPage('profile');
      break;
    case '/auth/callback':
      setCurrentPage('authCallback');
      break;
    case '/2playergame':
      setCurrentPage('2playergame');
      break;
    case '/4playergame':
      setCurrentPage('4playergame');
      break;
    default:
      setCurrentPage('landing');
  }
  renderApp();
}

export async function renderApp(): Promise<void> {
  const page = getCurrentPage();
  
  if (page !== 'lobby' && page !== '2playergame' && page !== '4playergame') {
    cleanupLobby();
  }

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
    case 'join':
      if (currentRoomId) {
        await renderJoinPage(currentRoomId);
      } else {
        // Fallback if no room ID
        setCurrentPage('landing');
        renderLandingPage();
      }
      break;
    case 'lobby':
      // Check if we have a pending room join from session storage
      const pendingRoomJoin = sessionStorage.getItem('pendingRoomJoin');
      if (pendingRoomJoin) {
        sessionStorage.removeItem('pendingRoomJoin');
        await renderLobbyPage(pendingRoomJoin);
      } else {
        await renderLobbyPage();
      }
      break;
    case 'profile':
      renderProfilePage();
      break;
    //case 'game':
    //  renderGamePage();
    //  break;
    case '2playergame':
      render2PlayerGame();
      break;
    case '4playergame':
      render4PlayerGame();
      break;
    case 'friends':
      renderFriendsPage();
      break;
    default:
      renderLandingPage();
  }
}

// Handle browser navigation (back/forward)
window.addEventListener('popstate', async () => {
  console.log('🔙 Navigation event:', {
    path: window.location.pathname,
    hash: window.location.hash
  });
  
  // Reset room ID on navigation
  currentRoomId = null;
  
  // Use centralized routing
  handleRouting();
});

// Entry point with SSR support
document.addEventListener('DOMContentLoaded', async () => {
  console.log('App starting with SSR support...');
  
  // Always derive the page from URL routing to support deep links like /join/:roomId
  if (window.__INITIAL_STATE__) {
    setCurrentUser(window.__USERNAME__ || '');
  }
  handleRouting();
});

// Add types for SSR support
declare global {
  interface Window {
    __INITIAL_STATE__?: any;
    __CURRENT_PAGE__?: string;
    __USERNAME__?: string;
  }
}