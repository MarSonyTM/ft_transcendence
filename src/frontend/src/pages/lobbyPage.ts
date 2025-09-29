import { setCurrentPage, getCurrentUser, getCurrentGameMode } from '../utils/globalState';
import { renderApp } from '../main';

export function renderLobbyPage(): void {
  const root = document.getElementById('app-root');
  if (!root) return;
  
  const players = [
    { username: getCurrentUser() || 'Player 1', isReady: true }
  ];

  const gameMode = getCurrentGameMode();
  const maxPlayers = gameMode === '1v1' ? 2 : 4;

  root.innerHTML = `
    <div class="lobby-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; padding: 2em;">
      
      <div class="lobby-card" style="background: rgb(55 65 81); border-radius: 12px; padding: 2em; box-shadow: 0 4px 6px rgba(0,0,0,0.3); min-width: 450px; max-width: 600px;">
        
        <h2 style="font-size: 2.5em; margin-bottom: 1em; margin-top: 0; color: rgb(209 213 219); text-align: center;">Lobby</h2>
        
        <div style="background: rgb(75 85 99); border-radius: 8px; padding: 1.5em; margin-bottom: 1.5em; min-height: 200px;">
          <h3 style="color: rgb(156 163 175); font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px; margin-top: 0; margin-bottom: 1em;">Players (${players.length}/${maxPlayers})</h3>
          
          <div class="players-list" style="display: flex; flex-direction: column; gap: 0.75em;">
            ${players.map(player => `
              <div style="background: rgb(55 65 81); padding: 1em; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span style="color: rgb(229 231 235); font-weight: 500;">${player.username}</span>
                <span style="color: ${player.isReady ? 'rgb(34 197 94)' : 'rgb(156 163 175)'}; font-size: 0.9em; font-weight: 500;">
                  ${player.isReady ? '✓ Ready' : 'Not Ready'}
                </span>
              </div>
            `).join('')}
          </div>
        </div>
        
        <button id="inviteUserBtn" class="btn" style="width: 100%; padding: 0.75em 1.5em; border-radius: 0.5rem; font-weight: 500; transition: background-color 150ms; border: none; cursor: pointer; background: rgb(75 85 99); color: rgb(209 213 219); font-size: 1.1em; margin-bottom: 1em;">
          + Invite Player
        </button>
        
        <button id="aiOpponentBtn" class="btn" style="width: 100%; padding: 0.75em 1.5em; border-radius: 0.5rem; font-weight: 500; transition: background-color 150ms; border: none; cursor: pointer; background: rgb(75 85 99); color: rgb(209 213 219); font-size: 1.1em; margin-bottom: 1em;">
          Play vs AI
        </button>
        
        <button id="startGameBtn" class="btn" style="width: 100%; padding: 0.75em 1.5em; border-radius: 0.5rem; font-weight: 500; transition: background-color 150ms; border: none; cursor: pointer; background: rgb(75 85 99); color: rgb(209 213 219); font-size: 1.1em; margin-bottom: 1em;">
          Start Game
        </button>
        
      </div>
      
      <button id="backBtn" class="btn btn-back" style="font-size: 1.1em; background: rgb(75 85 99); color: rgb(209 213 219); border: none; border-radius: 8px; padding: 0.75em 2em; cursor: pointer; transition: background 0.2s; font-weight: 500; margin-top: 1em;">
        Back to Home
      </button>
      
    </div>
  `;
  
  const inviteBtn = document.getElementById('inviteUserBtn');
  if (inviteBtn) {
    inviteBtn.addEventListener('mouseenter', () => {
      inviteBtn.style.background = 'rgb(22 163 74)';
      inviteBtn.style.color = 'rgb(255 255 255)';
    });
    inviteBtn.addEventListener('mouseleave', () => {
      inviteBtn.style.background = 'rgb(75 85 99)';
      inviteBtn.style.color = 'rgb(209 213 219)';
    });
    inviteBtn.addEventListener('click', () => {
      console.log('Invite player clicked');
    });
  }
  
  const aiBtn = document.getElementById('aiOpponentBtn');
  if (aiBtn) {
    aiBtn.addEventListener('mouseenter', () => {
      aiBtn.style.background = 'rgb(22 163 74)';
      aiBtn.style.color = 'rgb(255 255 255)';
    });
    aiBtn.addEventListener('mouseleave', () => {
      aiBtn.style.background = 'rgb(75 85 99)';
      aiBtn.style.color = 'rgb(209 213 219)';
    });
    aiBtn.addEventListener('click', () => {
      history.pushState({ page: 'game', opponent: 'ai' }, '', '#game');
      setCurrentPage('game');
      renderApp();
    });
  }
  
  const startBtn = document.getElementById('startGameBtn');
  if (startBtn) {
    if (maxPlayers === players.length) {
      startBtn.addEventListener('mouseenter', () => {
        startBtn.style.background = 'rgb(22 163 74)';
        startBtn.style.color = 'rgb(255 255 255)';
      });
      startBtn.addEventListener('mouseleave', () => {
        startBtn.style.background = 'rgb(75 85 99)';
        startBtn.style.color = 'rgb(209 213 219)';
      });
      startBtn.addEventListener('click', () => {
        console.log('Start game clicked');
      });
    } else {
      startBtn.addEventListener('click', () => {
        alert("Not all players are ready");
        console.log('Not all players are ready');
      });
    }
  }
  
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('mouseenter', () => {
      backBtn.style.background = 'rgb(55 65 81)';
    });
    backBtn.addEventListener('mouseleave', () => {
      backBtn.style.background = 'rgb(75 85 99)';
    });
    backBtn.addEventListener('click', () => {
      history.pushState({ page: 'landing' }, '', '#');
      setCurrentPage('landing');
      renderApp();
    });
  }
}