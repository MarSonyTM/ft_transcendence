import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';


export async function renderStartPage(): Promise<void> {
  const root = document.getElementById('app-root');
if (!root) return;

  root.innerHTML = `
        <div class="landing-container">
            <h1 class="main-title">PING PONG</h1>
            <button id="loginBtn" class="btn btn-login">Login</button>
            <button id="registerBtn" class="btn btn-register">Register</button>
            <button id="guestBtn" class="btn btn-register">Play as Guest</button>
        </div>
        `;

	const loginBtn = document.getElementById('loginBtn');
		if (loginBtn) {
			loginBtn.addEventListener('click', () => {
				history.pushState({ page: 'login' }, '', '/login');
				setCurrentPage('login');
				renderApp();
			});
		}
		
		const registerBtn = document.getElementById('registerBtn');
		if (registerBtn) {
			registerBtn.addEventListener('click', () => {
				history.pushState({ page: 'register' }, '', '/register');
				setCurrentPage('register');
				renderApp();
			});
		}
	
		const guestBtn = document.getElementById('guestBtn');
		if (guestBtn) {
			guestBtn.addEventListener('click', () => {
				history.pushState({ page: 'tempLogin' }, '', '/tempLogin');
				setCurrentPage('tempLogin');
				renderApp();
			});
		}
}