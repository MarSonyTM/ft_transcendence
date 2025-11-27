import './styles/styles.css';
import { AppPage } from './types';
import { getCurrentPage, setCurrentPage, setCurrentUser } from './utils/globalState';
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
import { renderTempLoginPage } from './pages/tempLoginPage';
import { renderEditProfilePage } from './pages/editProfilePage';
import { renderChangeUsernamePage } from './pages/changeUsernamePage';
import { renderChangeEmailPage } from './pages/changeEmailPage';
import { renderVerifyEmailPage } from './pages/verifyEmail';
import { renderLeaderboardPage } from './pages/leaderboardPage';
import { renderTournamentPage, cleanupTournamentPage } from './pages/tournamentPage';
import { renderStatsPage } from './pages/statsPage';
import { authService } from './utils/auth';
import { renderStartPage } from './pages/startPage';
import { removePingPongBalls } from './utils/pingPongBalls';
import { renderTwoFactorAuthPage } from './pages/twoAuth';

// Store current room ID for join links
let currentRoomId: string | null = null;

export const publicPages = ['/ping-pong', '/login', '/register', '/auth/callback', '//auth/callback', '/verify-email', '/resend-verification', '/two-factor-auth'];

// Centralized routing handler
async function handleRouting(): Promise<void> {
  const path = window.location.pathname;

  // Skip auth check on public pages (including auth callback)
  const isPublicPage = publicPages.some(publicPath => path.includes(publicPath.replace('//', '/')));

  if (!isPublicPage) {
    await authService.whenReady(); 
    const user = await authService.getCurrentUser();
    
    if (!user) {
      console.log('User not authenticated, redirecting to login');
      if (path !== '/ping-pong') {
        history.pushState({ page: 'pingPong' }, '', '/ping-pong');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
      return;
    }
    
    const needsVerification = authService.isEmailVerificationNeeded();
    if (needsVerification) {
      history.pushState({ page: 'verifyEmail' }, '', '/verify-email');
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }
  }

  // Handle /join/:roomId URLs (path-based routing)
  const joinMatch = path.match(/^\/join\/([a-z0-9]+)$/i);
  if (joinMatch) {
    currentRoomId = joinMatch[1];
    console.log('Joining room:', currentRoomId);
    setCurrentPage('join');
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
    case '/game-select':
      setCurrentPage('gameSelect');
      break;
    case '/profile':
      setCurrentPage('profile');
      break;
    case '/edit-profile':
      setCurrentPage('editProfile');
      break;
    case '/change-username':
      setCurrentPage('changeUsername');
      break;
    case '/change-email':
      setCurrentPage('changeEmail');
      break;
    case '/friends':
        setCurrentPage('friends');
        break;
    case '/auth/callback':
      setCurrentPage('authCallback');
      break;
    case '/2PGame':
      setCurrentPage('2PGame');
      break;
    case '/4PGame':
      setCurrentPage('4PGame');
      break;
    case '/temp-login':
        setCurrentPage('temp-login');
        break;
    case '/verify-email':
      setCurrentPage('verifyEmail');
      break;
    case '/leaderboard':
      setCurrentPage('leaderboard');
      break;
    case '/tournament':
      setCurrentPage('tournament');
      break;
    case '/stats':
      setCurrentPage('stats');
      break; 
    case '/ping-pong':
      setCurrentPage('pingPong');
      break;
    case '/two-factor-auth':
      setCurrentPage('twoFactorAuth');
      break;
    default:
      setCurrentPage('landing');
  }
  renderApp();
}

export async function renderApp(): Promise<void> {
  const page = getCurrentPage();

  if (page !== 'lobby' && page !== '2PGame' && page !== '4PGame' && page !== 'tournament') {
    cleanupLobby();
  }
  if (page !== 'tournament') {
    cleanupTournamentPage();
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
      await renderAuthCallbackPage();
      break;
    case 'join':
      if (currentRoomId) {
        await renderJoinPage(currentRoomId);
      } else {
        setCurrentPage('landing');
        renderLandingPage();
      }
      break;
    case 'lobby':
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
    case 'editProfile':
      renderEditProfilePage();
      break;
    case 'changeUsername':
      renderChangeUsernamePage();
      break;
    case 'changeEmail':
      renderChangeEmailPage();
      break;
    case '2PGame':
      removePingPongBalls(); // Remove balls on game pages
      render2PlayerGame();
      break;
    case '4PGame':
      removePingPongBalls(); // Remove balls on game pages
      render4PlayerGame();
      break;
    case 'friends':
      renderFriendsPage();
      break;
    case 'temp-login':
      renderTempLoginPage();
      break;
    case 'verifyEmail':
      renderVerifyEmailPage();
      break;
    case 'leaderboard':
      renderLeaderboardPage();
      break;
    case 'tournament':
      renderTournamentPage();
      break;
    case 'stats':
      renderStatsPage();
      break; 
    case 'pingPong':
      renderStartPage();
      break;
    case 'twoFactorAuth':
      await renderTwoFactorAuthPage();
      break;
    default:
      renderLandingPage();
  }
}

// Handle browser navigation (back/forward)
window.addEventListener('popstate', async () => {
  
  // Reset room ID on navigation
  currentRoomId = null;
  
  // Use centralized routing
  handleRouting();
});

// Entry point with SSR support
document.addEventListener('DOMContentLoaded', async () => {  
  if (window.__INITIAL_STATE__) {
    setCurrentUser(window.__USERNAME__ || '');
  }
  handleRouting();
});

// Add types for SSR support
declare global {
  interface Window {
    __INITIAL_STATE__?: {
      gameState: any;
      gameId: number | null;
      currentUser: string;
      currentPage: string;
      timestamp: number;
      apiEndpoint: string;
      wsEndpoint: string;
      environment: string;
    };
    __GAME_STATE__?: any;
    __GAME_ID__?: number | null;
    __USERNAME__?: string;
    __CURRENT_PAGE__?: string;
    game?: any;
  }
}
