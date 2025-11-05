import { setCurrentUser } from '../utils/globalState';
import { createGuestUser } from '../_api/auth';
import { updateUserProfile } from '../_api/user';
import { authService } from '../utils/auth';

export function renderTempLoginPage(): void {
  const root = document.getElementById('app-root');
  if (!root) return;

  root.innerHTML = `
    <div class="login-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; padding: 2em;">
        <div style="background: rgba(255,255,255,0.05); padding: 2em; border-radius: 15px; max-width: 400px; width: 100%; backdrop-filter: blur(10px);">
            <p style="color: rgba(255,255,255,0.9); text-align: center; margin-bottom: 1em; font-size: 0.9em;">
                Jump right into the game as a guest!
            </p>
        <div style="display: flex; gap: 0.5em; margin-bottom: 1em;">
			<input 
                id="usernameInput" 
                type="text" 
                placeholder="Guest" 
                style="padding: 0.8em; font-size: 1em; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; width: 100%;"
            />
		</div>
        <button id="addGuestBtn" class="btn btn-primary" style="width: 100%; font-size: 1.2em; padding: 0.8em; background: white; color: #667eea; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; transition: all 0.3s;">
          Play as Guest
        </button>
        <div id="guestError" style="color: #ffe0e0; margin-top: 0.5em; text-align: center; font-size: 0.9em;"></div>
      </div>

      <!-- Back Button -->
      <button 
        id="backLandingBtn" 
        class="btn btn-back" 
        style="margin-top: 2em; padding: 0.6em 1.5em; background: transparent; border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 8px; cursor: pointer; transition: all 0.3s;"
      >
        ← Back to Landing
      </button>
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
          guestErrorEl.style.color = '#90EE90';
          guestErrorEl.textContent = '✓ Welcome! Redirecting...';
        }
        
        // Redirect to landing page
        setTimeout(() => {
          history.pushState({ page: 'landing' }, '', '/');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, 800);
      } else {
        if (guestErrorEl) {
          guestErrorEl.textContent = result.error || 'Failed to create guest user';
        }
        addGuestBtn.textContent = 'Play as Guest';
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

  // Add hover effects
  addHoverEffects();
}

function addHoverEffects() {
  const addGuestBtn = document.getElementById('addGuestBtn');
  if (addGuestBtn) {
    addGuestBtn.addEventListener('mouseenter', () => {
      addGuestBtn.style.transform = 'scale(1.05)';
      addGuestBtn.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
    });
    addGuestBtn.addEventListener('mouseleave', () => {
      addGuestBtn.style.transform = 'scale(1)';
      addGuestBtn.style.boxShadow = 'none';
    });
  }
}