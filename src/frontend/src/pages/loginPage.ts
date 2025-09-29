import { setCurrentPage, setCurrentUser } from '../utils/globalState';
import { renderApp } from '../main';

export async function loginUser(username: string, password: string): Promise<{ success: boolean; username?: string; error?: string }> {
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    if (username) {
        setCurrentUser(username);
        return { success: true, username };
    } else {
        return { success: false, error: 'Username required' };
    }
}

export function renderLoginPage(): void {
    const root = document.getElementById('app-root');
    if (!root) return;
    
    root.innerHTML = `
        <div class="login-container">
            <h2>Login</h2>
            <form id="login-form">
                <input id="usernameInput" type="text" class="input-field" placeholder="Username" required/>
                <input id="passwordInput" type="password" class="input-field" placeholder="Password" required/>
                <button type="submit" class="btn btn-login">Login</button>
                <div id="loginError"></div>
            </form>
            <button id="backToLandingBtn" class="btn btn-back">Back</button>
        </div>
    `;
    
    const loginForm = document.getElementById('login-form') as HTMLFormElement;
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
            
            if (result.success && result.username) {
                setCurrentUser(result.username);
                history.pushState({ page: 'landing' }, '', '#landing');
                setCurrentPage('landing');
                renderApp();
            } else if (loginError) {
                loginError.textContent = result.error || 'Login failed';
            }
        });
    }
    
    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.pushState({ page: 'landing' }, '', '#');
            setCurrentPage('landing');
            renderApp();
        });
    }
}