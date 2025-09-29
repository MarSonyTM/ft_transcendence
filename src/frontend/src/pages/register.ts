
interface RegisterResult {
	success: boolean;
	username?: string;
	error?: string;
}

// Attempt a backend registration;
async function registerUser(username: string, password: string, firstName: string, lastName: string, email?: string, avatar?: string): Promise<RegisterResult> {
	const apiEndpoint = (window as any).__INITIAL_STATE__?.apiEndpoint || '';
	// Basic client-side validation
	if (!username || !password || !firstName || !lastName) {
		return { success: false, error: 'Username, password, first name & last name required' };
	}
	// send to backend
	try {
		const resp = await fetch(`http://localhost:3000/api/auth/create`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username, password, firstName, lastName, email, avatar })
		});
		if (resp.ok) {
			const data = await resp.json().catch(() => ({}));
			console.log('Register response data:', data);
			// Assume success flag OR presence of id/username indicates success
			if (data.success !== false) {
				return { success: true, ...data };
			}
			return { success: false, error: data.message || 'Registration failed' };
		}
		// If 404, treat as mock mode
		if (resp.status === 404) {
			await new Promise(r => setTimeout(r, 400));
			return { success: false, username };
		}
		return { success: false, error: `Server error (${resp.status})` };
	} catch (e: any) {
		return { success: false, username };
	}
}

export default function renderRegisterPage(): void {
	const root = document.getElementById('app-root');
	if (!root) return;
	root.innerHTML = `
		<div class="register-container" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:80vh;">
			<h2 style="font-size:2.5em;margin-bottom:.5em;font-weight:bold;">Create Account</h2>
			<form id="registerForm" style="display:flex;flex-direction:column;gap:1em;min-width:280px;max-width:340px;width:100%;">
				<input id="regFirstName" type="text" placeholder="First Name" required style="padding:.6em;font-size:1.1em;" />
				<input id="regLastName" type="text" placeholder="Last Name" required style="padding:.6em;font-size:1.1em;" />
				<input id="regUsername" type="text" placeholder="Username" required style="padding:.6em;font-size:1.1em;" />
				<input id="regEmail" type="email" placeholder="Email (optional)" style="padding:.6em;font-size:1.1em;" />
				<input id="regAvatar" type="text" placeholder="Avatar URL (optional)" style="padding:.6em;font-size:1.1em;" />
				<input id="regPassword" type="password" placeholder="Password" required style="padding:.6em;font-size:1.1em;" />
				<input id="regPassword2" type="password" placeholder="Confirm Password" required style="padding:.6em;font-size:1.1em;" />
				<button type="submit" class="btn btn-register" style="font-size:1.2em;font-weight:bold;background:#4ade80;color:#222;padding:.7em;border:none;border-radius:8px;cursor:pointer;">Register</button>
				<div id="registerError" style="color:#f87171;min-height:1.2em;font-size:.95em;font-weight:500;"></div>
				<div id="registerSuccess" style="color:#4ade80;min-height:1.2em;font-size:1em;font-weight:600;"></div>
			</form>
			<div style="margin-top:1.2em;display:flex;gap:.8em;">
				<button id="toLoginBtn" class="btn btn-login" style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:.5em 1.1em;cursor:pointer;font-weight:600;">Login</button>
				<button id="backLandingBtn" class="btn btn-back" style="background:#6b7280;color:#fff;border:none;border-radius:6px;padding:.5em 1.1em;cursor:pointer;font-weight:600;">Back</button>
			</div>
		</div>
	`;

	const form = document.getElementById('registerForm') as HTMLFormElement | null;
	const firstNameInput = document.getElementById('regFirstName') as HTMLInputElement | null;
	const lastNameInput = document.getElementById('regLastName') as HTMLInputElement | null;
	const usernameInput = document.getElementById('regUsername') as HTMLInputElement | null;
	const emailInput = document.getElementById('regEmail') as HTMLInputElement | null;
	const passInput = document.getElementById('regPassword') as HTMLInputElement | null;
	const pass2Input = document.getElementById('regPassword2') as HTMLInputElement | null;
	const avatarInput = document.getElementById('regAvatar') as HTMLInputElement | null;
	const errEl = document.getElementById('registerError');
	const successEl = document.getElementById('registerSuccess');

	function setError(msg: string) { if (errEl) errEl.textContent = msg; }
	function clearError() { if (errEl) errEl.textContent = ''; }
	function setSuccess(msg: string) { if (successEl) successEl.textContent = msg; }
	function clearSuccess() { if (successEl) successEl.textContent = ''; }

	if (form) {
		form.addEventListener('submit', async (e) => {
			e.preventDefault();
			clearError();
			clearSuccess();
			const firstName = firstNameInput?.value.trim() || '';
			const lastName = lastNameInput?.value.trim() || '';
			const username = usernameInput?.value.trim() || '';
			const email = emailInput?.value.trim() || '';
			const password = passInput?.value || '';
			const password2 = pass2Input?.value || '';
			const avatar = avatarInput?.value.trim() || '';

			if (firstName.length < 1) return setError('First name is required');
			if (username.length < 3) return setError('Username must be at least 3 chars');
			if (password.length < 4) return setError('Password must be at least 4 chars');
			if (password !== password2) return setError('Passwords do not match');

			const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
			if (submitBtn) submitBtn.disabled = true;
			if (submitBtn) submitBtn.textContent = 'Registering...';

			// Attempt registration
			const result = await registerUser(username, password, firstName, lastName || undefined, email || undefined, avatar || undefined);
			console.log('Register result:', result);
			if (submitBtn) submitBtn.disabled = false;
			if (submitBtn) submitBtn.textContent = 'Register';

			if (result.success) {
				setSuccess('Account created! Redirecting to login...');
				// Redirect to login after short delay
				setTimeout(() => {
					history.pushState({ page: 'login' }, '', '/login');
					// Trigger main SPA to re-render (since main.ts controls pages)
					window.dispatchEvent(new PopStateEvent('popstate'));
				}, 900);
			} else {
				setError(result.error || 'Registration failed');
			}
		});
	}

	const toLoginBtn = document.getElementById('toLoginBtn');
	if (toLoginBtn) {
		toLoginBtn.addEventListener('click', () => {
			history.pushState({ page: 'login' }, '', '/login');
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
}
