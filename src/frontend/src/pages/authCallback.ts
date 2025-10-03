export default function renderAuthCallbackPage(): void {
    const root = document.getElementById('app-root');
    if (!root) return;

    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const success = urlParams.get('success');
    const error = urlParams.get('error');

    if (success === 'true' && token) {
        // Store the token and redirect to dashboard
        localStorage.setItem('authToken', token);
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
        
        // Redirect to dashboard after short delay
        setTimeout(() => {
            history.pushState({ page: 'dashboard' }, '', '/dashboard');
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
                window.location.href = 'http://localhost:3000/api/auth/google';
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