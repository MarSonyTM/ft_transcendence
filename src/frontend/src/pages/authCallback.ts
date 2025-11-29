import { authService } from "../utils/auth";
import { API_BASE } from "../config";

const apiEndpoint = API_BASE;

export default  async function renderAuthCallbackPage(): Promise<void> {
    const root = document.getElementById('app-root');
    if (!root) return;

    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const error = urlParams.get('error');
    const email = urlParams.get('email');
    const token = urlParams.get('token');
    const needEmailVerification = urlParams.get('needEmailVerification');
    const requires2FA = urlParams.get('requires2FA');
    const userId = urlParams.get('userId');
    const username = urlParams.get('username');

    // Handle 2FA requirement from Google OAuth
    if (requires2FA === 'true' && userId && username) {
        // Store 2FA pending state
        authService.setPending2FAVerification({
            userId: parseInt(userId),
            username: username
        });

        root.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
                <h2 style="color: #f59e0b; margin-bottom: 1em;">Two-Factor Authentication Required</h2>
                <p style="color: #666; margin-bottom: 2em;">Redirecting to 2FA verification...</p>
                <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #f59e0b; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;

        // Redirect to 2FA verification page
        setTimeout(() => {
            history.pushState({ page: 'twoFactorAuth' }, '', '/two-factor-auth');
            window.dispatchEvent(new PopStateEvent('popstate'));
        }, 1500);
        return;
    }

    if (success === 'true') {
        // Only set email verification flags if actually needed
        const needsVerification = needEmailVerification === 'true';
        if (needsVerification && email) {
            authService.setPendingEmailVerification(email);
            authService.setNeededEmailVerification(true);
        } else {
            // Clear any existing verification flags
            authService.setPendingEmailVerification(null);
            authService.setNeededEmailVerification(false);
        }
        
        root.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
                <h2 style="color: #4ade80; margin-bottom: 1em;">Authentication Successful!</h2>
                <p style="color: #666; margin-bottom: 2em;">Redirecting to dashboard...</p>
                <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #4ade80; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;

        // Send the token to backend to set it as a cookie
        if (token) {
            try {
                console.log('🔄 Setting token cookie via backend...');
                const response = await fetch(`${apiEndpoint}/api/auth/set-token`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                
                if (response.ok) {
                    // Now fetch user profile with the cookie set
                    const userProfile = await authService.fetchUserProfile();
                    
                    // After fetching profile, verify the email status matches
                    // If email is verified, clear the verification flag
                    if (userProfile && userProfile.emailVerified) {
                        authService.setNeededEmailVerification(false);
                    }
                } else {
                    console.error('❌ Failed to set token cookie:', response.status);
                    const errorData = await response.json().catch(() => ({}));
                    console.error('Error details:', errorData);
                }
            } catch (error) {
                console.error('❌ Error setting token cookie:', error);
            }
        } else {
            console.error('❌ No token found in URL parameters');
        }

        
        // Redirect to dashboard after short delay
        console.log("it logged in")
        setTimeout(() => {
            history.pushState({ page: 'landing' }, 'landing', '/landing');
            window.dispatchEvent(new PopStateEvent('popstate'));
        }, 2000);
    } else {
        // Show error message
        const errorMessage = error || 'Authentication failed';
        root.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
                <h2 style="color: #f87171; margin-bottom: 1em;">Authentication Failed</h2>
                <p style="color: #666; margin-bottom: 2em; text-align: center; max-width: 400px;">${errorMessage}</p>
                <div style="display: flex; gap: 1em;">
                    <button id="retryAuthBtn" style="background: #3b82f6; color: white; border: none; border-radius: 6px; padding: 0.5em 1.5em; cursor: pointer; font-weight: 600;">
                        Try Again
                    </button>
                    <button id="backToLoginBtn" style="background: #6b7280; color: white; border: none; border-radius: 6px; padding: 0.5em 1.5em; cursor: pointer; font-weight: 600;">
                        Back to Login
                    </button>
                </div>
            </div>
        `;

        // Add event listeners for buttons
        const retryBtn = document.getElementById('retryAuthBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                window.location.href = `${apiEndpoint}/api/auth/google`;
            });
        }

        const backToLoginBtn = document.getElementById('backToLoginBtn');
        if (backToLoginBtn) {
            backToLoginBtn.addEventListener('click', () => {
                history.pushState({ page: 'login' }, '', '/login');
                window.dispatchEvent(new PopStateEvent('popstate'));
            });
        }
    }
}