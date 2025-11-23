import { setCurrentPage, setCurrentUser, setCurrentGameMode, getCurrentUser } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { createUserNav, attachUserNavListeners } from '../utils/navigation';

export async function renderGameSelectPage(): Promise<Promise<void>> {
    const root = document.getElementById('app-root');
    if (!root) return;
    
    const userNavHTML = await createUserNav();
    root.innerHTML = `
        ${userNavHTML}
        <div class="neon-grid profile-container" style="width:100%; max-width:1200px; margin: 0 auto;">
            <div class="grid-anim"></div>
            <div class="glass-card" style="padding:2em 2em; text-align:center; width:100%;">
                <h2 class="select-title title-neon">Choose Game Mode</h2>
                <div class="game-mode-options" style="align-items:center;">
                    <button id="2PBtn" class="btn-neon primary" style="font-size: 1.2em;">1 vs 1 Match</button>
                    <button id="4PBtn" class="btn-neon primary" style="font-size: 1.2em;">4 Player Match</button>
                </div>
            </div>
        </div>
    `;
    
    attachUserNavListeners();
    
    const oneVsOneBtn = document.getElementById('2PBtn');
    if (oneVsOneBtn) {
        oneVsOneBtn.addEventListener('click', () => {
            if (!getCurrentUser()) {
                setCurrentUser('Player 1');
            }
            setCurrentGameMode('2P');
            history.pushState({ page: 'lobby' }, '', '/lobby');
            setCurrentPage('lobby');
            renderApp();
        });
    }
    
    const fourPlayerBtn = document.getElementById('4PBtn');
    if (fourPlayerBtn) {
        fourPlayerBtn.addEventListener('click', () => {
            if (!getCurrentUser()) {
                setCurrentUser('Player 1');
            }
            setCurrentGameMode('4P');
            history.pushState({ page: 'lobby' }, '', '/lobby');
            setCurrentPage('lobby');
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

    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            history.pushState({ page: 'profile' }, '', '/profile');
            setCurrentPage('profile');
            renderApp();
        });
    }
}