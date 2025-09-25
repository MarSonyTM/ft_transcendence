// Import CSS for Vite
import './styles.css';

declare global {
  interface Window {
    __INITIAL_STATE__?: {
      gameState: any;
      gameId: number | null;
      currentUsername: string;
      currentPage: string;
      timestamp: number;
      apiEndpoint: string;
      wsEndpoint: string;
      environment: string;
    };
    __GAME_STATE__?: any;
    __GAME_ID__?: number | null;
    __USERNAME__?: string;
    __CURRENT_PAGE__?: string;
  }
}

// Type definitions
interface GameState {
    ballPosX: number;
    ballPosY: number;
    player1Pos: number;
    player2Pos: number;
    scorePlayer1: number;
    scorePlayer2: number;
}

interface WebSocketMessage {
    type: string;
    gameId?: number;
    playerId?: number;
    state?: GameState;
    scorePlayer1?: number;
    scorePlayer2?: number;
    message?: string;
    winner?: number;
}

interface TournamentPlayer {
    id: number;
    alias: string;
    eliminated: boolean;
    wins: number;
    losses: number;
}

interface TournamentMatch {
    matchId: number;
    player1: TournamentPlayer | null;
    player2: TournamentPlayer | null;
    startedAt: string;
}

interface TournamentNextMatchPreview {
    order: number;
    player1: string;
    player2?: string | null;
}

interface TournamentHistoryEntry {
    id: number;
    player1?: string | null;
    player1Id?: number;
    player2?: string | null;
    player2Id?: number;
    winner?: string | null;
    winnerId?: number;
    loser?: string | null;
    loserId?: number;
    startedAt?: string;
    finishedAt?: string;
}

type TournamentStatus = 'idle' | 'in_progress' | 'completed';

interface TournamentState {
    id: number;
    status: TournamentStatus | string;
    createdAt: string;
    updatedAt: string;
    players: TournamentPlayer[];
    currentMatch: TournamentMatch | null;
    queue: string[];
    nextMatches: TournamentNextMatchPreview[];
    matchHistory: TournamentHistoryEntry[];
    championId?: number;
    championAlias?: string | null;
}

interface TournamentSummary {
    id: number;
    status: string;
    championId?: number;
    createdAt: string;
    updatedAt: string;
    players: number;
    matches: number;
}

let curUsername: string = window.__USERNAME__ || '';
let pendingAliases: string[] = [];
let currentMatchPlayers: { left?: string; right?: string } = {};

function getApiEndpoint(): string {
    return window.__INITIAL_STATE__?.apiEndpoint || '';
}

function getDisplayNameForPlayer(position: 'left' | 'right'): string {
    if (position === 'left') {
        return currentMatchPlayers.left || curUsername || 'Player 1';
    }
    return currentMatchPlayers.right || 'Player 2';
}

function updateScoreboardNames(): void {
    const player1Name = document.getElementById('player1Name');
    const player2Name = document.getElementById('player2Name');
    if (player1Name) {
        player1Name.textContent = getDisplayNameForPlayer('left');
    }
    if (player2Name) {
        player2Name.textContent = getDisplayNameForPlayer('right');
    }
}

class PongGame {
    gameId: number | null = null;
    canvas: HTMLCanvasElement | null = null;
    ctx: CanvasRenderingContext2D | null = null;
    websocket: WebSocket | null = null;
    isActive: boolean = false;
    fpsStartTime: number = performance.now();
    frameCount: number = 0;
    lastPingTime: number = 0;
    gameState: GameState = {
        ballPosX: 200,
        ballPosY: 100,
        player1Pos: 80,
        player2Pos: 80,
        scorePlayer1: 0,
        scorePlayer2: 0
    };
    heartbeatInterval: any = null;
    keys: { [key: string]: boolean } = {};
    playerId: number = 1;
    player2Id: number = 2;
    paddlePositionLeft: number = 80;
    paddlePositionRight: number = 80;
    
    constructor() {
        this.setupKeyboardControls();
        
        // Initialize with SSR injected game state if available
        if (window.__GAME_STATE__) {
            this.gameState = { ...this.gameState, ...window.__GAME_STATE__ };
            console.log('🏓 Initialized with SSR game state:', this.gameState);
        }
        
        // Use SSR injected game ID if available
        if (window.__GAME_ID__) {
            this.gameId = window.__GAME_ID__;
            console.log('🎮 Using SSR game ID:', this.gameId);
        }
    }

    async init(): Promise<void> {
        this.canvas = document.getElementById("gameScreen") as HTMLCanvasElement;
        this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
        
        this.updateStatus("Initializing...");
        
        try {
            // If we don't have a game ID from SSR, create a new game
            if (!this.gameId) {
                await this.createGame();
            }
            
            if (this.gameId) {
                await this.connectWebSocket();
                await this.startServerGame();
                this.startRenderLoop();
            }
        } catch (error) {
            this.updateStatus(`Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async createGame(): Promise<void> {
        try {
            // Use SSR endpoint if available, otherwise default
            const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
            const response = await fetch(`${apiEndpoint}/api/game/new`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ 
                    mode: "1v1", 
                    difficulty: "normal" 
                }),
            });

            const data = await response.json();
            if (data.success && data.data && data.data.id) {
                this.gameId = data.data.id;
                console.log('🎮 Created new game:', this.gameId);
            } else {
                throw new Error(data.message || "Failed to create game");
            }
        } catch (error) {
            throw error;
        }
    }

    async connectWebSocket(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // Use SSR WebSocket endpoint if available, otherwise default
            const wsEndpoint = window.__INITIAL_STATE__?.wsEndpoint || 'ws://localhost:3000';
            const wsUrl = `${wsEndpoint}/game/${this.gameId}/ws`;
            
            console.log('🔌 Connecting to WebSocket:', wsUrl);
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = () => {
                console.log('✅ WebSocket connected');
                this.updateWSStatus("Connected", true);
                this.startHeartbeat();
                resolve();
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleWebSocketMessage(message);
                } catch (error) {
                    // Do something
                }
            };
            
            this.websocket.onclose = (event) => {
                console.log('❌ WebSocket disconnected');
                this.updateWSStatus("Disconnected", false);
                this.isActive = false;
                
                // Auto-reconnect after 3 seconds
                setTimeout(() => {
                    if (this.gameId && (!this.websocket || this.websocket.readyState === WebSocket.CLOSED)) {
                        console.log('🔄 Attempting WebSocket reconnection...');
                        this.connectWebSocket();
                    }
                }, 3000);
            };
            
            this.websocket.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
                this.updateWSStatus("Error", false);
                reject(error);
            };
            
            // Timeout after 5 seconds
            setTimeout(() => {
                if (this.websocket && this.websocket.readyState !== WebSocket.OPEN) {
                    reject(new Error("WebSocket connection timeout"));
                }
            }, 5000);
        });
    }

    handleWebSocketMessage(message: WebSocketMessage): void {
        switch (message.type) {
            case 'connected':
                break;
                
            case 'gameState':
                if (message.state) {
                    this.gameState = {
                        ballPosX: message.state.ballPosX || this.gameState.ballPosX,
                        ballPosY: message.state.ballPosY || this.gameState.ballPosY,
                        player1Pos: message.state.player1Pos || this.gameState.player1Pos,
                        player2Pos: message.state.player2Pos || this.gameState.player2Pos,
                        scorePlayer1: message.state.scorePlayer1 || 0,
                        scorePlayer2: message.state.scorePlayer2 || 0
                    };
                    
                    this.updateScoreDisplay();
                }
                break;
                
            case 'gameStop':
                this.isActive = false;
                this.updateStatus("Game stopped");
                break;

            case 'score':
                this.gameState.scorePlayer1 = message.scorePlayer1 || 0;
                this.gameState.scorePlayer2 = message.scorePlayer2 || 0;
                this.updateScoreDisplay();
                break;
                
            case 'ballReset':
                break;
                
            case 'gameEnd':
                this.isActive = false;
                break;
        }
    }

    updateScoreDisplay(): void {
        const leftScore = document.getElementById('leftScore');
        const rightScore = document.getElementById('rightScore');
        if (leftScore) leftScore.textContent = this.gameState.scorePlayer1.toString();
        if (rightScore) rightScore.textContent = this.gameState.scorePlayer2.toString();
    }

    async startServerGame(): Promise<void> {
        try {
            const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
            const response = await fetch(`${apiEndpoint}/api/game/${this.gameId}/start`, {
                method: "POST"
            });

            const data = await response.json();
            if (data.success) {
                this.isActive = true;
                this.updateStatus("Game running!");
                const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
                const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
                if (startBtn) startBtn.disabled = true;
                if (stopBtn) stopBtn.disabled = false;
                this.updatePlayerInfo();
            } else {
                throw new Error(data.message || "Failed to start game");
            }
        } catch (error) {
            throw error;
        }
    }

    startRenderLoop(): void {
        const renderFrame = () => {
            this.updateFPS();
            this.handleInput();
            this.render();
            requestAnimationFrame(renderFrame);
        };
        
        requestAnimationFrame(renderFrame);
    }

    handleInput(): void {
        if (!this.isActive) return;
        
        // Left paddle (W/S)
        let newLeft = this.paddlePositionLeft;
        const paddleSpeed = 4;
        
        if (this.keys['KeyW'] && this.paddlePositionLeft > 0) {
            newLeft = Math.max(0, this.paddlePositionLeft - paddleSpeed);
        }
        if (this.keys['KeyS'] && this.paddlePositionLeft < 160) {
            newLeft = Math.min(160, this.paddlePositionLeft + paddleSpeed);
        }

        if (newLeft !== this.paddlePositionLeft) {
            this.paddlePositionLeft = newLeft;
            this.sendPlayerMove(newLeft, 1);
        }

        // Right paddle (O/L)
        let newRight = this.paddlePositionRight;
        if (this.keys['KeyO'] && this.paddlePositionRight > 0) {
            newRight = Math.max(0, this.paddlePositionRight - paddleSpeed);
        }
        if (this.keys['KeyL'] && this.paddlePositionRight < 160) {
            newRight = Math.min(160, this.paddlePositionRight + paddleSpeed);
        }

        if (newRight !== this.paddlePositionRight) {
            this.paddlePositionRight = newRight;
            this.sendPlayerMove(newRight, 2);
        }
    }

    sendPlayerMove(position: number, playerId: number): void {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                type: 'move',
                position: position,
                playerId: playerId
            }));
        }
    }

    render(): void {
        if (!this.ctx || !this.canvas) return;

        // Use gameState with fallback values
        const ballPosX = this.gameState.ballPosX || 200;
        const ballPosY = this.gameState.ballPosY || 100;
        const player1Pos = this.gameState.player1Pos || 80;
        const player2Pos = this.gameState.player2Pos || 80;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw center line
        this.ctx.strokeStyle = "white";
        this.ctx.setLineDash([5, 15]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width / 2, 0);
        this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw paddles
        this.ctx.fillStyle = "grey";
        
        // Left paddle (player 1)
        const leftPaddleY = this.playerId === 1 ? this.paddlePositionLeft : player1Pos;
        this.ctx.fillRect(0, leftPaddleY, 10, 40);
        
        // Right paddle (player 2)
        const rightPaddleY = this.playerId === 2 ? this.paddlePositionRight : player2Pos;
        this.ctx.fillRect(this.canvas.width - 10, rightPaddleY, 10, 40);

        // Draw ball
        this.ctx.beginPath();
        this.ctx.arc(ballPosX, ballPosY, 10, 0, 2 * Math.PI);
        this.ctx.fillStyle = "white";
        this.ctx.fill();

        // Draw game info
        this.ctx.font = "12px Arial";
        this.ctx.fillStyle = "white";
        this.ctx.textAlign = "center";
        this.ctx.fillText(`Game ${this.gameId}`, this.canvas.width / 2, 15);
    }

    setupKeyboardControls(): void {
        document.addEventListener('keydown', (event) => {
            this.keys[event.code] = true;
        });

        document.addEventListener('keyup', (event) => {
            this.keys[event.code] = false;
        });
    }

    startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                this.lastPingTime = Date.now();
                this.websocket.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    }

    updateFPS(): void {
        const now = performance.now();
        this.frameCount++;
        const elapsed = now - this.fpsStartTime;
        
        if (elapsed >= 1000) {
            const fps = Math.round((this.frameCount * 1000) / elapsed);
            const fpsCounter = document.getElementById('fpsCounter');
            if (fpsCounter) fpsCounter.textContent = fps.toString();
            this.fpsStartTime = now;
            this.frameCount = 0;
        }
    }

    updatePlayerInfo(): void {
        const player1Name = document.getElementById('player1Name');
        const player2Name = document.getElementById('player2Name');
        const username = window.__USERNAME__ || currentUsername || "Player 1";
        if (player1Name) player1Name.textContent = username;
        if (player2Name) player2Name.textContent = "Marvin";
    }

    updateStatus(status: string): void {
        const gameStatus = document.getElementById('gameStatus');
        if (gameStatus) gameStatus.textContent = status;
    }

    updateWSStatus(status: string, connected: boolean): void {
        const element = document.getElementById('wsStatus');
        if (element) {
            if (connected) {
                element.className = 'connected';
            } else {
                element.className = 'disconnected';
            }
        }
    }

    async stopGame(): Promise<void> {
        this.isActive = false;
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        if (this.websocket) {
            this.websocket.close();
        }

        if (this.gameId) {
            try {
                const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
                await fetch(`${apiEndpoint}/api/game/${this.gameId}/stop`, {
                    method: "POST"
                });
                this.updateStatus("Game stopped");
            } catch (error) {
                // Ignore stop errors
            }
        }

        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
        if (startBtn) 
            startBtn.disabled = false;
        if (stopBtn) 
            stopBtn.disabled = true;
    }

    reconnectWebSocket(): void {
        if (this.gameId) {
            if (this.websocket) {
                this.websocket.close();
            }
            this.connectWebSocket();
        }
    }
}

// SPA State
type AppPage = 'landing' | 'login' | 'game';

// Initialize from SSR if available, otherwise use defaults
let currentPage: AppPage = (window.__CURRENT_PAGE__ as AppPage) || 'landing';
let pongGame: PongGame | null = null;
let currentUsername: string = window.__USERNAME__ || '';

// Log SSR initialization
if (window.__INITIAL_STATE__) {
    console.log('🏓 SSR: Initialized with server data:', window.__INITIAL_STATE__);
    console.log('📄 SSR: Current page:', currentPage);
    console.log('👤 SSR: Username:', currentUsername);
}

function renderLandingPage() {
    const root = document.getElementById('app-root');
    if (!root) return;
    root.innerHTML = `
        <div class="landing-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
            <h1 class="main-title" style="font-weight: bold; text-align: center; font-size: 4em;">PING PONG</h1>
            <button id="loginBtn" class="btn btn-login" style="font-weight: bold; margin: 8px 0; font-size: 2em;">Login</button>
            <button id="registerBtn" class="btn btn-register" style="font-weight: bold; margin: 8px 0; font-size: 2em;">Register</button>
            <button id="quickPlayBtn" class="btn btn-quickplay" style="font-weight: bold; margin: 8px 0; font-size: 2em; background: #4ade80; color: #222;">Quick Play</button>
        </div>
    `;
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            history.pushState({ page: 'login' }, '', '#login');
            currentPage = 'login';
            renderApp();
        });
    }
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            // TODO: add registration function
            alert('Registration coming soon!');
        });
    }
    const quickPlayBtn = document.getElementById('quickPlayBtn');
    if (quickPlayBtn) {
        quickPlayBtn.addEventListener('click', () => {
            currentUsername = 'You';
            history.pushState({ page: 'game' }, '', '#game');
            currentPage = 'game';
            renderApp();
        });
    }
}

async function loginUser(username: string, password: string): Promise<{ success: boolean; username?: string; error?: string }> {
    // TODO: Add backend logic to log user in
    await new Promise((resolve) => setTimeout(resolve, 500));
    // Accept any username/password for now
    if (username) {
        return { success: true, username };
    } else {
        return { success: false, error: 'Username required' };
    }
}

function renderLoginPage() {
    const root = document.getElementById('app-root');
    if (!root) return;
    root.innerHTML = `
        <div class="login-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
            <h2 style="font-size: 2em; margin-bottom: 1em;">Login</h2>
            <form id="loginForm" style="display: flex; flex-direction: column; gap: 1em; min-width: 250px;">
                <input id="usernameInput" type="text" placeholder="Username" required style="padding: 0.5em; font-size: 1.2em;" />
                <input id="passwordInput" type="password" placeholder="Password" required style="padding: 0.5em; font-size: 1.2em;" />
                <button type="submit" class="btn btn-login" style="font-size: 1.2em;">Login</button>
                <div id="loginError" style="color: red; margin-top: 0.5em;"></div>
            </form>
            <button id="backToLandingBtn" class="btn btn-home" style="margin-top: 2em; font-size: 1.1em;">Back</button>
        </div>
    `;
    const loginForm = document.getElementById('loginForm') as HTMLFormElement;
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('usernameInput') as HTMLInputElement;
            const passwordInput = document.getElementById('passwordInput') as HTMLInputElement;
            const loginError = document.getElementById('loginError');
            if (loginError) loginError.textContent = '';
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            const result = await loginUser(username, password);
            if (result.success && result.username) {
                currentUsername = result.username;
                history.pushState({ page: 'game' }, '', '#game');
                currentPage = 'game';
                renderApp();
            } else if (loginError) {
                loginError.textContent = result.error || 'Login failed';
            }
        });
    }
    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.pushState({ page: 'landing' }, '', '#');
            currentPage = 'landing';
            renderApp();
        });
    }
}

function renderGamePage() {
    const root = document.getElementById('app-root');
    if (!root) return;
    root.innerHTML = `
        <h1 class="main-title">ft_transcendence - Pong Prototype</h1>
        <div class="game-status">
            <div>
                Status: <span id="gameStatus" class="status-text">Initializing...</span>
            </div>
            <div>
                WebSocket: <span id="wsStatus" class="ws-status">Disconnected</span>
            </div>
            <div>
                FPS: <span id="fpsCounter" class="fps-text">0</span>
            </div>
        </div>
        <div class="controls-container">
            <button id="startBtn" class="btn btn-start">Start Game</button>
            <button id="stopBtn" class="btn btn-stop">Stop Game</button>
            <button id="reconnectBtn" class="btn btn-reconnect">Reconnect WebSocket</button>
            <button id="tournamentsBtn" class="btn btn-tournaments">Tournaments</button>
        </div>
        <div class="player-info">
            <div class="player-names">
                <span id="player1Name" class="player1-name">${currentUsername || 'Player 1'}</span>
                <span class="vs-text">vs</span> 
                <span id="player2Name" class="player2-name">Player 2</span>
            </div>
            <div class="score-container">
                <span id="leftScore" class="left-score">0</span> 
                <span class="score-separator">-</span> 
                <span id="rightScore" class="right-score">0</span>
            </div>
        </div>
        <canvas id="gameScreen" width="400" height="200"></canvas>
        <div class="controls-info">
            <p>Player 1 - Up/Down W/S</p>
            <p>Player 2 - Up/Down O/L</p>
        </div>
        <hr>
        <div id="tournamentRoot" class="t-section"></div>
    `;
    // Button handlers
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const reconnectBtn = document.getElementById('reconnectBtn');
    const tournamentsBtn = document.getElementById('tournamentsBtn');
    if (startBtn) startBtn.addEventListener('click', startGame);
    if (stopBtn) stopBtn.addEventListener('click', stopGame);
    if (reconnectBtn) reconnectBtn.addEventListener('click', reconnectWS);
    if (tournamentsBtn) tournamentsBtn.addEventListener('click', toggleTournaments);

    // Initialize game logic
    if (!pongGame) {
        pongGame = new PongGame();
        pongGame.init();
    }
}

function renderApp() {
    if (currentPage === 'landing') {
        renderLandingPage();
    } else if (currentPage === 'login') {
        renderLoginPage();
    } else {
        renderGamePage();
    }
}

// Handle browser navigation (back/forward)
window.addEventListener('popstate', (event) => {
    if (location.hash === '#game') {
        // If navigating back to game, reset state and go to landing
        pongGame = null;
        currentUsername = '';
        currentPage = 'landing';
        history.replaceState({ page: 'landing' }, '', '#');
        renderApp();
    } else if (location.hash === '#login') {
        pongGame = null;
        currentUsername = '';
        currentPage = 'login';
        renderApp();
    } else {
        pongGame = null;
        currentUsername = '';
        currentPage = 'landing';
        renderApp();
    }
});

// Enhanced SPA entry with SSR support
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 App starting with SSR support...');
    
    // Log SSR data if available
    if (window.__INITIAL_STATE__) {

        // Initialize from SSR data
        currentPage = (window.__CURRENT_PAGE__ as AppPage) || 'landing';
        currentUsername = window.__USERNAME__ || '';
        
    } else {
        // Fallback to URL-based routing if no SSR data
        console.log('⚠️ No SSR data found, using URL-based routing');
        
        if (location.hash === '#game') {
            // If no username, force login and reset state
            pongGame = null;
            currentUsername = '';
            currentPage = 'login';
            history.replaceState({ page: 'login' }, '', '#login');
        } else if (location.hash === '#login') {
            pongGame = null;
            currentUsername = '';
            currentPage = 'login';
        } else {
            pongGame = null;
            currentUsername = '';
            currentPage = 'landing';
        }
    }
    
    // Render the app
    renderApp();
});

// Control functions for game page
async function startGame(): Promise<void> {
    if (pongGame) {
        await pongGame.init();
    }
}

async function stopGame(): Promise<void> {
    if (pongGame) {
        await pongGame.stopGame();
    }
}

async function reconnectWS(): Promise<void> {
    if (pongGame) {
        pongGame.reconnectWebSocket();
    }
}

function toggleTournaments(): void {
    const root = document.getElementById('tournamentRoot');
    const btn = document.getElementById('tournamentsBtn');
    if (!root) return;
    const hidden = root.style.display === 'none' || root.style.display === '';
    if (hidden) {
        // Lazy mount only once
        if (!root.dataset.mounted) {
            mountTournamentUI();
            root.dataset.mounted = '1';
        }
        root.style.display = 'block';
        if (btn) btn.textContent = 'Hide Tournaments';
    } else {
        root.style.display = 'none';
        if (btn) btn.textContent = 'Show Tournaments';
    }
}

// Tournament functions
function enrichTournamentState(state: TournamentState): TournamentState {
  if (state.championId && !state.championAlias) {
    const champ = state.players.find(p => p.id === state.championId);
    if (champ) state.championAlias = champ.alias;
  }
  return state;
}

async function fetchTournamentState(): Promise<TournamentState | null> {
    try {
        const res = await fetch(`${getApiEndpoint()}/api/tournament/state`);
        const data = await res.json();
        if (!data.success) return null;
        return enrichTournamentState(data.data as TournamentState);
    } catch {
        return null;
    }
}

async function fetchTournamentList(): Promise<TournamentSummary[]> {
    try {
        const res = await fetch(`${getApiEndpoint()}/api/tournament/list`);
        const data = await res.json();
        if (!data.success) return [];
        return data.data as TournamentSummary[];
    } catch {
        return [];
    }
}

async function fetchTournamentById(id: number): Promise<TournamentState | null> {
    try {
        const res = await fetch(`${getApiEndpoint()}/api/tournament/${id}`);
        const data = await res.json();
        if (!data.success) return null;
        return enrichTournamentState(data.data as TournamentState);
    } catch {
        return null;
    }
}

async function startTournament(aliases: string[]): Promise<void> {
    await fetch(`${getApiEndpoint()}/api/tournament/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliases })
    });
    await renderTournament();
}

async function submitMatchResult(winnerAlias: string): Promise<void> {
    await fetch(`${getApiEndpoint()}/api/tournament/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerAlias })
    });
    await renderTournament();
}

async function resetTournament(): Promise<void> {
    await fetch(`${getApiEndpoint()}/api/tournament/reset`, { method: 'POST' });
    await renderTournament();
}

function mountTournamentUI(): void {
    const root = document.getElementById('tournamentRoot');
    if (root) {
        root.innerHTML = `<div class="t-section">
            <div class="t-header">
                <h2 class="t-title">Tournaments</h2>
                <div class="t-header-actions">
                    <button id="allTournamentsBtn" class="btn btn-secondary btn-archive">All</button>
                </div>
            </div>
            <div id="tournamentContent" class="t-content">Loading...</div>
        </div>`;
        const allBtn = document.getElementById('allTournamentsBtn');
        if (allBtn) allBtn.addEventListener('click', openTournamentArchive);
        renderTournament();
    }
}

let archiveModalEl: HTMLDivElement | null = null;

async function openTournamentArchive(): Promise<void> {
    if (!archiveModalEl) {
        archiveModalEl = document.createElement('div');
        archiveModalEl.id = 'tArchiveModal';
        archiveModalEl.className = 't-archive-modal';
        archiveModalEl.innerHTML = `
            <div class="t-archive-backdrop" data-close="1"></div>
            <div class="t-archive-dialog">
                <div class="t-archive-header">
                    <h3>All Tournaments</h3>
                    <button class="btn btn-close-archive" data-close="1">✕</button>
                </div>
                <div class="t-archive-body">
                    <div class="t-archive-list" id="tArchiveList">Loading...</div>
                    <div class="t-archive-detail" id="tArchiveDetail">
                        <p class="t-archive-hint">Select a tournament to view details.</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(archiveModalEl);
        archiveModalEl.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.dataset.close === '1') {
                closeTournamentArchive();
            }
        });
    }
    archiveModalEl.style.display = 'block';
    await populateArchiveList();
}

function closeTournamentArchive(): void {
    if (archiveModalEl) archiveModalEl.style.display = 'none';
}

async function populateArchiveList(): Promise<void> {
    const list = await fetchTournamentList();
    const listEl = document.getElementById('tArchiveList');
    if (!listEl) return;
    if (!list.length) {
        listEl.innerHTML = `<p class="t-archive-empty">No tournaments yet.</p>`;
        return;
    }
    listEl.innerHTML = `
        <ul class="t-archive-ul">
            ${list.map(t => `
                <li class="t-archive-item">
                    <button class="t-archive-row" data-id="${t.id}">
                        <span class="t-arch-id">#${t.id}</span>
                        <span class="t-arch-status ${t.status}">${t.status}</span>
                        <span class="t-arch-meta">${new Date(t.createdAt).toLocaleString()}</span>
                        <span class="t-arch-players">${t.players} players</span>
                        <span class="t-arch-matches">${t.matches} matches</span>
                        ${t.championId ? `<span class="t-arch-champion">🏆</span>` : ''}
                    </button>
                </li>
            `).join('')}
        </ul>
    `;
    listEl.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.id);
            await showTournamentDetail(id);
        });
    });
}

async function showTournamentDetail(id: number): Promise<void> {
    const detailEl = document.getElementById('tArchiveDetail');
    if (!detailEl) return;
    detailEl.innerHTML = `<p class="t-archive-loading">Loading tournament #${id}...</p>`;
    const data = await fetchTournamentById(id);
    if (!data) {
        detailEl.innerHTML = `<p class="t-archive-error">Failed to load tournament.</p>`;
        return;
    }
    const playersHtml = data.players.map(p =>
        `<li>${p.alias} ${p.eliminated ? '✖' : ''} (${p.wins}W-${p.losses}L)</li>`).join('');
    const historyHtml = data.matchHistory.length
        ? data.matchHistory.map(h => {
            const findAlias = (id?: number) =>
                (id != null ? data.players.find(p => p.id === id)?.alias : undefined) || null;

            const p1Alias = h.player1 || findAlias(h.player1Id) || '?';
            const p2Alias = h.player2 || findAlias(h.player2Id) || '?';
            const winnerAlias =
                h.winner ||
                (h.winnerId != null ? findAlias(h.winnerId) : null) ||
                '?';

            return `<li>#${h.id} ${p1Alias} vs ${p2Alias} → <strong>${winnerAlias}</strong></li>`;
        }).join('')
        : '<li>(no matches)</li>';
    const champName = data.championAlias ||
  (data.championId ? data.players.find(p => p.id === data.championId)?.alias : null);

    detailEl.innerHTML = `
        <div class="t-archive-detail-inner">
            <h4>Tournament #${data.id}</h4>
            <p>Status: <strong>${data.status}</strong> ${champName ? ` | Champion: <strong>${champName}</strong>` : ''}</p>
            <details open>
              <summary><strong>Players (${data.players.length})</strong></summary>
              <ul class="t-archive-players">${playersHtml}</ul>
            </details>
            <details open>
              <summary><strong>Match History (${data.matchHistory.length})</strong></summary>
              <ul class="t-archive-history">${historyHtml}</ul>
            </details>
        </div>
    `;
}

async function renderTournament(): Promise<void> {
    const content = document.getElementById('tournamentContent');
    if (!content) return;
    const state = await fetchTournamentState();

    if (!state) {
        content.innerHTML = `
            <p class="t-msg">No active tournament.</p>
            <div class="t-setup">
                <form id="aliasForm" class="t-alias-form" autocomplete="off">
                    <input id="aliasInput" type="text" placeholder="Name" class="t-alias-input"></input>
                    <button type="submit" class="btn btn-submit">Add</button>
                </form>
                <ul id="pendingAliasesList" class="t-alias-list"></ul>
                <div class="t-actions">
                <button id="clearAliasesBtn" class="btn btn-stop" disabled>Clear</button>
                <button id="startTournamentBtn" class="btn btn-start" disabled>Start Tournament</button>
                </div>
            </div>
        `;

        const form = document.getElementById('aliasForm') as HTMLFormElement | null;
        const input = document.getElementById('aliasInput') as HTMLInputElement | null;
        const listEl = document.getElementById('pendingAliasesList') as HTMLUListElement | null;
        const clearBtn = document.getElementById('clearAliasesBtn') as HTMLButtonElement | null;
        const startBtn = document.getElementById('startTournamentBtn') as HTMLButtonElement | null;

        function refreshPending(): void {
            if (!listEl || !startBtn || !clearBtn) return;
            if (pendingAliases.length === 0) {
                listEl.innerHTML = `<li class="empty">No players added yet.</li>`;
            } else {
                listEl.innerHTML = pendingAliases.map(a => `
                    <li class="t-alias-item">
                        <span class="t-alias-name">${a}</span>
                        <button type="button" data-remove="${a}" class="btn btn-remove-alias" title="Remove ${a}">×</button>
                    </li>
                `).join('');
            }
            startBtn.disabled = pendingAliases.length < 2;
            clearBtn.disabled = pendingAliases.length === 0;

            // Bind remove buttons
            listEl.querySelectorAll('button[data-remove]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const alias = (btn as HTMLButtonElement).dataset.remove!;
                    pendingAliases = pendingAliases.filter(p => p !== alias);
                    refreshPending();
                });
            });
        }

        if (form && input) {
            form.addEventListener('submit', e => {
                e.preventDefault();
                const alias = input.value.trim();
                if (!alias) return;
                const exists = pendingAliases.some(a => a.toLowerCase() === alias.toLowerCase());
                if (exists) {
                    input.value = '';
                    input.placeholder = 'Alias already added';
                    setTimeout(() => input.placeholder = 'Name', 3000);
                    return;
                }
                pendingAliases.push(alias);
                input.value = '';
                refreshPending();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (pendingAliases.length && confirm('Clear all pending players?')) {
                    pendingAliases = [];
                    refreshPending();
                }
            });
        }

        if (startBtn) {
            startBtn.addEventListener('click', async () => {
                if (pendingAliases.length < 2) return;
                await startTournament(pendingAliases);
                pendingAliases = [];
            });
        }

        refreshPending();
        return;
    }

    const curMatch = state.currentMatch && state.currentMatch.player1 && state.currentMatch.player2
        ? `${state.currentMatch.player1.alias} vs ${state.currentMatch.player2.alias}`
        : '(waiting for players)';

    const queueList = state.queue.length ? state.queue.join(', ') : '(empty)';
    const historyHtml = state.matchHistory.slice(-5).map(h =>
        `<li>${h.player1} vs ${h.player2} → <strong>${h.winner}</strong></li>`
    ).join('') || '<li>(none yet)</li>';

    let winnerButtons = '';
    if (state.currentMatch && state.currentMatch.player1 && state.currentMatch.player2 && state.status === 'in_progress') {
        winnerButtons = `
            <div style="display:flex; gap:.5rem; margin-top:.5rem;">
                <button data-winner="${state.currentMatch.player1.alias}" class="btn btn-start" style="flex:1;">${state.currentMatch.player1.alias} Won</button>
                <button data-winner="${state.currentMatch.player2.alias}" class="btn btn-start" style="flex:1;">${state.currentMatch.player2.alias} Won</button>
            </div>
        `;
    }

    const championAlias = state.championAlias ||
        (state.championId ? state.players.find(p => p.id === state.championId)?.alias : null);

    const championBlock = state.status === 'completed' && championAlias
        ? `<p style="margin:.4rem 0;"><strong>Champion:</strong> ${championAlias}</p>`
        : '';

    const showMatchAndQueue = state.status !== 'completed';
    
    content.innerHTML = `
        <p style="margin:.2rem 0;"><strong>Status:</strong> ${state.status}</p>
        ${championBlock}
        ${showMatchAndQueue ? `<p style="margin:.2rem 0;"><strong>Current Match:</strong> ${curMatch}</p>` : ''}
        ${showMatchAndQueue ? `<p style="margin:.2rem 0;"><strong>Queue:</strong> ${queueList}</p>` : ''}
        ${winnerButtons}
        <details style="margin:.5rem; border-top:1px solid #666; padding:.5rem;">
            <summary style="cursor:pointer;">Recent Results</summary>
            <ul style="margin:.3rem 0; padding-left:1.2rem;">${historyHtml}</ul>
        </details>
        <div>
            <button id="tReset" class="t-section btn-reset">Reset</button>
        </div>
    `;

    // Attach winner buttons
    content.querySelectorAll('button[data-winner]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const alias = (btn as HTMLButtonElement).dataset.winner!;
            await submitMatchResult(alias);
        });
    });
    const resetBtn = document.getElementById('tReset');
    if (resetBtn) resetBtn.addEventListener('click', async () => {
        if (confirm('Reset tournament?')) {
            await resetTournament();
        }
    });

    // Sync scoreboard names if a current match exists
    if (state.currentMatch && state.currentMatch.player1 && state.currentMatch.player2) {
        currentMatchPlayers.left = state.currentMatch.player1.alias;
        currentMatchPlayers.right = state.currentMatch.player2.alias;
        updateScoreboardNames();
    } else if (state.status === 'completed' && state.championId) {
        const champAlias2 = championAlias || 'Champion';
        currentMatchPlayers.left = champAlias2;
        currentMatchPlayers.right = '---';
        updateScoreboardNames();
    }
}