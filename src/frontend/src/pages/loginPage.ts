import { setCurrentPage, setCurrentUser } from '../utils/globalState';
import { renderApp } from '../main';
import { loginUser } from '../_api/auth';
import { authService } from '../utils/auth';

export function renderLoginPage(): void {
    const root = document.getElementById('app-root');
    if (!root) return;
    root.innerHTML = `
        <div class="login-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
            <div style="background: rgba(255,255,255,0.05); padding: 2em; border-radius: 15px; max-width: 400px; width: 100%; backdrop-filter: blur(10px);">
                <h2 style="font-size: 1.8em; margin-bottom: 1em; text-align: center;">Login</h2>
                
                <form id="loginForm" style="display: flex; flex-direction: column; gap: 1em;">
                <input 
                    id="usernameInput" 
                    type="text" 
                    placeholder="Username" 
                    required 
                    style="padding: 0.8em; font-size: 1em; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white;"
                />
                <input 
                    id="passwordInput" 
                    type="password" 
                    placeholder="Password" 
                    required 
                    style="padding: 0.8em; font-size: 1em; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white;"
                />
                <button 
                    type="submit" 
                    class="btn btn-login" 
                    style="font-size: 1.1em; padding: 0.8em; background: #4CAF50; color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.3s;"
                >
                    Login
                </button>
                <button id="googleSignInBtn" type="button" style="display: flex; align-items: center; justify-content: center; gap: 0.5em; padding: 0.5em; font-size: 1.1em; background: #fff; color: #333; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; min-width: 250px;">
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        <path fill="none" d="M1 1h22v22H1z"/>
                    </svg>
                    <span>Sign in with Google</span>
                </button>
                <div id="loginError" style="color: #ff6b6b; text-align: center; font-size: 0.9em;"></div>
                </form>
            </div>
            <p style="text-align: center; margin-top: 1.5em; color: #666; font-size: 0.9em;">
                Don't have an account? <button id="toRegisterBtn" style="background: none; border: none; color: #3b82f6; text-decoration: underline; cursor: pointer; font-size: 1em;">Register</button>
            </p>
            <button id="backLandingBtn" class="btn btn-back" style="margin-top: 1em;">Back to Landing</button>
        </div>
    `;

    const form = document.getElementById('loginForm') as HTMLFormElement | null;
    const usernameInput = document.getElementById('usernameInput') as HTMLInputElement | null;
    const passwordInput = document.getElementById('passwordInput') as HTMLInputElement | null;
    const errorEl = document.getElementById('loginError');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (errorEl) errorEl.textContent = '';

            const username = usernameInput?.value.trim() || '';
            const password = passwordInput?.value || '';

            if (!username || !password) {
                if (errorEl) errorEl.textContent = 'Please enter username and password';
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Logging in...';
            }

            const result = await loginUser(username, password);

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Login';
            }

            if (result.success) {
                // Update current user
                setCurrentUser(result.username || username);

                // Check if email is verified
                if (!result.emailVerified) {
                    // Show message about email verification
                    if (errorEl) {
                        errorEl.style.color = '#f59e0b';
                        errorEl.textContent = 'Please verify your email address. Redirecting...';
                    }

                    authService.setNeededEmailVerification(true);
                    // Redirect to verify email page
                    setTimeout(() => {
                        history.pushState({ page: 'verifyEmail' }, '', '/verify-email');
                        window.dispatchEvent(new PopStateEvent('popstate'));
                    }, 1500);
                } else {
                    // Show success message
                    if (errorEl) {
                        errorEl.style.color = 'green';
                        errorEl.textContent = 'Login successful! Redirecting...';
                    }

                    await authService.fetchUserProfile();
                    
                    // Redirect to landing page
                    setTimeout(() => {
                        history.pushState({ page: 'landing' }, '', '/');
                        window.dispatchEvent(new PopStateEvent('popstate'));
                    }, 500);
                }
            } else {
                if (errorEl) errorEl.textContent = result.error || 'Login failed';
            }
        });
    }

    const toRegisterBtn = document.getElementById('toRegisterBtn');
    if (toRegisterBtn) {
        toRegisterBtn.addEventListener('click', () => {
            history.pushState({ page: 'register' }, '', '/register');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
    }

    const backBtn = document.getElementById('backLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.pushState({ page: 'landing' }, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
    }

    // Google Sign-In button
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', (e) => {
            // Ensure clicking the Google button doesn't submit the form
            e.preventDefault();
            // Use the dynamic API endpoint for Google OAuth
            const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || 'http://localhost:3000';
            window.location.href = `${apiEndpoint}/api/auth/google`;
        });
    }
}