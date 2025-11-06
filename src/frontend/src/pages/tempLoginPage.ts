import { setCurrentUser } from '../utils/globalState';
import { createGuestUser } from '../_api/auth';
import { updateUserProfile } from '../_api/user';
import { authService } from '../utils/auth';

export function renderTempLoginPage(): void {
  const root = document.getElementById('app-root');
  if (!root) return;

  root.innerHTML = `
    <div class="neon-grid">
      <div class="grid-anim"></div>
      <div class="glass-card" style="max-width: 450px; width: 100%;">

        <div style="text-align: center; margin-bottom: 2em;">
          <h1 class="title-neon" style="font-size: 2.5rem; margin-bottom: 0.5rem;">Welcome Guest!</h1>
          <p style="color: #9ca3af; font-size: 1rem;">Jump right into Pong without creating an account</p>
        </div>

        <div class="glass-card" style="padding: 2em; margin-bottom: 1.5em;">
          <p style="color: rgba(255,255,255,0.9); text-align: center; margin-bottom: 1.5em; font-size: 1rem;">
            🎮 Quick guest access to start playing immediately!
          </p>

          <div style="margin-bottom: 1.5em;">
            <label for="usernameInput" style="display: block; margin-bottom: 0.5em; font-weight: 600; color: #9ca3af; font-size: 0.9rem;">Choose a Guest Name (optional)</label>
            <input
              id="usernameInput"
              type="text"
              placeholder="Enter guest name or leave blank for random"
              maxlength="20"
              style="width: 100%; padding: 0.75em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 1em; transition: border-color 0.2s;"
              onfocus="this.style.borderColor='rgba(0, 255, 255, 0.5)'; this.style.boxShadow='0 0 10px rgba(0, 255, 255, 0.1)';"
              onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='none';"
            />
          </div>

          <button id="addGuestBtn" class="btn btn-neon primary" style="width: 100%; font-size: 1.2em; padding: 0.8em;">
            🎮 Play as Guest
          </button>

          <div id="guestError" style="margin-top: 1em; text-align: center; font-size: 0.9em; min-height: 1.2em;"></div>
        </div>

        <div style="text-align: center;">
          <button id="backLandingBtn" class="btn btn-neon accent" style="padding: 0.6em 1.5em;">
            ← Back to Landing
          </button>
        </div>

      </div>
    </div>
  `;

  // Get DOM elements FIRST (before using them)
  const addGuestBtn = document.getElementById('addGuestBtn');
  const guestErrorEl = document.getElementById('guestError');
  const usernameInput = document.getElementById('usernameInput') as HTMLInputElement | null;
  const backBtn = document.getElementById('backLandingBtn');

  // Handle Guest Login
  if (addGuestBtn && usernameInput) {
    addGuestBtn.addEventListener('click', async () => {
      if (guestErrorEl) guestErrorEl.textContent = '';
      
      addGuestBtn.textContent = 'Creating guest...';
      (addGuestBtn as HTMLButtonElement).disabled = true;

      // Get username from input, or undefined if empty (backend will generate random)
      const username = usernameInput.value.trim() || undefined;
      const result = await createGuestUser(username);

      if (result.success && result.token) {        
        // Mark as guest user
        localStorage.setItem('isGuest', 'true');

        // Update current user
        const userData = {
          username: username,
          email: 'guest@transcendence.com',
          firstName: 'Guest',
          lastName: 'User',
          avatar: null,
          emailVerified: 'true',
          gamesPlayed: 0,
          gamesWon: 0,
          gamesLost: 0
        };
      
        localStorage.setItem('currentUser', JSON.stringify(userData));
        setCurrentUser(result.username || 'Guest');
        
        // Show success message
        if (guestErrorEl) {
          guestErrorEl.style.color = '#10b981';
          guestErrorEl.innerHTML = '<span style="color: #10b981;">✓ Welcome! Redirecting...</span>';
        }
        
        // Redirect to landing page
        setTimeout(() => {
          history.pushState({ page: 'landing' }, '', '/');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, 800);
      } else {
        if (guestErrorEl) {
          guestErrorEl.innerHTML = `<span style="color: #ef4444;">❌ ${result.error || 'Failed to create guest user'}</span>`;
        }
        addGuestBtn.textContent = '🎮 Play as Guest';
        (addGuestBtn as HTMLButtonElement).disabled = false;
      }
    });
  }

  // Handle Back Button
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      history.pushState({ page: 'landing' }, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  }

}