import { authService } from '../utils/auth';
import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { setCurrentRoom } from '../utils/roomState';

export async function renderJoinPage(roomId: string): Promise<void> {
  const root = document.getElementById('app-root');
  if (!root) return;

  console.log('Is authenticated:', authService.isAuthenticated());

  // Check if user is authenticated
  if (!authService.isAuthenticated()) {
    // Show login prompt with return URL
    showLoginPrompt(root, roomId);
    return;
  }

  // Show loading while verifying room
  root.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh;">
      <div style="background: rgb(55 65 81); border-radius: 12px; padding: 3em; text-align: center; max-width: 400px;">
        <div style="font-size: 3em; margin-bottom: 0.5em;">🎮</div>
        <h2 style="color: rgb(209 213 219); margin-bottom: 1em;">Joining Game Room...</h2>
        <div style="color: rgb(156 163 175); font-family: monospace; font-size: 1.2em; margin-bottom: 1em;">${roomId}</div>
        <div class="spinner" style="border: 3px solid rgb(75 85 99); border-top: 3px solid rgb(99 102 241); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto;"></div>
      </div>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;

  // Verify room exists
  try {
    //TODO: check if room need to add the credentials option
    const response = await fetch(`/api/room/${roomId}`);
    const data = await response.json();

    if (!data.success) {
      showRoomNotFound(root, roomId);
      return;
    }

    // Room exists: cache room locally to avoid race on next navigation
    if (data.room) {
      setCurrentRoom(data.room);
    }

    // Redirect to lobby with roomId (and update URL/state)
    // Store intent so main router can pass roomId to lobby
    sessionStorage.setItem('pendingRoomJoin', roomId);
    history.pushState({ page: 'lobby', roomId }, '', '/lobby');
    setCurrentPage('lobby');
    renderApp();
  } catch (error) {
    console.error('Error checking room:', error);
    showRoomError(root, roomId);
  }
}

function showLoginPrompt(root: HTMLElement, roomId: string): void {
  root.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; padding: 2em;">
      <div style="background: rgb(55 65 81); border-radius: 12px; padding: 3em; text-align: center; max-width: 500px;">
        <div style="font-size: 3em; margin-bottom: 0.5em;">🎮</div>
        <h2 style="color: rgb(209 213 219); margin-bottom: 0.5em; font-size: 2em;">Join Game Room</h2>
        <div style="color: rgb(156 163 175); font-family: monospace; font-size: 1.1em; margin-bottom: 1.5em; background: rgb(31 41 55); padding: 0.75em; border-radius: 6px;">
          ${roomId}
        </div>
        <p style="color: rgb(209 213 219); margin-bottom: 2em; line-height: 1.6;">
          You need to be logged in to join a game room.<br>
          Please login or create an account to continue.
        </p>
        <div style="display: flex; flex-direction: column; gap: 1em;">
          <button id="loginBtn" style="background: rgb(34 197 94); color: white; border: none; border-radius: 8px; padding: 0.75em 2em; font-size: 1.1em; font-weight: 600; cursor: pointer; transition: background 0.2s;">
            Login
          </button>
          <button id="registerBtn" style="background: rgb(99 102 241); color: white; border: none; border-radius: 8px; padding: 0.75em 2em; font-size: 1.1em; font-weight: 600; cursor: pointer; transition: background 0.2s;">
            Create Account
          </button>
          <button id="guestBtn" style="background: rgb(75 85 99); color: rgb(209 213 219); border: none; border-radius: 8px; padding: 0.75em 2em; font-size: 1em; font-weight: 500; cursor: pointer; transition: background 0.2s;">
            Continue as Guest
          </button>
        </div>
      </div>
    </div>
  `;

  // Store the roomId to redirect after login
  sessionStorage.setItem('pendingRoomJoin', roomId);

  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const guestBtn = document.getElementById('guestBtn');

  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      history.pushState({ page: 'login', returnTo: `/join/${roomId}` }, '', '/login');
      setCurrentPage('login');
      renderApp();
    });
  }

  if (registerBtn) {
    registerBtn.addEventListener('click', () => {
      history.pushState({ page: 'register', returnTo: `/join/${roomId}` }, '', '/register');
      setCurrentPage('register');
      renderApp();
    });
  }

  if (guestBtn) {
    guestBtn.addEventListener('click', async () => {
      const guestUsername = `Guest${Math.floor(Math.random() * 10000)}`;
      sessionStorage.setItem('guestUser', JSON.stringify({
        username: guestUsername,
        id: `guest-${Date.now()}`,
        emailVerified: 1
      }));
      
      await renderJoinPage(roomId);
    });
  }
}

function showRoomNotFound(root: HTMLElement, roomId: string): void {
  root.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; padding: 2em;">
      <div style="background: rgb(55 65 81); border-radius: 12px; padding: 3em; text-align: center; max-width: 500px;">
        <div style="font-size: 3em; margin-bottom: 0.5em;">❌</div>
        <h2 style="color: rgb(209 213 219); margin-bottom: 0.5em; font-size: 2em;">Room Not Found</h2>
        <div style="color: rgb(156 163 175); font-family: monospace; font-size: 1.1em; margin-bottom: 1.5em; background: rgb(31 41 55); padding: 0.75em; border-radius: 6px;">
          ${roomId}
        </div>
        <p style="color: rgb(209 213 219); margin-bottom: 2em; line-height: 1.6;">
          This game room doesn't exist or has already ended.<br>
          Would you like to create a new game room?
        </p>
        <div style="display: flex; flex-direction: column; gap: 1em;">
          <button id="createRoomBtn" style="background: rgb(34 197 94); color: white; border: none; border-radius: 8px; padding: 0.75em 2em; font-size: 1.1em; font-weight: 600; cursor: pointer; transition: background 0.2s;">
            Create New Room
          </button>
          <button id="homeBtn" style="background: rgb(75 85 99); color: rgb(209 213 219); border: none; border-radius: 8px; padding: 0.75em 2em; font-size: 1em; font-weight: 500; cursor: pointer; transition: background 0.2s;">
            Back to Home
          </button>
        </div>
      </div>
    </div>
  `;

  const createRoomBtn = document.getElementById('createRoomBtn');
  const homeBtn = document.getElementById('homeBtn');

  if (createRoomBtn) {
    createRoomBtn.addEventListener('click', () => {
      history.pushState({ page: 'lobby' }, '', '/lobby');
      setCurrentPage('lobby');
      renderApp();
    });
  }

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      history.pushState({ page: 'landing' }, '', '/');
      setCurrentPage('landing');
      renderApp();
    });
  }
}

function showRoomError(root: HTMLElement, roomId: string): void {
  root.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; padding: 2em;">
      <div style="background: rgb(55 65 81); border-radius: 12px; padding: 3em; text-align: center; max-width: 500px;">
        <div style="font-size: 3em; margin-bottom: 0.5em;">⚠️</div>
        <h2 style="color: rgb(209 213 219); margin-bottom: 0.5em; font-size: 2em;">Connection Error</h2>
        <p style="color: rgb(209 213 219); margin-bottom: 2em; line-height: 1.6;">
          Unable to connect to the game room.<br>
          Please check your connection and try again.
        </p>
        <div style="display: flex; flex-direction: column; gap: 1em;">
          <button id="retryBtn" style="background: rgb(99 102 241); color: white; border: none; border-radius: 8px; padding: 0.75em 2em; font-size: 1.1em; font-weight: 600; cursor: pointer; transition: background 0.2s;">
            Retry
          </button>
          <button id="homeBtn" style="background: rgb(75 85 99); color: rgb(209 213 219); border: none; border-radius: 8px; padding: 0.75em 2em; font-size: 1em; font-weight: 500; cursor: pointer; transition: background 0.2s;">
            Back to Home
          </button>
        </div>
      </div>
    </div>
  `;

  const retryBtn = document.getElementById('retryBtn');
  const homeBtn = document.getElementById('homeBtn');

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      renderJoinPage(roomId);
    });
  }

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      history.pushState({ page: 'landing' }, '', '/');
      setCurrentPage('landing');
      renderApp();
    });
  }
}