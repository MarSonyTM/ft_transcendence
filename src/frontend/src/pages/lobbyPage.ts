import { setCurrentGameMode, setCurrentPage, getCurrentGameMode } from '../utils/globalState';
import { renderApp } from '../main';
import { initRoomWebSocket } from '../utils/roomWebSocket';
import { authService } from '../utils/auth';
import { 
  getCurrentRoom,
  setCurrentRoom,
  clearRoomState,
  GameRoom,
  Player
} from '../utils/roomState';

let currentUserId: string | null = null;
let pollInterval: number | null = null;
let lobbyWebSocket: any = null;
let chatMessages: Array<{ playerId: string; username: string; message: string; timestamp?: number }> = [];

export async function renderLobbyPage(roomIdParam?: string): Promise<void> {
	const root = document.getElementById('app-root');
	if (!root) return;

	let user = await authService.getCurrentUser();
	if (!user && authService.isAuthenticated()) {
    	user = await authService.fetchUserProfile();
 	}

  	currentUserId = user?.id?.toString() || `guest-${Date.now()}`;

  	try {
    	if (roomIdParam) {
      		await joinExistingRoom(roomIdParam, currentUserId, user?.username || 'Guest');
    	} else if (!getCurrentRoom()) {
      		await createNewRoom(currentUserId, user?.username || 'Guest');
    	} else {
      		const currentRoom = getCurrentRoom();
      		if (currentRoom) {
        		const gameMode = currentRoom.maxPlayers === 4 ? '4P' : '2P';
        		setCurrentGameMode(gameMode);
      		}
    	}
  	} catch (error) {
    	console.error('[LOBBY] Error setting up room:', error);
    	return;
  	}

  
	const currentRoom = getCurrentRoom();
  	if (!currentRoom) {
    	console.error('❌ [LOBBY] No room after setup!');
    	root.innerHTML = `
			<div class="neon-grid profile-container" style="width:100%; max-width:1200px; margin: 0 auto;">
				<div class="grid-anim"></div>
				<div class="glass-card" style="max-width: 600px;">
					<h2 class="title-neon" style="text-align: center; color: #f87171;">Failed to setup room</h2>
					<p style="text-align: center; color: rgb(156 163 175);">Please try again</p>
					<button onclick="window.location.href='/'" class="btn btn-neon primary">
						Back to Home
					</button>
				</div>
			</div>
    	`;
    return;
	}

  	startRoomPolling();
  
  	if (currentRoom && currentUserId) {
    	initLobbyWebSocket(currentRoom.roomId, currentUserId);
  	}

  	renderLobby(root);
}

async function createNewRoom(userId: string, username: string): Promise<void> {
  
  	const gameMode = getCurrentGameMode();
  	const maxPlayers = gameMode === '2P' ? 2 : 4;

  	const response = await fetch('/api/room/create', {
    	method: 'POST',
    	credentials: 'include',
    	headers: { 
      		'Content-Type': 'application/json',
    	},
    	body: JSON.stringify({
      		hostId: userId,
      		hostUsername: username,
      		maxPlayers: maxPlayers
    	})
  	});

  	if (!response.ok) {
    	console.error('[CREATE] HTTP Error:', response.status, response.statusText);
    	const text = await response.text();
    	console.error('[CREATE] Response body:', text);
    	throw new Error(`Failed to create room: ${response.status} ${response.statusText}`);
  	}
  
  	const contentType = response.headers.get('content-type');
	if (!contentType || !contentType.includes('application/json')) {
		const text = await response.text();
		console.error('[CREATE] Non-JSON response:', text);
		throw new Error('Server returned non-JSON response');
	}

    const data = await response.json();
    
    if (data.success && data.data && data.data.room) {
      	setCurrentRoom(data.data.room);
    } else {
      	throw new Error(data.message || 'Failed to create room');
    }
}

async function joinExistingRoom(roomId: string, userId: string, username: string): Promise<void> {
  
  	const response = await fetch(`/api/room/${roomId}/join`, {
    	method: 'POST',
    	credentials: 'include',
    	headers: { 
      		'Content-Type': 'application/json',
    	},
    	body: JSON.stringify({
      		playerId: userId,
      		username
    	})
  	});

  	const data = await response.json();
  
  	if (data.success && data.room) {
    	setCurrentRoom(data.room);
    
	const gameMode = data.room.maxPlayers === 4 ? '4P' : '2P';
    setCurrentGameMode(gameMode);
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


  	try {
    	const response = await fetch(`/api/room/${currentRoom.roomId}/start`, {
      		method: 'POST',
      		credentials: 'include',
      		headers: { 
        		'Content-Type': 'application/json',
      		},
      		body: JSON.stringify({ 
        		hostId: currentUserId
      		})
    	});

    	const data = await response.json();
    
    	if (!data.success) {
      		alert(data.message || 'Failed to start game');
    	}
  	} catch (error) {
    	console.error('❌ Error starting game:', error);
    	alert('Failed to start game');
  	}
}

async function showGameStartCountdown(): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'countdown-overlay';
    overlay.className = 'countdown-overlay animate-fade-in';

    const countdownText = document.createElement('div');
    countdownText.className = 'countdown-text animate-pulse';

    const messageText = document.createElement('div');
    messageText.className = 'countdown-message';
    messageText.textContent = 'Get Ready!';

    	overlay.appendChild(countdownText);
    	overlay.appendChild(messageText);
    	document.body.appendChild(overlay);

    	let count = 3;
    	countdownText.textContent = count.toString();

    	const countdownInterval = setInterval(() => {
      		count--;
      
      if (count > 0) {
        countdownText.textContent = count.toString();
        // Retrigger pulse animation by toggling the class
        countdownText.classList.remove('animate-pulse');
        void (countdownText as HTMLElement).offsetWidth; // force reflow
        countdownText.classList.add('animate-pulse');
      } else {
        countdownText.textContent = 'GO!';
        countdownText.style.color = 'rgb(251 191 36)';
        messageText.textContent = 'Game Starting...';
        
        		clearInterval(countdownInterval);
        
        setTimeout(() => {
          overlay.classList.remove('animate-fade-in');
          overlay.classList.add('animate-fade-out');
          setTimeout(() => {
            overlay.remove();
            resolve();
          }, 300);
        }, 800);
      }
    }, 1000);
  });
}

function initLobbyWebSocket(roomId: string, playerId: string): void {
	if (lobbyWebSocket) return;

  	lobbyWebSocket = initRoomWebSocket({
    	roomId,
    	playerId,
    
    	onConnect: () => {

      		if (lobbyWebSocket) {
        		lobbyWebSocket.requestState();
        
        		// Also poll once more to ensure sync
        		setTimeout(() => {
          			fetchRoomState();
        		}, 500);
      		}
    	},

    	onCountdown: async () => {
      		await showGameStartCountdown();
    	},
    
    	onGameStart: async (gameId) => {
      
			let currentRoom = getCurrentRoom();
		
			if (currentRoom) {
				currentRoom = { ...currentRoom, gameId, status: 'playing' as const };
				setCurrentRoom(currentRoom);
			} else {
				console.log('⚠️ No currentRoom, fetching from server...');
				try {
					const response = await fetch(`/api/room/${roomId}`);
					const data = await response.json();
					if (data.success && data.room) {
						setCurrentRoom(data.room);
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
		
			const gameMode = getCurrentGameMode();
			const gamePage = gameMode === '4P' ? '4PGame' : '2PGame';
			history.pushState({ page: gamePage, roomId: currentRoom?.roomId }, '', `${gamePage}`);
			setCurrentPage(gamePage);
			renderApp();
		},
    
    	onRoomState: (room) => {
      
      		if (room) {
        		setCurrentRoom(room);
        
        		const gameMode = room.maxPlayers === 4 ? '4P' : '2P';
        		setCurrentGameMode(gameMode);
        
        		const root = document.getElementById('app-root');
        		if (root) {
          			renderLobby(root);
        		}
      		}
    	},
    
    	onPlayerReady: (playerId, isReady) => {
      
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
    
    	onChat: (chatData) => {
      		// Add new chat message to the array
      		chatMessages.push({
        		playerId: chatData.playerId,
        		username: chatData.username,
        		message: chatData.message,
        		timestamp: chatData.timestamp || Date.now()
      		});
      		// Keep only last 50 messages
      		if (chatMessages.length > 50) {
        		chatMessages = chatMessages.slice(-50);
      		}
      		// Update chat display
      		updateChatDisplay();
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
		root.innerHTML = `
	    	<div class="neon-grid">
	    		<div class="grid-anim"></div>
	      		<div class="glass-card">
	        		<p style="text-align: center; color: rgb(156 163 175);">Loading room...</p>
	      		</div>
	    	</div>
	  	`;
	  	return;
	}

  	const difficultySelect = document.getElementById('aiDifficulty') as HTMLSelectElement;
  	let selectedDifficulty = difficultySelect?.value;

  	// If no selection exists, try to get difficulty from the last AI player
  	if (!selectedDifficulty) {
      	const aiPlayers = currentRoom.players.filter(p => p.isAI);
      	if (aiPlayers.length > 0) {
          	selectedDifficulty = aiPlayers[aiPlayers.length - 1].difficulty || 'normal';
      	}
  	}

  	// Default to normal if no difficulty is found
  	selectedDifficulty = selectedDifficulty || 'normal';
  
	const existingInput = document.getElementById('joinRoomInput') as HTMLInputElement;
	const preservedValue = existingInput ? existingInput.value : '';
	const wasFocused = existingInput && document.activeElement === existingInput;
	const cursorPosition = existingInput ? existingInput.selectionStart : 0;
  
	// Preserve chat input state
	const existingChatInput = document.getElementById('chatInput') as HTMLInputElement;
	const preservedChatValue = existingChatInput ? existingChatInput.value : '';
	const wasChatFocused = existingChatInput && document.activeElement === existingChatInput;
	const chatCursorPosition = existingChatInput ? existingChatInput.selectionStart : 0;
  
	const players = currentRoom.players;
	const maxPlayers = currentRoom.maxPlayers;
	const canAddMore = players.length < maxPlayers;
  	const minPlayersRequired = maxPlayers === 4 ? 4 : 2;
  	const canStart = players.length >= minPlayersRequired && players.every(p => p.isReady);
	const isHost = currentRoom.hostId === currentUserId;
	const currentPlayer = players.find(p => p.id === currentUserId);
  	let hasLocal = players.some(p => p.id === 'local');
  
  
	root.innerHTML = `
	  	<div class="neon-grid profile-container" style="width:100%; max-width:1200px; margin: 0 auto;">
			<div class="grid-anim"></div>
			<div class="glass-card" style="padding: 2em; width: 100%;">
		  
		  		<h2 class="title-neon" style="text-align: center; margin-bottom: 1.2em;">Game Lobby</h2>
		  
		  		<!-- Desktop Layout: Two Columns -->
		  		<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2em; align-items: start;">
		    
		    		<!-- Left Column: Room Info & Players -->
		    		<div>
		      			<h3 style="color: rgb(156 163 175); font-size: 0.9em; margin: 0 0 0.8em 0; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5em;">Room Information</h3>
		      
		      			<div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1em; margin-bottom: 1.2em; text-align: center;">
		        			<div style="color: rgb(156 163 175); font-size: 0.85em; margin-bottom: 0.5em;">Room ID</div>
		        			<div style="color: rgb(229 231 235); font-size: 1.1em; font-weight: bold; font-family: monospace;">${currentRoom.roomId}</div>
		      			</div>
		      
		      			<div style="margin-bottom: 1.2em;">
		        			<label style="display: block; margin-bottom: 0.5em; font-weight: 500; color: #9ca3af; font-size: 0.85em;">Join Another Room</label>
		        			<div style="display: flex; gap: 0.5em;">
		          				<input 
		            				id="joinRoomInput" 
									type="text"
									placeholder="Enter Room ID"
									autocomplete="off"
									value="${preservedValue}"
									style="flex: 1; padding: 0.65em; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; background: rgba(255, 255, 255, 0.05); color: rgb(229 231 235); font-family: monospace; font-size: 0.9em; transition: border-color 0.2s;"
									onfocus="this.style.borderColor='rgba(59, 130, 246, 0.5)'; this.style.boxShadow='0 0 10px rgba(59, 130, 246, 0.1)';"
									onblur="this.style.borderColor='rgba(255, 255, 255, 0.15)'; this.style.boxShadow='none';">
		          				<button id="joinRoomBtn" style="flex: 0 0 auto; font-size: 0.85em; padding: 0.55em 1.2em; border-radius: 8px; font-weight: 500; background: rgba(59, 130, 246, 0.2); color: rgb(229 231 235); border: 1px solid rgba(59, 130, 246, 0.5); cursor: pointer;">
		            				Join
		          				</button>
		       				 </div>
		      			</div>
		      
		      			<h3 style="color: rgb(156 163 175); font-size: 0.9em; margin: 1.2em 0 0.8em 0; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5em;">
		        			Players (${players.length}/${maxPlayers}) - ${maxPlayers === 4 ? '4-Player Mode' : '1v1 Mode'}
		      			</h3>
		      
		      			<div style="display: flex; flex-direction: column; gap: 0.5em;">
		        			${players.map(player => `
		          			<div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 0.75em; display: flex; justify-content: space-between; align-items: center;">
		            			<div>
		             				 <span style="color: rgb(229 231 235); font-weight: 500;">${player.username}</span>
		              				${player.id === currentRoom.hostId ? ' <span style="color: rgb(251 191 36);">👑</span>' : ''}
		             				${player.id === currentUserId ? ' <span style="color: rgba(59, 130, 246, 0.8); font-size: 0.85em;">(You)</span>' : ''}
		            			</div>
		            			<div style="display: flex; align-items: center; gap: 0.75em;">
		              				<span style="color: ${player.isReady ? 'rgb(34 197 94)' : 'rgb(156 163 175)'}; font-size: 0.85em; font-weight: 500;">
		                				${player.isReady ? '✓ Ready' : 'Not Ready'}
		              				</span>
		              				${player.isAI && isHost ? `
		               				 <button class="remove-player-btn" data-player-id="${player.id}"
		                  				style="background: rgba(220, 38, 38, 0.2); color: rgb(248, 113, 113); border: 1px solid rgba(220, 38, 38, 0.5); border-radius: 6px; padding: 0.3em 0.6em; font-size: 0.75em; cursor: pointer; font-weight: 500;">
		                  				Remove
		                				</button>
		              				` : ''}
		            			</div>
		          			</div>
		        		`).join('')}
		      			</div>
		    </div>
		    
		    <!-- Right Column: Controls & Settings -->
		    <div>
		      <h3 style="color: rgb(156 163 175); font-size: 0.9em; margin: 0 0 0.8em 0; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5em;">Game Controls</h3>
		      
		      ${currentPlayer && !currentPlayer.isAI ? `
		        <button id="toggleReadyBtn" style="width: 100%; margin-bottom: 1em; font-size: 0.85em; padding: 0.65em 1.2em; border-radius: 8px; font-weight: 500; ${currentPlayer.isReady ? 'background: rgba(156, 163, 175, 0.2); color: rgb(156 163 175); border: 1px solid rgba(156, 163, 175, 0.3);' : 'background: rgba(59, 130, 246, 0.2); color: rgb(229 231 235); border: 1px solid rgba(59, 130, 246, 0.5);'} cursor: pointer;">
		          ${currentPlayer.isReady ? '❌ Not Ready' : '✅ Ready Up'}
		        </button>
		      ` : ''}
		      
		      ${canAddMore && isHost ? `
		        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 1.2em; margin-bottom: 1em;">
		          <h4 style="color: rgb(156 163 175); font-size: 0.85em; margin: 0 0 0.8em 0; text-transform: uppercase; letter-spacing: 0.05em;">Add Players</h4>
		          
		          ${!hasLocal ? `
		            <button id="addLocalBtn" style="width: 100%; margin-bottom: 0.8em; font-size: 0.85em; padding: 0.55em 1.2em; border-radius: 8px; font-weight: 500; background: rgba(59, 130, 246, 0.2); color: rgb(229 231 235); border: 1px solid rgba(59, 130, 246, 0.5); cursor: pointer;">
		              🎮 Add Local Player (O/L keys)
		            </button>
		          ` : ''}
		          
		          <div style="margin-top: ${!hasLocal ? '0' : '0.8em'};">
		            <label style="display: block; margin-bottom: 0.5em; font-weight: 500; color: #9ca3af; font-size: 0.85em;">AI Difficulty</label>
		            <select id="aiDifficulty" 
		              style="width: 100%; padding: 0.65em; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; background: rgba(255, 255, 255, 0.05); color: rgb(229 231 235); font-size: 0.9em; margin-bottom: 0.5em; cursor: pointer; transition: border-color 0.2s;"
		              onfocus="this.style.borderColor='rgba(59, 130, 246, 0.5)'; this.style.boxShadow='0 0 10px rgba(59, 130, 246, 0.1)';"
		              onblur="this.style.borderColor='rgba(255, 255, 255, 0.15)'; this.style.boxShadow='none';">
		              <option value="easy" ${selectedDifficulty === 'easy' ? 'selected' : ''}>Easy - Good for beginners</option>
		              <option value="normal" ${selectedDifficulty === 'normal' ? 'selected' : ''}>Normal - Balanced challenge</option>
		              <option value="hard" ${selectedDifficulty === 'hard' ? 'selected' : ''}>Hard - Extremely challenging</option>
		            </select>
		            <div style="color: rgb(156 163 175); font-size: 0.75em; font-style: italic; margin-bottom: 0.8em;">
		              ${selectedDifficulty === 'easy' ? '🟢 Slower reactions, less accurate' : selectedDifficulty === 'normal' ? '🟡 Moderate speed and accuracy' : '🔴 Lightning-fast reactions, perfect accuracy'}
		            </div>
		            <button id="addAIBtn" style="width: 100%; font-size: 0.85em; padding: 0.55em 1.2em; border-radius: 8px; font-weight: 500; background: rgba(16, 185, 129, 0.2); color: rgb(16, 185, 129); border: 1px solid rgba(16, 185, 129, 0.5); cursor: pointer;">
		              🤖 Add AI Opponent
		            </button>
		          </div>
		        </div>
		      ` : ''}
		      
		      ${isHost ? `
		        <button id="startGameBtn" style="width: 100%; margin-bottom: 0.8em; font-size: 0.85em; padding: 0.65em 1.2em; border-radius: 8px; font-weight: 500; ${canStart ? 'background: rgba(34, 197, 94, 0.2); color: rgb(34, 197, 94); border: 1px solid rgba(34, 197, 94, 0.5); cursor: pointer;' : 'background: rgba(156, 163, 175, 0.1); color: rgb(107, 114, 128); border: 1px solid rgba(156, 163, 175, 0.2); cursor: not-allowed; opacity: 0.5;'}">
		          ${canStart ? '🎮 Start Game' : `⏳ Need ${minPlayersRequired - players.length} more player(s)...`}
		        </button>
		      ` : `
		        <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 1em; margin-bottom: 0.8em; text-align: center;">
		          <p style="color: rgb(245, 158, 11); font-size: 0.85em; margin: 0;">
		            ${canStart ? '⏰ Waiting for host to start...' : `⏳ Waiting for ${minPlayersRequired - players.length} more player(s)...`}
		          </p>
		        </div>
		      `}
		      
		      <button id="leaveBtn" style="width: 100%; font-size: 0.85em; padding: 0.55em 1.2em; border-radius: 8px; font-weight: 500; background: rgba(220, 38, 38, 0.2); color: rgb(248, 113, 113); border: 1px solid rgba(220, 38, 38, 0.5); cursor: pointer;">
		        ← Leave Lobby
		      </button>
		    </div>
		  </div>
		  
		  <!-- Chat Section -->
		  <div style="margin-top: 2em; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 1.5em;">
		    <h3 style="color: rgb(156 163 175); font-size: 0.9em; margin: 0 0 0.8em 0; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5em;">💬 Room Chat</h3>
		    
		    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 1em; display: flex; flex-direction: column; gap: 0.75em; max-height: 300px;">
		      <!-- Chat Messages Display -->
		      <div id="chatMessages" style="flex: 1; overflow-y: auto; min-height: 150px; max-height: 200px; display: flex; flex-direction: column; gap: 0.5em; padding: 0.5em; background: rgba(0, 0, 0, 0.2); border-radius: 6px;">
		        ${chatMessages.length === 0 ? `
		          <div style="color: rgb(156 163 175); font-size: 0.85em; text-align: center; padding: 1em; font-style: italic;">
		            No messages yet. Start the conversation!
		          </div>
		        ` : chatMessages.map(msg => {
		          const isCurrentUser = msg.playerId === currentUserId;
		          const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
		          // Escape HTML to prevent XSS
		          const escapedMessage = msg.message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
		          const escapedUsername = msg.username.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
		          return `
		            <div style="display: flex; flex-direction: column; gap: 0.2em; padding: 0.5em; background: ${isCurrentUser ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)'}; border-radius: 6px; border-left: 3px solid ${isCurrentUser ? 'rgba(59, 130, 246, 0.5)' : 'rgba(156, 163, 175, 0.3)'};">
		              <div style="display: flex; justify-content: space-between; align-items: center;">
		                <span style="color: ${isCurrentUser ? 'rgba(59, 130, 246, 0.9)' : 'rgb(229 231 235)'}; font-weight: 500; font-size: 0.85em;">
		                  ${isCurrentUser ? 'You' : escapedUsername}
		                </span>
		                ${time ? `<span style="color: rgb(156 163 175); font-size: 0.75em;">${time}</span>` : ''}
		              </div>
		              <div style="color: rgb(229 231 235); font-size: 0.9em; word-wrap: break-word;">${escapedMessage}</div>
		            </div>
		          `;
		        }).join('')}
		      </div>
		      
		      <!-- Chat Input -->
		      <div style="display: flex; gap: 0.5em;">
		        <input 
		          id="chatInput" 
		          type="text"
		          placeholder="Type a message..."
		          maxlength="200"
		          autocomplete="off"
		          value="${preservedChatValue}"
		          style="flex: 1; padding: 0.65em; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; background: rgba(255, 255, 255, 0.05); color: rgb(229 231 235); font-size: 0.9em; transition: border-color 0.2s;"
		          onfocus="this.style.borderColor='rgba(59, 130, 246, 0.5)'; this.style.boxShadow='0 0 10px rgba(59, 130, 246, 0.1)';"
		          onblur="this.style.borderColor='rgba(255, 255, 255, 0.15)'; this.style.boxShadow='none';">
		        <button id="sendChatBtn" style="flex: 0 0 auto; font-size: 0.85em; padding: 0.65em 1.2em; border-radius: 8px; font-weight: 500; background: rgba(59, 130, 246, 0.2); color: rgb(229 231 235); border: 1px solid rgba(59, 130, 246, 0.5); cursor: pointer; transition: all 0.2s;"
		          onmouseover="this.style.background='rgba(59, 130, 246, 0.3)'; this.style.borderColor='rgba(59, 130, 246, 0.7)';"
		          onmouseout="this.style.background='rgba(59, 130, 246, 0.2)'; this.style.borderColor='rgba(59, 130, 246, 0.5)';">
		          Send
		        </button>
		      </div>
		    </div>
		  </div>
		  
		</div>
	  </div>
	`;
  
	if (preservedValue || wasFocused) {
	  const newInput = document.getElementById('joinRoomInput') as HTMLInputElement;
	  if (newInput) {
		if (preservedValue) {
		  newInput.value = preservedValue;
		}
		if (wasFocused) {
		  setTimeout(() => {
			newInput.focus();
			// Restore cursor position
			if (cursorPosition !== null) {
			  newInput.setSelectionRange(cursorPosition, cursorPosition);
			}
		  }, 0);
		}
	  }
	}
  
	// Restore chat input state
	if (preservedChatValue || wasChatFocused) {
	  const newChatInput = document.getElementById('chatInput') as HTMLInputElement;
	  if (newChatInput) {
		if (preservedChatValue) {
		  newChatInput.value = preservedChatValue;
		}
		if (wasChatFocused) {
		  setTimeout(() => {
			newChatInput.focus();
			// Restore cursor position
			if (chatCursorPosition !== null) {
			  newChatInput.setSelectionRange(chatCursorPosition, chatCursorPosition);
			}
		  }, 0);
		}
	  }
	}
  
	attachEventListeners(canAddMore, canStart, isHost, currentPlayer);
  
	// Scroll chat to bottom after initial render
	setTimeout(() => {
		const chatMessagesDiv = document.getElementById('chatMessages');
		if (chatMessagesDiv) {
			chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
		}
	}, 100);
  }

function attachEventListeners(canAddMore: boolean, canStart: boolean, isHost: boolean, currentPlayer?: Player): void {
	const joinRoomBtn = document.getElementById('joinRoomBtn');
	if (joinRoomBtn) {
		joinRoomBtn.addEventListener('click', () => {
			const input = document.getElementById('joinRoomInput') as HTMLInputElement;
			if (input && input.value.trim()) {
		  		const roomId = input.value.trim();
		  		window.location.href = `/join/${roomId}`;
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

  	const addLocalBtn = document.getElementById('addLocalBtn');
  	if (addLocalBtn && canAddMore && isHost) {
    	addLocalBtn.addEventListener('click', () => addLocalPlayer()); 
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

  	// Chat event listeners
  	const chatInput = document.getElementById('chatInput') as HTMLInputElement;
  	const sendChatBtn = document.getElementById('sendChatBtn');
  
  	if (chatInput && sendChatBtn) {
    	sendChatBtn.addEventListener('click', () => sendChatMessage());
    
    	chatInput.addEventListener('keypress', (e) => {
      		if (e.key === 'Enter') {
        		sendChatMessage();
      		}
    	});
  	}
	}

async function toggleReady(): Promise<void> {
	const currentRoom = getCurrentRoom();
  	if (!currentRoom || !currentUserId) return;

  	try {
    	const response = await fetch(`/api/room/${currentRoom.roomId}/ready`, {
      		method: 'POST',
      		credentials: 'include',
      		headers: { 
        		'Content-Type': 'application/json',
      		},
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
  
  	if (!currentRoom) {
    	console.error('❌ [AI] currentRoom is null!');
		alert('Error: Room not initialized');
    	return;
  	}

  	// Get selected difficulty from the dropdown
  	const difficultySelect = document.getElementById('aiDifficulty') as HTMLSelectElement;
  	const selectedDifficulty = difficultySelect?.value || 'normal';

  	const aiNumber = currentRoom.players.filter(p => p.isAI).length + 1;
  	const aiId = `ai-${Date.now()}`;
  	const roomId = currentRoom.roomId;
  
  	try {
    	const joinResponse = await fetch(`/api/room/${roomId}/join`, {
			method: 'POST',
			credentials: 'include',
			headers: { 
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				playerId: aiId,
				username: `AI Bot ${aiNumber}`,
				isAI: true,
				isReady: true,
				isLocal: true,
				difficulty: selectedDifficulty
			})
   		});

    	const joinData = await joinResponse.json();
    
    	if (joinData.success) {
      		await fetchRoomState();
    	}
  	} catch (error) {
    	console.error('❌ [AI] Error adding AI:', error);
    	alert('Failed to add AI opponent');
  	}
}

async function addLocalPlayer(): Promise<void> {
	const currentRoom = getCurrentRoom();
  
  	if (!currentRoom) {
    	console.error('❌ [LOCAL] currentRoom is null!');
    	alert('Error: Room not initialized');
    	return;
  	}

  	const localId = `local`;
  	const roomId = currentRoom.roomId;
  
  	console.log(`[LOCAL] Adding Local Player to room ${roomId}`);

  	let username:string | null = "Local";
  	username = window.prompt("Enter an alias for local player", "Local");
  
  	if (!username) {
    	return; 
  	}
  
  try {
    const joinResponse = await fetch(`/api/room/${roomId}/join`, {
      method: 'POST',
      credentials: 'include',
      headers: { 
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        playerId: localId,
        username: username,
        isAI: false,
        isReady: false,
        isLocal: true
      })
    });

    	const joinData = await joinResponse.json();
    
    	if (joinData.success) {
      		await fetchRoomState();
    	}
  	} catch (error) {
    	console.error('❌ [LOCAL] Error adding Local:', error);
    	alert('Failed to add Local opponent');
  	}
}

async function removePlayer(playerId: string): Promise<void> {
  	const currentRoom = getCurrentRoom();
  	if (!currentRoom) return;

  	try {
    	const response = await fetch(`/api/room/${currentRoom.roomId}/leave`, {
      		method: 'POST',
      		credentials: 'include',
      		headers: { 
        		'Content-Type': 'application/json',
      		},
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
      		credentials: 'include',
      		headers: { 
        		'Content-Type': 'application/json',
      		},
      		body: JSON.stringify({ playerId: currentUserId })
    	});

    	stopRoomPolling();
    	clearRoomState();
    
    	history.pushState({ page: 'landing' }, '', '/');
    	setCurrentPage('landing');
    	renderApp();
  	} catch (error) {
    	console.error('Error leaving room:', error);
  }
}

function sendChatMessage(): void {
  	const chatInput = document.getElementById('chatInput') as HTMLInputElement;
  	if (!chatInput || !lobbyWebSocket) return;
  
  	const message = chatInput.value.trim();
  	if (!message) return;
  
  	// Get current user's username
  	const currentRoom = getCurrentRoom();
  	const currentPlayer = currentRoom?.players.find(p => p.id === currentUserId);
  	const username = currentPlayer?.username || 'Guest';
  
  	// Send chat message via WebSocket
  	lobbyWebSocket.sendChat(username, message);
  
  	// Clear input
  	chatInput.value = '';
}

function updateChatDisplay(): void {
  	const chatMessagesDiv = document.getElementById('chatMessages');
  	if (!chatMessagesDiv) return;
  
  	// Preserve chat input value and focus state before updating
  	const chatInput = document.getElementById('chatInput') as HTMLInputElement;
  	const preservedChatValue = chatInput ? chatInput.value : '';
  	const wasChatFocused = chatInput && document.activeElement === chatInput;
  	const chatCursorPosition = chatInput ? chatInput.selectionStart : 0;
  
  	const currentRoom = getCurrentRoom();
  	const currentPlayer = currentRoom?.players.find(p => p.id === currentUserId);
  
  	chatMessagesDiv.innerHTML = chatMessages.length === 0 ? `
    	<div style="color: rgb(156 163 175); font-size: 0.85em; text-align: center; padding: 1em; font-style: italic;">
      		No messages yet. Start the conversation!
    	</div>
  	` : chatMessages.map(msg => {
    	const isCurrentUser = msg.playerId === currentUserId;
    	const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    	// Escape HTML to prevent XSS
    	const escapedMessage = msg.message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    	const escapedUsername = msg.username.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    	return `
      		<div style="display: flex; flex-direction: column; gap: 0.2em; padding: 0.5em; background: ${isCurrentUser ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)'}; border-radius: 6px; border-left: 3px solid ${isCurrentUser ? 'rgba(59, 130, 246, 0.5)' : 'rgba(156, 163, 175, 0.3)'};">
        		<div style="display: flex; justify-content: space-between; align-items: center;">
          			<span style="color: ${isCurrentUser ? 'rgba(59, 130, 246, 0.9)' : 'rgb(229 231 235)'}; font-weight: 500; font-size: 0.85em;">
            			${isCurrentUser ? 'You' : escapedUsername}
          			</span>
          			${time ? `<span style="color: rgb(156 163 175); font-size: 0.75em;">${time}</span>` : ''}
        		</div>
        		<div style="color: rgb(229 231 235); font-size: 0.9em; word-wrap: break-word;">${escapedMessage}</div>
      		</div>
    	`;
  	}).join('');
  
  	// Scroll to bottom
  	chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
  
  	// Restore chat input state if it was focused
  	if (chatInput && (preservedChatValue || wasChatFocused)) {
    	if (preservedChatValue) {
      		chatInput.value = preservedChatValue;
    	}
    	if (wasChatFocused) {
      		setTimeout(() => {
        		chatInput.focus();
        		if (chatCursorPosition !== null) {
          			chatInput.setSelectionRange(chatCursorPosition, chatCursorPosition);
        		}
      		}, 0);
    	}
  	}
}

export function cleanupLobby(): void {
  	stopRoomPolling();
  	if (lobbyWebSocket) {
    	lobbyWebSocket.disconnect();
    	lobbyWebSocket = null;
  	}
  	clearRoomState();
  	chatMessages = []; // Clear chat messages on cleanup
}

export type { Player, GameRoom };
