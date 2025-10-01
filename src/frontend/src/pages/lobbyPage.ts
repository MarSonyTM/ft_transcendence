import { setCurrentPage, getCurrentGameMode } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';

// Define player interface
interface Player {
  username: string;
  isReady: boolean;
  avatar?: string;
  isAI?: boolean;
}

let lobbyPlayers: Player[] = [];

export async function renderLobbyPage(): Promise<void> {
  const root = document.getElementById('app-root');
  if (!root) return;

  // Get authenticated user
  const currentUser = authService.getCurrentUser();
  
  // If no user is authenticated, try to fetch from backend
  let user = currentUser;
  if (!user && authService.isAuthenticated()) {
    user = await authService.fetchUserProfile();
  }

  // Initialize players list with the authenticated user if empty
  if (lobbyPlayers.length === 0) {
    lobbyPlayers = [
      { 
        username: user?.username || 'Guest Player', 
        isReady: true,
        avatar: user?.avatar,
        isAI: false
      }
    ];
  }

  const gameMode = getCurrentGameMode();
  const maxPlayers = gameMode === '1v1' ? 2 : 4;
  const canAddMore = lobbyPlayers.length < maxPlayers;
  const canStart = lobbyPlayers.length >= 2 && lobbyPlayers.every(p => p.isReady);

  renderLobby(root, lobbyPlayers, maxPlayers, canAddMore, canStart);
}

function renderLobby(
  root: HTMLElement, 
  players: Player[], 
  maxPlayers: number, 
  canAddMore: boolean,
  canStart: boolean
): void {
  root.innerHTML = `
    <div class="lobby-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; padding: 2em;">
      
      <div class="lobby-card" style="background: rgb(55 65 81); border-radius: 12px; padding: 2em; box-shadow: 0 4px 6px rgba(0,0,0,0.3); min-width: 450px; max-width: 600px;">
        
        <h2 style="font-size: 2.5em; margin-bottom: 1em; margin-top: 0; color: rgb(209 213 219); text-align: center;">Lobby</h2>
        
        <div style="background: rgb(75 85 99); border-radius: 8px; padding: 1.5em; margin-bottom: 1.5em; min-height: 200px;">
          <h3 style="color: rgb(156 163 175); font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px; margin-top: 0; margin-bottom: 1em;">Players (${players.length}/${maxPlayers})</h3>
          
          <div class="players-list" style="display: flex; flex-direction: column; gap: 0.75em;">
            ${players.map((player, index) => `
              <div style="background: rgb(55 65 81); padding: 1em; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 0.75em;">
                  ${player.avatar ? `
                    <img src="${player.avatar}" alt="${player.username}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                  ` : `
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: ${player.isAI ? 'rgb(99 102 241)' : 'rgb(75 85 99)'}; display: flex; align-items: center; justify-content: center; color: rgb(209 213 219); font-weight: bold; font-size: 0.9em;">
                      ${player.isAI ? '🤖' : player.username.charAt(0).toUpperCase()}
                    </div>
                  `}
                  <span style="color: rgb(229 231 235); font-weight: 500;">
                    ${player.username}
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5em;">
                  <span style="color: ${player.isReady ? 'rgb(34 197 94)' : 'rgb(156 163 175)'}; font-size: 0.9em; font-weight: 500;">
                    ${!player.isAI ? (player.isReady ? '✓ Ready' : 'Not Ready') : ''}
                  </span>
                  ${player.isAI ? `
                    <button class="remove-player-btn" data-index="${index}" style="background: rgb(220 38 38); color: white; border: none; border-radius: 4px; padding: 0.25em 0.5em; font-size: 0.8em; cursor: pointer; transition: background 0.2s;">
                      Remove
                    </button>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        ${canAddMore ? `
          <button id="addAIBtn" class="btn" style="width: 100%; padding: 0.75em 1.5em; border-radius: 0.5rem; font-weight: 500; transition: background-color 150ms; border: none; cursor: pointer; background: rgb(99 102 241); color: rgb(255 255 255); font-size: 1.1em; margin-bottom: 1em;">
            + Add AI Opponent
          </button>
        ` : ''}
        
        <button id="inviteUserBtn" class="btn" style="width: 100%; padding: 0.75em 1.5em; border-radius: 0.5rem; font-weight: 500; transition: background-color 150ms; border: none; cursor: pointer; background: rgb(75 85 99); color: rgb(209 213 219); font-size: 1.1em; margin-bottom: 1em; ${!canAddMore ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
          + Invite Player
        </button>
        
        <button id="startGameBtn" class="btn" style="width: 100%; padding: 0.75em 1.5em; border-radius: 0.5rem; font-weight: 500; transition: background-color 150ms; border: none; cursor: pointer; background: ${canStart ? 'rgb(22 163 74)' : 'rgb(107 114 128)'}; color: rgb(255 255 255); font-size: 1.1em; margin-bottom: 1em; ${!canStart ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
          ${canStart ? 'Start Game' : `Need at least 2 players to start`}
        </button>
        
      </div>
      
      <button id="backBtn" class="btn btn-back" style="font-size: 1.1em; background: rgb(75 85 99); color: rgb(209 213 219); border: none; border-radius: 8px; padding: 0.75em 2em; cursor: pointer; transition: background 0.2s; font-weight: 500; margin-top: 1em;">
        Back to Home
      </button>
      
    </div>
  `;

  attachEventListeners(canAddMore, canStart, maxPlayers);
}

function attachEventListeners(canAddMore: boolean, canStart: boolean, maxPlayers: number): void {
  // Add AI button
  const addAIBtn = document.getElementById('addAIBtn');
  if (addAIBtn && canAddMore) {
    addAIBtn.addEventListener('mouseenter', () => {
      addAIBtn.style.background = 'rgb(79 70 229)';
    });
    addAIBtn.addEventListener('mouseleave', () => {
      addAIBtn.style.background = 'rgb(99 102 241)';
    });
    addAIBtn.addEventListener('click', () => {
      addAIOpponent();
    });
  }
  
  // Invite button
  const inviteBtn = document.getElementById('inviteUserBtn');
  if (inviteBtn) {
    if (canAddMore) {
      inviteBtn.addEventListener('mouseenter', () => {
        inviteBtn.style.background = 'rgb(22 163 74)';
        inviteBtn.style.color = 'rgb(255 255 255)';
      });
      inviteBtn.addEventListener('mouseleave', () => {
        inviteBtn.style.background = 'rgb(75 85 99)';
        inviteBtn.style.color = 'rgb(209 213 219)';
      });
      inviteBtn.addEventListener('click', () => {
        // TODO: Implement invite player functionality
        alert('Invite player feature coming soon!');
        console.log('Invite player clicked');
      });
    }
  }
  
  // Remove player buttons
  const removeButtons = document.querySelectorAll('.remove-player-btn');
  removeButtons.forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      (btn as HTMLElement).style.background = 'rgb(185 28 28)';
    });
    btn.addEventListener('mouseleave', () => {
      (btn as HTMLElement).style.background = 'rgb(220 38 38)';
    });
    btn.addEventListener('click', (e) => {
      const index = parseInt((e.target as HTMLElement).dataset.index || '0');
      removePlayer(index);
    });
  });
  
  // Start game button
  const startBtn = document.getElementById('startGameBtn');
  if (startBtn) {
    if (canStart) {
      startBtn.addEventListener('mouseenter', () => {
        startBtn.style.background = 'rgb(21 128 61)';
      });
      startBtn.addEventListener('mouseleave', () => {
        startBtn.style.background = 'rgb(22 163 74)';
      });
      startBtn.addEventListener('click', () => {
        startGame();
      });
    } else {
      startBtn.addEventListener('click', () => {
        if (lobbyPlayers.length < 2) {
          alert('You need at least 2 players to start the game. Add an AI opponent or invite a player!');
        } else {
          alert('All players must be ready to start the game.');
        }
      });
    }
  }
  
  // Back button
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('mouseenter', () => {
      backBtn.style.background = 'rgb(55 65 81)';
    });
    backBtn.addEventListener('mouseleave', () => {
      backBtn.style.background = 'rgb(75 85 99)';
    });
    backBtn.addEventListener('click', () => {
      resetLobby();
      history.pushState({ page: 'landing' }, '', '#');
      setCurrentPage('landing');
      renderApp();
    });
  }
}

function addAIOpponent(): void {
  const aiNumber = lobbyPlayers.filter(p => p.isAI).length + 1;
  const aiPlayer: Player = {
    username: `AI ${aiNumber}`,
    isReady: true,
    isAI: true
  };
  
  lobbyPlayers.push(aiPlayer);
  renderLobbyPage();
}

function removePlayer(index: number): void {
  if (lobbyPlayers[index]?.isAI) {
    lobbyPlayers.splice(index, 1);
    renderLobbyPage();
  }
}

function startGame(): void {
  history.pushState({ page: 'game', players: lobbyPlayers }, '', '#game');
  setCurrentPage('game');
  renderApp();
  // Clear lobby after starting game so it's fresh next time
  resetLobby();
}

function resetLobby(): void {
  lobbyPlayers = [];
}

// Export function to get current lobby players for game initialization
export function getLobbyPlayers(): Player[] {
  return lobbyPlayers;
}

// Export player interface for use in other modules
export type { Player };