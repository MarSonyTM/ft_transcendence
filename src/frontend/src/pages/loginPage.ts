import { setCurrentPage, setCurrentUser } from '../utils/globalState';
import { renderApp } from '../main';
import { loginUser } from '../_api/auth';
import { authService } from '../utils/auth';

export function renderLoginPage(): void {
    const root = document.getElementById('app-root');
    if (!root) return;
    root.innerHTML = `
        <div class="neon-grid profile-container" style="width:100%; max-width:1400px; margin: 0 auto; ">
            <div class="glass-card" style="max-width: 480px; width: 100%;  padding: 0 2em;">

                <!-- Header -->
                <div style="text-align: center; margin-bottom: 1.5em;">
                    <h1 class="title-neon" style="font-size: 2rem; margin-bottom: 0.3rem; line-height: 1.2;">Welcome Back</h1>
                    <p style="color: #9ca3af; font-size: 0.9rem; margin: 0;">Sign in to continue playing</p>
                </div>

                <!-- Login form -->
                <form id="loginForm" style="display: flex; flex-direction: column; gap: 1em; width: 100%;">

                    <div>
                        <label for="usernameInput" style="display: block; margin-bottom: 0.4em; font-weight: 600; color: #9ca3af; font-size: 0.85rem;">Username</label>
                        <input
                            id="usernameInput"
                            type="text"
                            placeholder="Enter your username"
                            required
                            style="width: 100%; padding: 0.7em 0.9em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 0.9em; transition: border-color 0.2s; box-sizing: border-box;"
                            onfocus="this.style.borderColor='rgba(0, 255, 255, 0.5)'; this.style.boxShadow='0 0 10px rgba(0, 255, 255, 0.1)';"
                            onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='none';"
                        />
                    </div>

                    <div>
                        <label for="passwordInput" style="display: block; margin-bottom: 0.4em; font-weight: 600; color: #9ca3af; font-size: 0.85rem;">Password</label>
                        <input
                            id="passwordInput"
                            type="password"
                            placeholder="Enter your password"
                            required
                            style="width: 100%; padding: 0.7em 0.9em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 0.9em; transition: border-color 0.2s; box-sizing: border-box;"
                            onfocus="this.style.borderColor='rgba(0, 255, 255, 0.5)'; this.style.boxShadow='0 0 10px rgba(0, 255, 255, 0.1)';"
                            onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='none';"
                        />
                    </div>

                    <div id="loginError" style="text-align: center; font-size: 0.85em; min-height: 1.2em; color: #ef4444; margin: 0.3em 0;"></div>

                    <button
                        type="submit"
                        class="btn btn-neon primary"
                        style="width: 100%; font-size: 0.95em; padding: 0.75em 1.5em; margin-top: 0.3em;"
                    >
                        🚀 Login
                    </button>

                    <div style="position: relative; margin: 0.8em 0;">
                        <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.2); margin: 0;">
                        <span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: rgba(0, 0, 0, 0.8); padding: 0 1em; color: #9ca3af; font-size: 0.8rem;">or</span>
                    </div>

                    <button id="googleSignInBtn" type="button" class="btn btn-neon accent" style="display: flex; align-items: center; justify-content: center; gap: 0.6em; padding: 0.75em 1.5em; font-size: 0.9em; width: 100%;">
                        <svg width="18" height="18" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            <path fill="none" d="M1 1h22v22H1z"/>
                        </svg>
                        <span>Continue with Google</span>
                    </button>
                </form>

                <!-- Footer -->
                <div style="margin-top: 1.5em; padding-top: 1em; border-top: 1px solid rgba(255, 255, 255, 0.1); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.8em;">
                    <p style="color: #9ca3af; font-size: 0.85em; margin: 0;">
                        Don't have an account?
                        <button id="toRegisterBtn" class="btn btn-neon accent" style="padding: 0.2em 0.6em; font-size: 0.85em; margin-left: 0.3em;">Create one</button>
                    </p>
                    <button id="backLandingBtn" class="btn btn-neon primary" style="padding: 0.5em 1em; font-size: 0.85em;">
                        ← Back
                    </button>
                </div>

            </div>
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

            // Check if 2FA is required
            if (result.requires2FA) {
                // Store 2FA pending state
                if (result.userId && result.username) {
                    authService.setPending2FAVerification({
                        userId: result.userId,
                        username: result.username
                    });
                }

                // Show message about 2FA
                if (errorEl) {
                    errorEl.style.color = '#f59e0b';
                    errorEl.style.textAlign = 'left';
                    errorEl.textContent = 'Two-factor authentication required. Redirecting...';
                }

                // Redirect to 2FA verification page
                setTimeout(() => {
                    history.pushState({ page: 'twoFactorAuth' }, '', '/two-factor-auth');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                }, 1500);
                return;
            }

            if (result.success) {
                // Update current user
                setCurrentUser(result.username || username);

                // Check if email is verified
                if (!result.emailVerified) {
                    // Show message about email verification
                    if (errorEl) {
                        errorEl.style.color = '#f59e0b';
                        errorEl.style.textAlign = 'left';
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
                        errorEl.style.color = '#10b981';
                        errorEl.style.textAlign = 'left';
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