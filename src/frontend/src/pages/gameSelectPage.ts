import { setCurrentPage, setCurrentUser, setCurrentGameMode, getCurrentUser } from '../utils/globalState';
import { renderApp } from '../main';

export function renderGameSelectPage(): void {
    const root = document.getElementById('app-root');
    if (!root) return;
    
    root.innerHTML = `
        <div class="game-select-container">
            <h2 class="select-title">Choose Game Mode</h2>
            <div class="game-mode-options">
                <button id="1v1Btn" class="btn btn-game-mode">1v1 Match</button>
                <button id="4PlayerBtn" class="btn btn-game-mode">4 Player Match</button>
            </div>
            <button id="backToLandingBtn" class="btn btn-back">Back</button>
        </div>
    `;
    
    const oneVsOneBtn = document.getElementById('1v1Btn');
    if (oneVsOneBtn) {
        oneVsOneBtn.addEventListener('click', () => {
            if (!getCurrentUser()) {
                setCurrentUser('Player 1');
            }
            setCurrentGameMode('1v1');
            history.pushState({ page: 'lobby' }, '', '/lobby');
            setCurrentPage('lobby');
            renderApp();
        });
    }
    
    const fourPlayerBtn = document.getElementById('4PlayerBtn');
    if (fourPlayerBtn) {
        fourPlayerBtn.addEventListener('click', () => {
            if (!getCurrentUser()) {
                setCurrentUser('Player 1');
            }
            setCurrentGameMode('4player');
            history.pushState({ page: 'lobby' }, '', '/lobby');
            setCurrentPage('lobby');
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