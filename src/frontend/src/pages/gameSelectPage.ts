import { setCurrentPage, setCurrentUser, setCurrentGameMode, getCurrentUser } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';

export function renderGameSelectPage(): void {
    const root = document.getElementById('app-root');
    if (!root) return;
    
    root.innerHTML = `
        <div class="neon-grid landing-tight game-select-container" style="display:flex; flex-direction:column; align-items:center; min-height:70vh; width:100%; max-width:980px;">
            <div class="grid-anim"></div>
            <div class="glass-card" style="padding:2em 2em; text-align:center; width:100%;">
                <h2 class="select-title title-neon">Choose Game Mode</h2>
                <div class="game-mode-options" style="align-items:center;">
                    <button id="2PBtn" class="btn-neon primary" style="font-size: 1.2em;">1 vs 1 Match</button>
                    <button id="4PBtn" class="btn-neon primary" style="font-size: 1.2em;">4 Player Match</button>
                </div>
                <button id="backToLandingBtn" class="btn btn-back">Back</button>
            </div>
        </div>
    `;
    
    const oneVsOneBtn = document.getElementById('2PBtn');
    if (oneVsOneBtn) {
        oneVsOneBtn.addEventListener('click', () => {
            if (!getCurrentUser()) {
                setCurrentUser('Player 1');
            }
            setCurrentGameMode('2P');
            history.pushState({ page: 'lobby' }, '', '#lobby');
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
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await authService.logout();
            history.pushState({ page: 'landing' }, '', '/');
            setCurrentPage('landing');
            renderApp();
        });
    }

    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.pushState({ page: 'landing' }, '', '/');
            setCurrentPage('landing');
            renderApp();
        });
    }
}