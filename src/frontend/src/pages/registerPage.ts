import { registerUser } from '../_api/auth';
import { validateEmail } from '../utils/validateEmail';
import { authService } from '../utils/auth';



export default function renderRegisterPage(): void {
	const root = document.getElementById('app-root');
	if (!root) return;

	root.innerHTML = `
		<div class="neon-grid profile-container" style="width:100%; max-width:1800px;">
			<div class="grid-anim"></div>
			<div class="glass-card" style="max-width: 520px; width: 100%; padding: 0 2em;">

				<!-- Header -->
				<div style="text-align: center; margin-bottom: 1.5em;">
					<h1 class="title-neon" style="font-size: 2rem; margin-bottom: 0.3rem; line-height: 1.2;">Create Account</h1>
					<p style="color: #9ca3af; font-size: 0.9rem; margin: 0;">Join the Pong community</p>
				</div>

				<!-- Registration form -->
				<form id="registerForm" style="display: flex; flex-direction: column; gap: 1em; width: 100%;">

					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8em; width: 100%;">
						<div style="width: 100%;">
							<label for="regFirstName" style="display: block; margin-bottom: 0.4em; font-weight: 600; color: #9ca3af; font-size: 0.85rem;">First Name</label>
							<input
								id="regFirstName"
								type="text"
								placeholder="First name"
								required
								style="width: 100%; padding: 0.7em 0.9em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 0.9em; transition: border-color 0.2s; box-sizing: border-box;"
								onfocus="this.style.borderColor='rgba(0, 255, 255, 0.5)'; this.style.boxShadow='0 0 10px rgba(0, 255, 255, 0.1)';"
								onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='none';"
							/>
						</div>

						<div style="width: 100%;">
							<label for="regLastName" style="display: block; margin-bottom: 0.4em; font-weight: 600; color: #9ca3af; font-size: 0.85rem;">Last Name</label>
							<input
								id="regLastName"
								type="text"
								placeholder="Last name"
								required
								style="width: 100%; padding: 0.7em 0.9em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 0.9em; transition: border-color 0.2s; box-sizing: border-box;"
								onfocus="this.style.borderColor='rgba(0, 255, 255, 0.5)'; this.style.boxShadow='0 0 10px rgba(0, 255, 255, 0.1)';"
								onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='none';"
							/>
						</div>
					</div>

					<div style="width: 100%;">
						<label for="regUsername" style="display: block; margin-bottom: 0.4em; font-weight: 600; color: #9ca3af; font-size: 0.85rem;">Username</label>
						<input
							id="regUsername"
							type="text"
							placeholder="Choose a unique username"
							required
							style="width: 100%; padding: 0.7em 0.9em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 0.9em; transition: border-color 0.2s; box-sizing: border-box;"
							onfocus="this.style.borderColor='rgba(0, 255, 255, 0.5)'; this.style.boxShadow='0 0 10px rgba(0, 255, 255, 0.1)';"
							onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='none';"
						/>
					</div>

					<div style="width: 100%;">
						<label for="regEmail" style="display: block; margin-bottom: 0.4em; font-weight: 600; color: #9ca3af; font-size: 0.85rem;">Email</label>
						<input
							id="regEmail"
							type="email"
							placeholder="Enter your email address"
							required
							style="width: 100%; padding: 0.7em 0.9em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 0.9em; transition: border-color 0.2s; box-sizing: border-box;"
							onfocus="this.style.borderColor='rgba(0, 255, 255, 0.5)'; this.style.boxShadow='0 0 10px rgba(0, 255, 255, 0.1)';"
							onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='none';"
						/>
					</div>

					<div style="width: 100%;">
						<label for="regAvatar" style="display: block; margin-bottom: 0.4em; font-weight: 600; color: #9ca3af; font-size: 0.85rem;">Avatar URL (optional)</label>
						<input
							id="regAvatar"
							type="text"
							placeholder="https://example.com/avatar.jpg"
							style="width: 100%; padding: 0.7em 0.9em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 0.9em; transition: border-color 0.2s; box-sizing: border-box;"
							onfocus="this.style.borderColor='rgba(0, 255, 255, 0.5)'; this.style.boxShadow='0 0 10px rgba(0, 255, 255, 0.1)';"
							onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='none';"
						/>
					</div>

					<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8em; width: 100%;">
						<div style="width: 100%;">
							<label for="regPassword" style="display: block; margin-bottom: 0.4em; font-weight: 600; color: #9ca3af; font-size: 0.85rem;">Password</label>
							<input
								id="regPassword"
								type="password"
								placeholder="Password"
								required
								style="width: 100%; padding: 0.7em 0.9em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 0.9em; transition: border-color 0.2s; box-sizing: border-box;"
								onfocus="this.style.borderColor='rgba(0, 255, 255, 0.5)'; this.style.boxShadow='0 0 10px rgba(0, 255, 255, 0.1)';"
								onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='none';"
							/>
						</div>

						<div style="width: 100%;">
							<label for="regPassword2" style="display: block; margin-bottom: 0.4em; font-weight: 600; color: #9ca3af; font-size: 0.85rem;">Confirm Password</label>
							<input
								id="regPassword2"
								type="password"
								placeholder="Confirm"
								required
								style="width: 100%; padding: 0.7em 0.9em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 0.9em; transition: border-color 0.2s; box-sizing: border-box;"
								onfocus="this.style.borderColor='rgba(0, 255, 255, 0.5)'; this.style.boxShadow='0 0 10px rgba(0, 255, 255, 0.1)';"
								onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='none';"
							/>
						</div>
					</div>

					<div id="registerError" style="text-align: center; font-size: 0.85em; min-height: 1.2em; color: #ef4444; margin: 0.3em 0;"></div>
					<div id="registerSuccess" style="text-align: center; font-size: 0.85em; min-height: 1.2em; color: #10b981; margin: 0;"></div>

					<button type="submit" class="btn btn-neon primary" style="width: 100%; font-size: 0.95em; padding: 0.75em 1.5em; margin-top: 0.3em;">
						🚀 Create Account
					</button>

					<div style="position: relative; margin: 0.8em 0;">
						<hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.2); margin: 0;">
						<span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: rgba(0, 0, 0, 0.8); padding: 0 1em; color: #9ca3af; font-size: 0.8rem;">or</span>
					</div>

					<button id="googleSignUpBtn" type="button" class="btn btn-neon accent" style="display: flex; align-items: center; justify-content: center; gap: 0.6em; padding: 0.75em 1.5em; font-size: 0.9em; width: 100%;">
						<svg width="18" height="18" viewBox="0 0 24 24">
							<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
							<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
							<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
							<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
						</svg>
						<span>Continue with Google</span>
					</button>
				</form>

				<!-- Footer -->
				<div style="margin-top: 1.5em; padding-top: 1em; border-top: 1px solid rgba(255, 255, 255, 0.1); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.8em;">
					<p style="color: #9ca3af; font-size: 0.85em; margin: 0;">
						Already have an account?
						<button id="toLoginBtn" class="btn btn-neon accent" style="padding: 0.2em 0.6em; font-size: 0.85em; margin-left: 0.3em;">Sign in</button>
					</p>
					<button id="backLandingBtn" class="btn btn-neon primary" style="padding: 0.5em 1em; font-size: 0.85em;">
						← Back
					</button>
				</div>

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
					authService.setNeededEmailVerification(true);
					authService.setPendingEmailVerification(email);
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