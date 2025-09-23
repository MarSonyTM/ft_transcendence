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
    player3Pos: number;
    player4Pos: number;
    scorePlayer1: number;
    scorePlayer2: number;
    scorePlayer3: number;
    scorePlayer4: number;
    gameMode: string;
}

interface WebSocketMessage {
    type: string;
    gameId?: number;
    playerId?: number;
    state?: GameState;
    scorePlayer1?: number;
    scorePlayer2?: number;
    scorePlayer3?: number;
    scorePlayer4?: number;
    message?: string;
    winner?: number;
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
        player3Pos: 80,
        player4Pos: 80,
        scorePlayer1: 0,
        scorePlayer2: 0,
        scorePlayer3: 0,
        scorePlayer4: 0,
        gameMode: "",

    };
    heartbeatInterval: any = null;
    keys: { [key: string]: boolean } = {};
    playerId: number = 1;
    player2Id: number = 2;
    player3Id: number = 3;
    player4Id: number = 4;
    paddlePosition: number = 80;
    
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
                        scorePlayer2: message.state.scorePlayer2 || 0,
                        scorePlayer3: message.state.scorePlayer3 || 0,
                        scorePlayer4: message.state.scorePlayer4 || 0,
                        player3Pos: message.state.player3Pos || this.gameState.player3Pos,
                        player4Pos: message.state.player4Pos || this.gameState.player4Pos,
                        gameMode: message.state.gameMode || this.gameState.gameMode
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
        
        let newPosition = this.paddlePosition;
        const paddleSpeed = 4;
        
        if (this.keys['KeyW'] && this.paddlePosition > 0) {
            newPosition = Math.max(0, this.paddlePosition - paddleSpeed);
        }
        if (this.keys['KeyS'] && this.paddlePosition < 160) {
            newPosition = Math.min(160, this.paddlePosition + paddleSpeed);
        }        
        
        if (newPosition !== this.paddlePosition) {
            this.paddlePosition = newPosition;
            this.sendPlayerMove(newPosition);
        }
    }

    sendPlayerMove(position: number): void {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                type: 'move',
                position: position
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
        const leftPaddleY = this.playerId === 1 ? this.paddlePosition : player1Pos;
        this.ctx.fillRect(0, leftPaddleY, 10, 40);
        
        // Right paddle (player 2)
        const rightPaddleY = this.playerId === 2 ? this.paddlePosition : player2Pos;
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
type AppPage = 'landing' | 'login' | 'game' | 'gameSelect';

// Initialize from SSR if available, otherwise use defaults
let currentPage: AppPage = (window.__CURRENT_PAGE__ as AppPage) || 'landing';
let pongGame: PongGame | null = null;
let currentUsername: string = window.__USERNAME__ || '';

// Add a global variable to store the current game mode
let currentGameMode: string = '1v1'; // Add this line after line 465

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
            <button id="playBtn" class="btn btn-play" style="font-weight: bold; margin: 8px 0; font-size: 2em; background: #4ade80; color: #222;">Play</button>
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
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            history.pushState({ page: 'gameSelect' }, '', '#gameSelect');
            currentPage = 'gameSelect';
            renderApp();
        });
    }
}

function renderGameSelectPage() {
    const root = document.getElementById('app-root');
    if (!root) return;
    root.innerHTML = `
        <div class="game-select-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
            <h2 class="select-title" style="font-weight: bold; text-align: center; font-size: 3em; margin-bottom: 1em;">Choose Game Mode</h2>
            <div class="game-mode-options" style="display: flex; flex-direction: column; gap: 1em;">
                <button id="1v1Btn" class="btn btn-game-mode" style="font-weight: bold; padding: 1em 2em; font-size: 2em; background: #4ade80; color: #222; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s;">1v1 Match</button>
                <button id="4PlayerBtn" class="btn btn-game-mode" style="font-weight: bold; padding: 1em 2em; font-size: 2em; background: #4ade80; color: #222; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s;">4 Player Match</button>
            </div>
            <button id="backToLandingBtn" class="btn btn-back" style="margin-top: 2em; font-size: 1.2em; background: #6b7280; color: white; border: none; border-radius: 8px; padding: 0.5em 1.5em; cursor: pointer;">Back</button>
        </div>
    `;
    
    const oneVsOneBtn = document.getElementById('1v1Btn');
    if (oneVsOneBtn) {
        oneVsOneBtn.addEventListener('click', () => {
            currentUsername = currentUsername || 'Player 1';
            currentGameMode = '1v1'; // Store the game mode
            history.pushState({ page: 'game', mode: '1v1' }, '', '#game');
            currentPage = 'game';
            renderApp();
        });
    }
    
    const fourPlayerBtn = document.getElementById('4PlayerBtn');
    if (fourPlayerBtn) {
        fourPlayerBtn.addEventListener('click', () => {
            currentUsername = currentUsername || 'Player 1';
            currentGameMode = '4player'; // Store the game mode
            history.pushState({ page: 'game', mode: '4player' }, '', '#game');
            currentPage = 'game';
            renderApp();
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
            <button id="backToLandingBtn" class="btn btn-back" style="margin-top: 2em; font-size: 1.2em; background: #6b7280; color: white; border: none; border-radius: 8px; padding: 0.5em 1.5em; cursor: pointer;">Back</button>
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
    if (currentGameMode === "1v1") {
        renderTwoPlayerGame();
    } else if (currentGameMode === "4player") { // Fix the case sensitivity
        renderFourPlayerGame();
    } else {
        console.log("Unrecognized game mode:", currentGameMode);
        // Default to 2-player
        renderTwoPlayerGame();
    }
}

function renderTwoPlayerGame() {
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
    `;
    // Button handlers
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const reconnectBtn = document.getElementById('reconnectBtn');
    if (startBtn) startBtn.addEventListener('click', startGame);
    if (stopBtn) stopBtn.addEventListener('click', stopGame);
    if (reconnectBtn) reconnectBtn.addEventListener('click', reconnectWS);

    // Initialize game logic
    if (!pongGame) {
        pongGame = new PongGame();
        pongGame.init();
    }
}

function renderFourPlayerGame() {
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
        </div>
        <div class="player-info">
            <div class="player-names">
                <span id="player1Name" class="player1-name">${currentUsername || 'Player 1'}</span>
                <span class="vs-text">vs</span> 
                <span id="player2Name" class="player2-name">Player 2</span>
                <span class="vs-text">vs</span> 
                <span id="player3Name" class="player3-name">Player 3</span>
                <span class="vs-text">vs</span> 
                <span id="player4Name" class="player4-name">Player 4</span>
            </div>
            <div class="score-container">
                <span id="player1score" class="player1score">0</span> 
                <span class="score-separator">-</span> 
                <span id="player2score" class="player2score">0</span>
                <span class="score-separator">-</span> 
                <span id="player3score" class="player3score">0</span>
                <span class="score-separator">-</span> 
                <span id="player4score" class="player4score">0</span>
            </div>
        </div>
        <canvas id="gameScreen" width="400" height="400"></canvas>
        <div class="controls-info">
            <p>Player 1 - Up/Down W/S</p>
            <p>Player 2 - Up/Down O/L</p>
        </div>
    `;
    // Button handlers
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const reconnectBtn = document.getElementById('reconnectBtn');
    if (startBtn) startBtn.addEventListener('click', startGame);
    if (stopBtn) stopBtn.addEventListener('click', stopGame);
    if (reconnectBtn) reconnectBtn.addEventListener('click', reconnectWS);

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
    } else if (currentPage === 'gameSelect') {
        renderGameSelectPage();
    } else {
        renderGamePage();
    }
}

// Handle browser navigation (back/forward)
window.addEventListener('popstate', (event) => {
    if (location.hash === '#game') {
        currentPage = 'game';
        renderApp();
    } else if (location.hash === '#login') {
        currentPage = 'login';
        renderApp();
    } else if (location.hash === '#gameSelect') {
        currentPage = 'gameSelect';
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
    
    if (window.__INITIAL_STATE__) {
        currentPage = (window.__CURRENT_PAGE__ as AppPage) || 'landing';
        currentUsername = window.__USERNAME__ || '';
    } else {
        console.log('⚠️ No SSR data found, using URL-based routing');
        
        if (location.hash === '#game') {
            currentPage = 'game';
        } else if (location.hash === '#login') {
            currentPage = 'login';
        } else if (location.hash === '#gameSelect') {
            currentPage = 'gameSelect';
        } else {
            currentPage = 'landing';
        }
    }
    
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