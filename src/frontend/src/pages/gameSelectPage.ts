import { setCurrentPage, setCurrentUser, setCurrentGameMode, getCurrentUser } from '../utils/globalState';
import { renderApp } from '../main';
import { renderSetup } from './tournamentLobbyPage';

export function renderGameSelectPage(): void {
    const root = document.getElementById('app-root');
    if (!root) return;
    
    root.innerHTML = `
        <div class="game-select-container">
            <h2 class="select-title">Choose Game Mode</h2>
            <div class="game-mode-options">
                <button id="2PBtn" class="btn btn-game-mode">1 vs 1 Match</button>
                <button id="4PBtn" class="btn btn-game-mode">4 Player Match</button>
                <button id="tournamentBtn" class="btn btn-game-mode">Tournament</button>
            </div>
            <button id="backToLandingBtn" class="btn btn-back">Back</button>
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
    
    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.pushState({ page: 'landing' }, '', '/');
            setCurrentPage('landing');
            renderApp();
        });
    }
}