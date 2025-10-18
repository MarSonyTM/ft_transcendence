import { registerUser } from '../_api/auth';
import { validateEmail } from '../utils/validateEmail';



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
				<input id="regEmail" type="email" placeholder="Email" required style="padding:.6em;font-size:1.1em;" />
				<input id="regAvatar" type="text" placeholder="Avatar URL (optional)" style="padding:.6em;font-size:1.1em;" />
				<input id="regPassword" type="password" placeholder="Password" required style="padding:.6em;font-size:1.1em;" />
				<input id="regPassword2" type="password" placeholder="Confirm Password" required style="padding:.6em;font-size:1.1em;" />
				<button type="submit" class="btn btn-register" style="font-size:1.2em;font-weight:bold;background:#4ade80;color:#222;padding:.7em;border:none;border-radius:8px;cursor:pointer;">Register</button>
				<div id="registerError" style="color:#f87171;min-height:1.2em;font-size:.95em;font-weight:500;"></div>
				<div id="registerSuccess" style="color:#4ade80;min-height:1.2em;font-size:1em;font-weight:600;"></div>
			</form>
			<div style="margin:1em 0;text-align:center;color:#666;">or</div>
			<button id="googleSignUpBtn" style="display:flex;align-items:center;justify-content:center;gap:0.5em;padding:0.6em;font-size:1.1em;background:#fff;color:#333;border:1px solid #ddd;border-radius:8px;cursor:pointer;min-width:280px;max-width:340px;width:100%;">
				<svg width="20" height="20" viewBox="0 0 24 24">
					<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
					<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
					<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
					<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
				</svg>
				Sign up with Google
			</button>
			<div style="margin-top:1.2em;display:flex;gap:.8em;">
				<button id="toLoginBtn" class="btn btn-back" style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:.5em 1.1em;cursor:pointer;font-weight:600;">Login</button>
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

	function setError(msg: string) {
		if (errEl) errEl.textContent = msg;
		if (successEl) successEl.textContent = '';
	}

	function setSuccess(msg: string) {
		if (successEl) successEl.textContent = msg;
		if (errEl) errEl.textContent = '';
	}

	if (form) {
		form.addEventListener('submit', async (e) => {
			e.preventDefault();
			setError('');

			const firstName = firstNameInput?.value.trim() || '';
			const lastName = lastNameInput?.value.trim() || '';
			const username = usernameInput?.value.trim() || '';
			const email = emailInput?.value.trim() || '';
			const password = passInput?.value || '';
			const password2 = pass2Input?.value || '';
			const avatar = avatarInput?.value.trim() || '';

			// Client-side validation
			if (!validateEmail(email)) return setError('Invalid email address');
			if (firstName.length < 1) return setError('First name is required');
			if (lastName.length < 1) return setError('Last name is required');
			if (username.length < 3) return setError('Username must be at least 3 chars');
			if (password.length < 4) return setError('Password must be at least 4 chars');
			if (password !== password2) return setError('Passwords do not match');

			const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
			if (submitBtn) {
				submitBtn.disabled = true;
				submitBtn.textContent = 'Registering...';
			}

			// API call to register user
			const result = await registerUser(
				username,
				password,
				firstName,
				lastName,
				email || undefined,
				avatar || undefined
			);

			console.log('Register result:', result);

			if (submitBtn) {
				submitBtn.disabled = false;
				submitBtn.textContent = 'Register';
			}

			if (result.success) {
				setSuccess('Account created! Please check your email for verification...');
				// Store email for verification page
				if (email) {
					localStorage.setItem('needEmailVerification', 'true');
					localStorage.setItem('pendingEmailVerification', email);
				}
				setTimeout(() => {
					history.pushState({ page: 'verifyEmail' }, '', '/verify-email');
					window.dispatchEvent(new PopStateEvent('popstate'));
				}, 1500);
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

	// Google Sign-Up button
	const googleSignUpBtn = document.getElementById('googleSignUpBtn');
	if (googleSignUpBtn) {
		googleSignUpBtn.addEventListener('click', () => {
			// Use relative URL to match the structure
			window.location.href = '/api/auth/google';
		});
	}
}