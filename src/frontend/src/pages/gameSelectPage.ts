import { setCurrentPage, setCurrentUser, setCurrentGameMode, getCurrentUser } from '../utils/globalState';
import { renderApp } from '../main';
import { renderSetup } from './tournamentLobbyPage';
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
                    <button id="tournamentBtn" class="btn-neon primary" style="font-size: 1.2em;">Tournament</button>
                </div>
            </div>
            <div style="display: flex; gap: 1.2em; justify-content: center; padding-top: 1.5em; border-top: 1px solid rgba(255,255,255,0.1);">
                    <button id="backToLandingBtn" class="btn btn-back" style="font-size: 1em; background: rgba(255, 255, 255, 0.03); color: rgb(156 163 175); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; padding: 0.65em 1.8em; cursor: pointer; font-weight: 500; transition: all 0.3s ease;">← Home</button>
                </div>
        </div>
    `;
    
    attachUserNavListeners();

    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.pushState({ page: 'landing' }, '', '/');
            setCurrentPage('landing');
            renderApp();
        });
    }
    
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
    
    const tournamentBtn = document.getElementById('tournamentBtn');
    if (tournamentBtn) {
        tournamentBtn.addEventListener('click', () => {
            if (!getCurrentUser()) {
                setCurrentUser('Player 1');
            }
            setCurrentGameMode('2P');
            history.pushState({ page: 'tournament' }, '', '/tournament');
            setCurrentPage('tournament');
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