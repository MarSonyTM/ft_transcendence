import { setCurrentPage, setCurrentUser } from '../utils/globalState';
import { renderApp } from '../main';
import {  setAccessToken } from '../utils/api';
import { loginUser } from '../_api/auth';




export function renderLoginPage(): void {
    const root = document.getElementById('app-root');
    if (!root) return;
    root.innerHTML = `
        <div class="login-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
            <h2 style="font-size: 2em; margin-bottom: 1em;">Login</h2>
            <form id="loginForm" style="display: flex; flex-direction: column; gap: 1em; min-width: 250px;">
                <input id="usernameInput" type="text" placeholder="Username" required style="padding: 0.5em; font-size: 1.2em;" />
                <input id="passwordInput" type="password" placeholder="Password" required style="padding: 0.5em; font-size: 1.2em;" />
                <button type="submit" class="btn btn-login" style="font-size: 1.2em;">Login</button>
                <div id="loginError" style="color: red; margin-top: 0.5em;"></div>
            </form>
            <div style="margin: 1em 0; text-align: center; color: #666;">or</div>
            <button id="googleSignInBtn" style="display: flex; align-items: center; justify-content: center; gap: 0.5em; padding: 0.5em; font-size: 1.1em; background: #fff; color: #333; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; min-width: 250px;">
                <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
            </button>
            <button id="backToLandingBtn" class="btn btn-back" style="margin-top: 2em; font-size: 1.2em; background: #6b7280; color: white; border: none; border-radius: 8px; padding: 0.5em 1.5em; cursor: pointer;">Back</button>
        </div>
    `;
    const loginForm = document.getElementById('loginForm') as HTMLFormElement;
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('usernameInput') as HTMLInputElement;
            const passwordInput = document.getElementById('passwordInput') as HTMLInputElement;
            const loginError = document.getElementById('loginError');
            if (loginError) loginError.textContent = '';
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            const result = await loginUser(username, password);

            if (result.success) {
				const loginError = document.getElementById('loginError');
				if (loginError) loginError.style.color = 'green';
				if (loginError) loginError.textContent = 'Login successful! Redirecting...';

				// Redirect to dashboard after short delay 
                setTimeout(() => {
					history.pushState({ page: 'dashboard' }, '', '/dashboard');
					// Trigger main SPA to re-render (since main.ts controls pages)
					window.dispatchEvent(new PopStateEvent('popstate'));
				}, 1000);
            } else if (loginError) {
                loginError.textContent = result.error || 'Login failed';
            }
        });
    }
    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.pushState({ page: 'landing' }, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
    }

    // Google Sign-In button
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', () => {
            // Redirect to backend Google OAuth endpoint
            window.location.href = 'http://localhost:3000/api/auth/google';
        });
    }
}
