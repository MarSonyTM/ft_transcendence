import { setCurrentPage, getCurrentGameMode } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { initRoomWebSocket, disconnectRoomWebSocket } from '../utils/roomWebSocket';
import { 
  Player, 
  GameRoom, 
  getCurrentRoom,
  setCurrentRoom,
  getLobbyPlayers,
  clearRoomState
} from '../utils/roomState';

let currentUserId: string | null = null;
let pollInterval: number | null = null;
let lobbyWebSocket: any = null;

export async function renderLobbyPage(roomIdParam?: string): Promise<void> {
  const root = document.getElementById('app-root');
  if (!root) return;

  console.log('🎮 [LOBBY] Starting renderLobbyPage, roomIdParam:', roomIdParam);

  const currentUser = authService.getCurrentUser();
  console.log('👤 [DEBUG] getCurrentUser():', currentUser);
  
  let user = currentUser;
  if (!user && authService.isAuthenticated()) {
    user = await authService.fetchUserProfile();
    console.log('👤 [DEBUG] fetchUserProfile():', user);
  }

  currentUserId = user?.id?.toString() || `guest-${Date.now()}`;
  console.log('👤 [DEBUG] Final currentUserId:', currentUserId);
  console.log('👤 [DEBUG] User object:', user);

  try {
    if (roomIdParam) {
      console.log('🚪 [LOBBY] Joining room:', roomIdParam);
      await joinExistingRoom(roomIdParam, currentUserId, user?.username || 'Guest');
    } else if (!getCurrentRoom()) {
      console.log('🆕 [LOBBY] Creating new room');
      await createNewRoom(currentUserId, user?.username || 'Guest');
    }
  } catch (error) {
    console.error('❌ [LOBBY] Error setting up room:', error);
    return;
  }

  const currentRoom = getCurrentRoom();  // FIXED: Get current room
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

  startRoomPolling();
  
  if (currentRoom && currentUserId) {
    initLobbyWebSocket(currentRoom.roomId, currentUserId);
  }

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
    setCurrentRoom(data.data.room);
    console.log('✅ [CREATE] Room created:', data.data.room.roomId);
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
    setCurrentRoom(data.room);
    console.log('✅ [JOIN] Joined room:', roomId);
  } else {
    console.log('⚠️ [JOIN] Failed, creating new room instead');
    await createNewRoom(userId, username);
  }
}

async function fetchRoomState(): Promise<void> {
  const currentRoom = getCurrentRoom();
  if (!currentRoom) return;

  try {
    const response = await fetch(`/api/room/${currentRoom.roomId}`);
    const data = await response.json();
    
    if (data.success && data.room) {
      setCurrentRoom(data.room);
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

async function startGame(): Promise<void> {
  const currentRoom = getCurrentRoom();
  if (!currentRoom) return;

  console.log('🎮 Starting game for room:', currentRoom.roomId);

  try {
    const response = await fetch(`/api/room/${currentRoom.roomId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        hostId: currentUserId
      })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Game started successfully!');
      console.log('📦 Response data:', data);
      
      if (data.room && data.room.gameId) {
        setCurrentRoom(data.room);
        console.log('✅ Updated room with gameId:', data.room.gameId);
      } else if (data.gameId) {
        // Fallback if gameId is in data but not in room object
        const updatedRoom = { ...currentRoom, gameId: data.gameId };
        setCurrentRoom(updatedRoom);
        console.log('✅ Updated room with gameId (fallback):', data.gameId);
      }
      
      const finalRoom = getCurrentRoom();
      console.log('🎮 Navigating to game page with room:', finalRoom);
      
      stopRoomPolling();
      
      // Navigate to game
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

function initLobbyWebSocket(roomId: string, playerId: string): void {
  if (lobbyWebSocket) return;

  console.log('🔌 Initializing lobby WebSocket for player:', playerId, 'in room:', roomId);

  lobbyWebSocket = initRoomWebSocket({
    roomId,
    playerId,
    
    onConnect: () => {
      console.log('✅ Lobby WebSocket connected');
    },
    
    onGameStart: async (gameId) => {
      console.log('🎮 Game started by host! GameID:', gameId);
      
      let currentRoom = getCurrentRoom();
      
      // CRITICAL FIX: Update the current room with the gameId
      if (currentRoom) {
        currentRoom = { ...currentRoom, gameId, status: 'playing' as const };
        setCurrentRoom(currentRoom);
        console.log('✅ Updated room with gameId from WebSocket:', gameId);
      } else {
        // If we don't have the room, fetch it
        console.log('⚠️ No currentRoom, fetching from server...');
        try {
          const response = await fetch(`/api/room/${roomId}`);
          const data = await response.json();
          if (data.success && data.room) {
            setCurrentRoom(data.room);
            console.log('✅ Fetched room with gameId:', data.room.gameId);
          }
        } catch (error) {
          console.error('❌ Failed to fetch room:', error);
        }
      }
      
      stopRoomPolling();
      
      if (lobbyWebSocket) {
        lobbyWebSocket.disconnect();
        lobbyWebSocket = null;
      }
      
      console.log('🎮 Navigating to game page...');
      history.pushState({ page: 'game', roomId }, '', '#game');
      setCurrentPage('game');
      renderApp();
    },
    
    onRoomState: (room) => {
      console.log('📦 [WS] Room state update received:', room);
      
      if (room) {
        setCurrentRoom(room);
        const root = document.getElementById('app-root');
        if (root) {
          console.log('🔄 [WS] Re-rendering lobby with updated players');
          renderLobby(root);
        }
      }
    },
    
    onPlayerReady: (playerId, isReady) => {
      console.log(`📦 [WS] Player ${playerId} ready:`, isReady);
      
      const currentRoom = getCurrentRoom();
      if (currentRoom) {
        const player = currentRoom.players.find(p => p.id === playerId);
        if (player) {
          player.isReady = isReady;
          setCurrentRoom({ ...currentRoom });
          const root = document.getElementById('app-root');
          if (root) {
            renderLobby(root);
          }
        }
      }
    },
    
    onPlayerDisconnected: (playerId) => {
      console.log(`📦 [WS] Player ${playerId} disconnected`);
      
      const currentRoom = getCurrentRoom();
      if (currentRoom) {
        const updatedRoom = {
          ...currentRoom,
          players: currentRoom.players.filter(p => p.id !== playerId)
        };
        setCurrentRoom(updatedRoom);
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
  const currentRoom = getCurrentRoom();
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
  const currentRoom = getCurrentRoom();
  if (!currentRoom || !currentUserId) return;

  try {
    const response = await fetch(`/api/room/${currentRoom.roomId}/ready`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: currentUserId })
    });

    const data = await response.json();
    if (data.success && data.data && data.data.room) {
      setCurrentRoom(data.data.room);
      renderLobby(document.getElementById('app-root')!);
    }
  } catch (error) {
    console.error('Error toggling ready:', error);
  }
}

async function addAIOpponent(): Promise<void> {
  const currentRoom = getCurrentRoom();
  console.log('🤖 [AI] addAIOpponent called, currentRoom:', currentRoom);
  
  if (!currentRoom) {
    console.error('❌ [AI] currentRoom is null!');
    alert('Error: Room not initialized');
    return;
  }

  const aiNumber = currentRoom.players.filter(p => p.isAI).length + 1;
  const aiId = `ai-${Date.now()}`;
  const roomId = currentRoom.roomId;
  
  console.log(`🤖 [AI] Adding AI Bot ${aiNumber} to room ${roomId}`);
  
  try {
    // First, add the AI player to the room
    const joinResponse = await fetch(`/api/room/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: aiId,
        username: `AI Bot ${aiNumber}`,
        isAI: true
      })
    });

    const joinData = await joinResponse.json();
    console.log('📦 [AI] Join response:', joinData);
    
    if (joinData.success) {
      // Automatically set AI to ready
      console.log(`✅ [AI] AI joined, setting ready status...`);
      const readyResponse = await fetch(`/api/room/${roomId}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: aiId })
      });

      const readyData = await readyResponse.json();
      console.log('📦 [AI] Ready response:', readyData);
      
      if (readyData.success) {
        console.log('✅ [AI] AI is now ready');
        await fetchRoomState();
      } else {
        console.error('❌ [AI] Failed to set AI ready:', readyData.message);
        alert(`AI added but failed to set ready: ${readyData.message}`);
      }
    } else {
      console.error('❌ [AI] Failed to add AI:', joinData.message);
      alert(`Failed to add AI: ${joinData.message}`);
    }
  } catch (error) {
    console.error('❌ [AI] Error adding AI:', error);
    alert('Failed to add AI opponent');
  }
}

async function removePlayer(playerId: string): Promise<void> {
  const currentRoom = getCurrentRoom();
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

async function leaveRoom(): Promise<void> {
  const currentRoom = getCurrentRoom();
  if (!currentRoom || !currentUserId) return;

  try {
    await fetch(`/api/room/${currentRoom.roomId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: currentUserId })
    });

    stopRoomPolling();
    clearRoomState();
    
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
  clearRoomState();
}

export type { Player, GameRoom };