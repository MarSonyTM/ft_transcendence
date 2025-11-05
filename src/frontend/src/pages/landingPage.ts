import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';

export async function renderLandingPage(): Promise<void> {
    const root = document.getElementById('app-root');
    if (!root) return;

    // Ensure auth initialization completes before deciding what to render
    // to avoid briefly showing guest/login UI when a valid session exists.
    await authService.whenReady();


        const res = await authService.fetchUserProfile();
        if (!res) {
            return;
        }
        
        root.innerHTML = `
        <div class="landing-container">
        <h1 class="main-title">PING PONG</h1>
        <button id="profileBtn" class="btn btn-profile">Profile</button>
        <button id="leaderboardBtn" class="btn btn-profile">Leaderboard</button>
        <button id="playBtn" class="btn btn-play">Play</button>
        </div>
        `;
    
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

    const leaderboardBtn = document.getElementById('leaderboardBtn');
    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', () => {
            history.pushState({ page: 'leaderboard' }, '', '/leaderboard');
            setCurrentPage('leaderboard');
            renderApp();
        });
    }
}
