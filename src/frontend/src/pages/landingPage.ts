import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { registerUser } from '../_api/auth.ts';
import { updateUserProfile } from '../_api/user';

export async function renderLandingPage(): Promise<void> {
    const root = document.getElementById('app-root');
    if (!root) return;

    if (!authService.isAuthenticated()) {
        root.innerHTML = `
        <div class="landing-container">
            <h1 class="main-title">PING PONG</h1>
            <button id="loginBtn" class="btn btn-login">Login</button>
            <button id="registerBtn" class="btn btn-register">Register</button>
            <button id="guestBtn" class="btn btn-register">Play as Guest</button>
        </div>
        `;
    }
    else {
        await authService.fetchUserProfile();
        const isGuest = localStorage.getItem("isGuest");
        
        root.innerHTML = `
        <div class="landing-container">
        <h1 class="main-title">PING PONG</h1>
        <button id="profileBtn" class="btn btn-profile">Profile</button>
        ${isGuest ? '<button id="createBtn" class="btn btn-profile">Create Account</button>': ''}
        <button id="leaderboardBtn" class="btn btn-profile">Leaderboard</button>
        <button id="playBtn" class="btn btn-play">Play</button>
        </div>
        `;
    }
    
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
    
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            history.pushState({ page: 'gameSelect' }, '', '/gameSelect');
            setCurrentPage('gameSelect');
            renderApp();
        });
    }

    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            history.pushState({ page: 'profile' }, '', '/profile');
            setCurrentPage('profile');
            renderApp();
        });
    }

    const createBtn = document.getElementById('createBtn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            saveAccount();
            renderApp();
        });
    }

    const leaderboardBtn = document.getElementById('leaderboardBtn');
    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', () => {
            history.pushState({ page: 'leaderboard' }, '', '/leaderboard');
            setCurrentPage('leaderboard');
            renderApp();
        });
    }

    async function saveAccount() {
        let email = prompt('Enter email address');
        let emailConfirm = prompt('Confirm email address');
        if (email == emailConfirm) {

            let password = prompt('Enter password');
            let passwordConfirm = prompt('Confirm password');
            if (password == passwordConfirm) {
                const user =  await authService.fetchUserProfile();
                if (user && password) {
                    user.gamesWon
                    const result = await registerUser(
	    			    user.username,
		    		    password,
			    	    user.firstName || 'Guest',
				        user.lastName || 'User',
				        email || undefined,
				        user.avatar || undefined
			        );              
                    if (result.success) {
                        updateUserProfile( {
                            gamesWon: user.gamesWon,
                            gamesLost: user.gamesLost
                        });
                        await authService.logout();
                    }
                }
            }
            alert('Account Created\nPlease verify email then update your details'); 
        }
    }
}
