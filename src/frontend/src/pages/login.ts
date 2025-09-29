async function loginUser(username: string, password: string): Promise<{ success: boolean; username?: string; error?: string }> {

	const res = await fetch(`http://localhost:3000/api/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password })
	});
	if (res.ok) {
		const data = await res.json().catch(() => ({}));
		return data;
	}
    if (res.status === 404) {
        return { success: false, error: 'API not available (404)' };
    } else if ( res.status === 401 ) {
        return { success: false, error: 'Invalid username/email or password' };
    }
	return { success: false, error: res.message || `Server error (${res.status})` };
}


export default function renderLoginPage() {
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

				const token = result.token;
				if (token) {
					localStorage.setItem('authToken', token);
				}

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
}