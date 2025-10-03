import { setCurrentPage, getCurrentGameMode } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { initRoomWebSocket, disconnectRoomWebSocket } from '../utils/roomWebSocket';

interface Player {
  id: string;
  username: string;
  isReady: boolean;
  avatar?: string;
  isAI?: boolean;
  socketId?: string;
}

interface GameRoom {
  roomId: string;
  hostId: string;
  players: Player[];
  maxPlayers: number;
  status: 'waiting' | 'playing' | 'finished';
  gameId?: number;
}

let currentRoom: GameRoom | null = null;
let currentUserId: string | null = null;
let pollInterval: number | null = null;
let lobbyWebSocket: any = null;

export async function renderLobbyPage(roomIdParam?: string): Promise<void> {
  const root = document.getElementById('app-root');
  if (!root) return;

  console.log('🎮 [LOBBY] Starting renderLobbyPage, roomIdParam:', roomIdParam);

  // Get user
  const currentUser = authService.getCurrentUser();
  console.log('👤 [DEBUG] getCurrentUser():', currentUser); // ADD THIS
  
  let user = currentUser;
  if (!user && authService.isAuthenticated()) {
    user = await authService.fetchUserProfile();
    console.log('👤 [DEBUG] fetchUserProfile():', user); // ADD THIS
  }

  currentUserId = user?.id?.toString() || `guest-${Date.now()}`;
  console.log('👤 [DEBUG] Final currentUserId:', currentUserId); // ADD THIS
  console.log('👤 [DEBUG] User object:', user); // ADD THIS

  // Create or join room
  try {
    if (roomIdParam) {
      console.log('🚪 [LOBBY] Joining room:', roomIdParam);
      await joinExistingRoom(roomIdParam, currentUserId, user?.username || 'Guest');
    } else if (!currentRoom) {
      console.log('🆕 [LOBBY] Creating new room');
      await createNewRoom(currentUserId, user?.username || 'Guest');
    }
  } catch (error) {
    console.error('❌ [LOBBY] Error setting up room:', error);
    return;
  }

  // Check if we have a room
  if (!currentRoom) {
    console.error('❌ [LOBBY] No room after setup!');
    root.innerHTML = `
      <div style="text-align: center; padding: 2em;">
        <h2 style="color: #f87171;">Failed to setup room</h2>
        <p>Please try again</p>
        <button onclick="window.location.href='/'" style="padding: 0.75em 2em; background: rgb(99 102 241); color: white; border: none; border-radius: 8px; cursor: pointer;">
          Back to Home
        </button>
      </div>
    `;
    return;
  }

  console.log('✅ [LOBBY] Room ready:', currentRoom.roomId);

  // Start updates
  startRoomPolling();
  
  if (currentRoom && currentUserId) {
    initLobbyWebSocket(currentRoom.roomId, currentUserId);
  }

  // Render
  renderLobby(root);
}

async function createNewRoom(userId: string, username: string): Promise<void> {
  console.log('🔨 [CREATE] Creating room for:', username);
  
  const gameMode = getCurrentGameMode();
  const maxPlayers = gameMode === '1v1' ? 2 : 4;

  const response = await fetch('/api/room/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hostId: userId,
      hostUsername: username,
      maxPlayers
    })
  });

  const data = await response.json();
  console.log('📦 [CREATE] Response:', data);
  
  if (data.success && data.data && data.data.room) {
    currentRoom = data.data.room;
    console.log('✅ [CREATE] Room created:', currentRoom.roomId);
  } else {
    throw new Error(data.message || 'Failed to create room');
  }
}

async function joinExistingRoom(roomId: string, userId: string, username: string): Promise<void> {
  console.log('🚪 [JOIN] Joining room:', roomId);
  
  const response = await fetch(`/api/room/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerId: userId,
      username
    })
  });

  const data = await response.json();
  console.log('📦 [JOIN] Response:', data);
  
  if (data.success && data.room) {
    currentRoom = data.room;
    console.log('✅ [JOIN] Joined room:', roomId);
  } else {
    console.log('⚠️ [JOIN] Failed, creating new room instead');
    await createNewRoom(userId, username);
  }
}

async function fetchRoomState(): Promise<void> {
  if (!currentRoom) return;

  try {
    const response = await fetch(`/api/room/${currentRoom.roomId}`);
    const data = await response.json();
    
    if (data.success && data.data) {
      currentRoom = data.data;
      const root = document.getElementById('app-root');
      if (root) {
        renderLobby(root);
      }
    }
  } catch (error) {
    console.error('❌ [FETCH] Error:', error);
  }
}

function startRoomPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
  pollInterval = window.setInterval(() => fetchRoomState(), 2000);
}

function stopRoomPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function initLobbyWebSocket(roomId: string, playerId: string): void {
  if (lobbyWebSocket) return;

  console.log('🔌 Initializing lobby WebSocket for player:', playerId, 'in room:', roomId);

  lobbyWebSocket = initRoomWebSocket({
    roomId,
    playerId,
    
    onConnect: () => {
      console.log('✅ Lobby WebSocket connected');
    },
    
    onGameStart: (gameId) => {
      console.log('🎮 Game started by host! GameID:', gameId);
      stopRoomPolling();
      
      if (lobbyWebSocket) {
        lobbyWebSocket.disconnect();
        lobbyWebSocket = null;
      }
      
      history.pushState({ page: 'game', roomId }, '', '#game');
      setCurrentPage('game');
      renderApp();
    },
    
    onRoomState: (room) => {
      console.log('📦 [WS] Room state update received:', room);
      
      if (room) {
        currentRoom = room;
        const root = document.getElementById('app-root');
        if (root) {
          console.log('🔄 [WS] Re-rendering lobby with updated players');
          renderLobby(root);
        }
      }
    },
    
    onPlayerReady: (playerId, isReady) => {
      console.log(`📦 [WS] Player ${playerId} ready:`, isReady);
      
      if (currentRoom) {
        const player = currentRoom.players.find(p => p.id === playerId);
        if (player) {
          player.isReady = isReady;
          const root = document.getElementById('app-root');
          if (root) {
            renderLobby(root);
          }
        }
      }
    },
    
    onPlayerDisconnected: (playerId) => {
      console.log(`📦 [WS] Player ${playerId} disconnected`);
      
      if (currentRoom) {
        currentRoom.players = currentRoom.players.filter(p => p.id !== playerId);
        const root = document.getElementById('app-root');
        if (root) {
          renderLobby(root);
        }
      }
    },
    
    onError: (error) => {
      console.error('❌ Lobby WebSocket error:', error);
    }
  });

  lobbyWebSocket.connect().catch((err: Error) => console.error('[WS] Connection failed:', err));
}

function renderLobby(root: HTMLElement): void {
  if (!currentRoom) {
    root.innerHTML = '<div style="color: white; padding: 2em;">Loading room...</div>';
    return;
  }

  const players = currentRoom.players;
  const maxPlayers = currentRoom.maxPlayers;
  const canAddMore = players.length < maxPlayers;
  const canStart = players.length >= 2 && players.every(p => p.isReady);
  const isHost = currentRoom.hostId === currentUserId;
  const currentPlayer = players.find(p => p.id === currentUserId);
  const inviteLink = `${window.location.origin}/join/${currentRoom.roomId}`;

  // Debug logging
  console.log('🎨 [RENDER] Lobby state:', {
    roomId: currentRoom.roomId,
    isHost,
    hostId: currentRoom.hostId,
    currentUserId: currentUserId,
    hostIdType: typeof currentRoom.hostId,
    currentUserIdType: typeof currentUserId,
    canStart,
    players: players.map(p => ({ username: p.username, isReady: p.isReady }))
  });

  root.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; padding: 2em;">
      <div style="background: rgb(55 65 81); border-radius: 12px; padding: 2em; min-width: 450px; max-width: 600px;">
        
        <h2 style="font-size: 2.5em; margin: 0 0 1em 0; color: rgb(209 213 219); text-align: center;">Game Lobby</h2>
        
        <div style="background: rgb(31 41 55); border-radius: 8px; padding: 1em; margin-bottom: 1.5em; text-align: center;">
          <div style="color: rgb(156 163 175); font-size: 0.85em; margin-bottom: 0.5em;">Room ID</div>
          <div style="color: rgb(229 231 235); font-size: 1.2em; font-weight: bold; font-family: monospace;">${currentRoom.roomId}</div>
        </div>

        <div style="background: rgb(31 41 55); border-radius: 8px; padding: 1em; margin-bottom: 1.5em;">
          <div style="color: rgb(156 163 175); font-size: 0.85em; margin-bottom: 0.5em;">Invite Link:</div>
          <div style="display: flex; gap: 0.5em;">
            <input id="inviteLinkInput" type="text" readonly value="${inviteLink}"
                   style="flex: 1; background: rgb(17 24 39); color: rgb(229 231 235); border: 1px solid rgb(75 85 99); border-radius: 4px; padding: 0.5em; font-family: monospace; font-size: 0.9em;">
            <button id="copyLinkBtn" style="background: rgb(99 102 241); color: white; border: none; border-radius: 4px; padding: 0.5em 1em; cursor: pointer; white-space: nowrap;">
              📋 Copy
            </button>
          </div>
        </div>

        <div style="margin-bottom: 1.5em;">
          <h3 style="color: rgb(209 213 219); margin: 0 0 1em 0;">Players (${players.length}/${maxPlayers})</h3>
          ${players.map(player => `
            <div style="background: rgb(31 41 55); border-radius: 6px; padding: 0.75em; margin-bottom: 0.5em; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="color: rgb(229 231 235);">${player.username}</span>
                ${player.id === currentRoom.hostId ? ' <span style="color: rgb(251 191 36);">👑</span>' : ''}
                ${player.id === currentUserId ? ' <span style="color: rgb(99 102 241); font-size: 0.85em;">(You)</span>' : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 0.5em;">
                <span style="color: ${player.isReady ? 'rgb(34 197 94)' : 'rgb(156 163 175)'}; font-size: 0.9em;">
                  ${player.isReady ? '✓ Ready' : 'Not Ready'}
                </span>
                ${player.isAI && isHost ? `
                  <button class="remove-player-btn" data-player-id="${player.id}"
                          style="background: rgb(220 38 38); color: white; border: none; border-radius: 4px; padding: 0.25em 0.5em; font-size: 0.8em; cursor: pointer;">
                    Remove
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>

        ${currentPlayer && !currentPlayer.isAI ? `
          <button id="toggleReadyBtn" 
                  style="width: 100%; padding: 0.75em; border: none; border-radius: 8px; font-size: 1.1em; font-weight: 500; cursor: pointer; margin-bottom: 0.75em;
                         background: ${currentPlayer.isReady ? 'rgb(107 114 128)' : 'rgb(34 197 94)'}; color: white;">
            ${currentPlayer.isReady ? '❌ Not Ready' : '✅ Ready Up'}
          </button>
        ` : ''}
        
        ${canAddMore && isHost ? `
          <button id="addAIBtn" 
                  style="width: 100%; padding: 0.75em; border: none; border-radius: 8px; font-size: 1.1em; font-weight: 500; cursor: pointer; margin-bottom: 0.75em;
                         background: rgb(99 102 241); color: white;">
            🤖 Add AI Opponent
          </button>
        ` : ''}
        
        ${isHost ? `
          <button id="startGameBtn"
                  style="width: 100%; padding: 0.75em; border: none; border-radius: 8px; font-size: 1.1em; font-weight: 500; margin-bottom: 0.75em;
                         background: ${canStart ? 'rgb(22 163 74)' : 'rgb(107 114 128)'}; color: white;
                         cursor: ${canStart ? 'pointer' : 'not-allowed'}; opacity: ${canStart ? '1' : '0.5'};">
            ${canStart ? '🎮 Start Game' : '⏳ Waiting for players...'}
          </button>
        ` : `
          <div style="background: rgb(31 41 55); border-radius: 8px; padding: 1em; margin-bottom: 0.75em; text-align: center; color: rgb(156 163 175);">
            ${canStart ? '⏳ Waiting for host...' : '⏳ Waiting for players...'}
          </div>
        `}
        
        <button id="leaveBtn" 
                style="width: 100%; padding: 0.75em; border: none; border-radius: 8px; font-size: 1.1em; font-weight: 500; cursor: pointer;
                       background: rgb(220 38 38); color: white;">
          Leave Lobby
        </button>
        
      </div>
    </div>
  `;

  attachEventListeners(canAddMore, canStart, isHost, currentPlayer);
}

function attachEventListeners(canAddMore: boolean, canStart: boolean, isHost: boolean, currentPlayer?: Player): void {
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', async () => {
      const input = document.getElementById('inviteLinkInput') as HTMLInputElement;
      if (input) {
        try {
          await navigator.clipboard.writeText(input.value);
          copyLinkBtn.textContent = '✅ Copied!';
          setTimeout(() => { copyLinkBtn.textContent = '📋 Copy'; }, 2000);
        } catch (err) {
          input.select();
          document.execCommand('copy');
        }
      }
    });
  }

  const toggleReadyBtn = document.getElementById('toggleReadyBtn');
  if (toggleReadyBtn && currentPlayer) {
    toggleReadyBtn.addEventListener('click', () => toggleReady());
  }

  const addAIBtn = document.getElementById('addAIBtn');
  if (addAIBtn && canAddMore && isHost) {
    addAIBtn.addEventListener('click', () => addAIOpponent());
  }

  const removeButtons = document.querySelectorAll('.remove-player-btn');
  removeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const playerId = (e.target as HTMLElement).dataset.playerId;
      if (playerId) removePlayer(playerId);
    });
  });

  // FIXED: Always add click listener to start button, but only allow if canStart
  const startBtn = document.getElementById('startGameBtn');
  if (startBtn && isHost) {
    startBtn.addEventListener('click', () => {
      if (canStart) {
        startGame();
      } else {
        console.log('⚠️ Cannot start - not all players ready');
      }
    });
  }

  const leaveBtn = document.getElementById('leaveBtn');
  if (leaveBtn) {
    leaveBtn.addEventListener('click', () => leaveRoom());
  }
}

async function toggleReady(): Promise<void> {
  if (!currentRoom || !currentUserId) return;

  try {
    const response = await fetch(`/api/room/${currentRoom.roomId}/ready`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: currentUserId })
    });

    const data = await response.json();
    if (data.success && data.data && data.data.room) {
      currentRoom = data.data.room;
      renderLobby(document.getElementById('app-root')!);
    }
  } catch (error) {
    console.error('Error toggling ready:', error);
  }
}

async function addAIOpponent(): Promise<void> {
  if (!currentRoom) return;

  const aiNumber = currentRoom.players.filter(p => p.isAI).length + 1;
  const aiId = `ai-${Date.now()}`;
  
  try {
    const response = await fetch(`/api/room/${currentRoom.roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: aiId,
        username: `AI Bot ${aiNumber}`,
        isAI: true
      })
    });

    const data = await response.json();
    if (data.success) {
      await fetchRoomState();
    } else {
      alert(`Failed to add AI: ${data.message}`);
    }
  } catch (error) {
    console.error('Error adding AI:', error);
    alert('Failed to add AI opponent');
  }
}

async function removePlayer(playerId: string): Promise<void> {
  if (!currentRoom) return;

  try {
    const response = await fetch(`/api/room/${currentRoom.roomId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId })
    });

    if (response.ok) {
      await fetchRoomState();
    }
  } catch (error) {
    console.error('Error removing player:', error);
  }
}

async function startGame(): Promise<void> {
  if (!currentRoom) return;

  console.log('🎮 Starting game for room:', currentRoom.roomId);

  try {
    const response = await fetch(`/api/room/${currentRoom.roomId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        hostId: currentUserId  // ADD THIS
      })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Game started, navigating...');
      stopRoomPolling();
      history.pushState({ page: 'game', roomId: currentRoom.roomId }, '', '#game');
      setCurrentPage('game');
      renderApp();
    } else {
      alert(data.message || 'Failed to start game');
    }
  } catch (error) {
    console.error('❌ Error starting game:', error);
    alert('Failed to start game');
  }
}

async function leaveRoom(): Promise<void> {
  if (!currentRoom || !currentUserId) return;

  try {
    await fetch(`/api/room/${currentRoom.roomId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: currentUserId })
    });

    stopRoomPolling();
    currentRoom = null;
    
    history.pushState({ page: 'landing' }, '', '#');
    setCurrentPage('landing');
    renderApp();
  } catch (error) {
    console.error('Error leaving room:', error);
  }
}

export function cleanupLobby(): void {
  stopRoomPolling();
  if (lobbyWebSocket) {
    lobbyWebSocket.disconnect();
    lobbyWebSocket = null;
  }
}

export function getCurrentRoom(): GameRoom | null {
  return currentRoom;
}

export function getLobbyPlayers(): Player[] {
  return currentRoom ? currentRoom.players : [];
}

export type { Player, GameRoom };