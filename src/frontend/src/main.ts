import './styles.css';
import { toggleTournaments, currentMatchPlayers } from './tournament';
import renderRegisterPage from './pages/register';
import renderLoginPage from './pages/login';

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
    game?: PongGame; // For testing 4-player mode
  }
}

// Enhanced Type definitions for 4-player support
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
    // 4-player specific fields
    mode?: string;
    playerPositions?: number[];
    scores?: number[];
    lastContact?: number;
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
    winnerName?: string;
    mode?: string;
    scores?: number[];
    playerPositions?: number[];
    finalScores?: number[];
}

// ---------------- Username helpers ----------------
// let curUsername: string = window.__USERNAME__ || '';

// function getDisplayNameForPlayer(side: 'left' | 'right'): string {
//     if (side === 'left') return currentMatchPlayers.left || curUsername || 'Player 1';
//     return currentMatchPlayers.right || 'Player 2';
// }

// function updateScoreboardNames(): void {
//     const p1 = document.getElementById('player1Name');
//     const p2 = document.getElementById('player2Name');
//     if (p1) p1.textContent = getDisplayNameForPlayer('left');
//     if (p2) p2.textContent = getDisplayNameForPlayer('right');
// }

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
        mode: "1v1",
        playerPositions: [180, 80, 180, 80],
        scores: [0, 0, 0, 0],
        lastContact: 0
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

        this.paddlePosition = 180; // Center position for 400px height
        
        // Initialize with SSR injected game state if available
        if (window.__GAME_STATE__) {
            this.gameState = { ...this.gameState, ...window.__GAME_STATE__ };
            console.log('🔍 Initialized with SSR game state:', this.gameState);
        }
        
        // Use SSR injected game ID if available
        if (window.__GAME_ID__) {
            this.gameId = window.__GAME_ID__;
            console.log('🎮 Using SSR game ID:', this.gameId);
        }
    }

    async init(): Promise<void> {
        this.canvas = document.getElementById("gameScreen") as HTMLCanvasElement;
        this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
        // this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D; MAYBE

        if (!this.canvas || !this.ctx) return;
        
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
            // Get selected game mode from UI or use the global currentGameMode
            const modeSelector = document.getElementById('gameModeSelect') as HTMLSelectElement;
            const selectedMode = modeSelector ? modeSelector.value : currentGameMode;
            
            // Use SSR endpoint if available, otherwise default
            const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
            const response = await fetch(`${apiEndpoint}/api/game/new`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ 
                    mode: selectedMode, 
                    difficulty: "normal" 
                }),
            });

            const data = await response.json();
            if (data.success && data.data && data.data.id) {
                this.gameId = data.data.id;
                console.log(`🎮 Created new ${selectedMode} game:`, this.gameId);
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
                    // Handle parsing error
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

    // Enhanced WebSocket message handler for 4-player
    handleWebSocketMessage(message: WebSocketMessage): void {
        switch (message.type) {
            case 'connected':
                console.log('🔗 WebSocket connection confirmed');
                break;
                
            case 'gameState':
                if (message.state) {
                    this.gameState = {
                        ballPosX: message.state.ballPosX || this.gameState.ballPosX,
                        ballPosY: message.state.ballPosY || this.gameState.ballPosY,
                        player1Pos: message.state.player1Pos || this.gameState.player1Pos,
                        player2Pos: message.state.player2Pos || this.gameState.player2Pos,
                        player3Pos: message.state.player3Pos || this.gameState.player3Pos,
                        player4Pos: message.state.player4Pos || this.gameState.player4Pos,
                        scorePlayer1: message.state.scorePlayer1 || 0,
                        scorePlayer2: message.state.scorePlayer2 || 0,
                        scorePlayer3: message.state.scorePlayer3 || 0,
                        scorePlayer4: message.state.scorePlayer4 || 0,
                        gameMode: message.state.gameMode || this.gameState.gameMode,
                        // 4-player specific fields
                        mode: message.mode || message.state.mode || this.gameState.mode,
                        playerPositions: message.state.playerPositions || this.gameState.playerPositions,
                        scores: message.state.scores || this.gameState.scores,
                        lastContact: message.state.lastContact || this.gameState.lastContact
                    };
                    
                    this.updateScoreDisplay();
                }
                break;
                
            case 'ballReset':
                console.log('🏀 Ball reset:', message.message);
                break;
                
            case 'score':
                if (message.mode === '4player' && message.scores) {
                    this.gameState.scores = message.scores;
                    // Map to 2-player compatibility
                    this.gameState.scorePlayer1 = message.scores[3] || 0; // Left player
                    this.gameState.scorePlayer2 = message.scores[1] || 0; // Right player
                    this.gameState.scorePlayer3 = message.scores[0] || 0; // Top player
                    this.gameState.scorePlayer4 = message.scores[2] || 0; // Bottom player
                } else {
                    this.gameState.scorePlayer1 = message.scorePlayer1 || 0;
                    this.gameState.scorePlayer2 = message.scorePlayer2 || 0;
                    this.gameState.scorePlayer3 = message.scorePlayer3 || 0;
                    this.gameState.scorePlayer4 = message.scorePlayer4 || 0;
                }
                this.updateScoreDisplay();
                break;
                
            case 'gameStop':
                this.isActive = false;
                this.updateStatus("Game stopped");
                break;
                
            case 'gameEnd':
                if (message.mode === '4player') {
                    this.updateStatus(`Game Over! ${message.winnerName} wins!`);
                    console.log(`🏆 4-Player Game Over! Winner: ${message.winnerName}`, message.finalScores);
                } else {
                    this.updateStatus(`Game Over! Player ${message.winner} wins!`);
                    console.log(`🏆 Game Over! Winner: Player ${message.winner}`);
                }
                this.isActive = false;
                break;
                
            default:
                console.log("Unknown WebSocket message:", message);
        }
    }

    // Enhanced score display for 4-player
    updateScoreDisplay(): void {
        const is4Player = this.gameState.mode === '4player' || currentGameMode === '4player';
        
        if (is4Player && this.gameState.scores) {
            // Update all 4 player scores for 4-player mode
            const player1Score = document.getElementById("player1score");
            const player2Score = document.getElementById("player2score");
            const player3Score = document.getElementById("player3score");
            const player4Score = document.getElementById("player4score");
            
            if (player1Score) player1Score.textContent = this.gameState.scores[3]?.toString() || "0"; // Left
            if (player2Score) player2Score.textContent = this.gameState.scores[1]?.toString() || "0"; // Right
            if (player3Score) player3Score.textContent = this.gameState.scores[0]?.toString() || "0"; // Top
            if (player4Score) player4Score.textContent = this.gameState.scores[2]?.toString() || "0"; // Bottom
            
            console.log(`🏆 4P Scores - Top:${this.gameState.scores[0]} Right:${this.gameState.scores[1]} Bottom:${this.gameState.scores[2]} Left:${this.gameState.scores[3]}`);
        } else {
            // Standard 2-player score display
            const player1score = document.getElementById('player1score');
            const player2score = document.getElementById('player2score');
            
            if (player1score) player1score.textContent = this.gameState.scorePlayer1.toString();
            if (player2score) player2score.textContent = this.gameState.scorePlayer2.toString();
        }
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
        let newPosition = this.paddlePosition;
        const paddleSpeed = 4;
        
        // Determine if we're in 4-player mode
        const is4Player = this.gameState.mode === '4player' || currentGameMode === '4player';
        
        if (is4Player) {
            // 4-Player mode: You're Player 1 (left paddle) - vertical movement
            // Canvas is 400x400, so paddle can move from 0 to (400 - paddleHeight)
            const maxPos = 400 - 40 - 10; // canvas height - paddle height - margin = 350
            const minPos = 10; // Small margin from top
            
            if (this.keys['KeyW'] && newPosition > minPos) {
                newPosition = Math.max(minPos, newPosition - paddleSpeed);
            }
            if (this.keys['KeyS'] && newPosition < maxPos) {
                newPosition = Math.min(maxPos, newPosition + paddleSpeed);
            }
        } else {
            // 2-Player mode: Canvas is 400x200, paddle moves 0-160
            if (this.keys['KeyW'] && newPosition > 0) {
                newPosition = Math.max(0, newPosition - paddleSpeed);
            }
            if (this.keys['KeyS'] && newPosition < 160) {
                newPosition = Math.min(160, newPosition + paddleSpeed);
            }
        }
            
        if (newPosition !== this.paddlePosition) {
            this.paddlePosition = newPosition;
            this.sendPlayerMove(newPosition);
        }
    }

    handle2PlayerInput(currentPosition: number, paddleSpeed: number): void {
        let newPosition = currentPosition;
        
        // Standard 2-player controls (W/S for movement)
        if (this.keys['KeyW'] && currentPosition > 0) {
            newPosition = Math.max(0, currentPosition - paddleSpeed);
        }
        if (this.keys['KeyS'] && currentPosition < 160) {
            newPosition = Math.min(160, currentPosition + paddleSpeed);
        }
            
        if (newPosition !== this.paddlePosition) {
            this.paddlePosition = newPosition;
            this.sendPlayerMove(newPosition);
        }
    }

    handle4PlayerInput(currentPosition: number, paddleSpeed: number): void {
        let newPosition = currentPosition;
        
        // if (this.playerId === 1 || this.playerId === 3) {
        //     // Top/Bottom players move horizontally with A/D
        //     const maxPos = this.canvas ? this.canvas.width - 50 : 350;
        //     const minPos = 10;
            
        //     if (this.keys['KeyA'] && currentPosition > minPos) {
        //         newPosition = Math.max(minPos, currentPosition - paddleSpeed);
        //     }
        //     if (this.keys['KeyD'] && currentPosition < maxPos) {
        //         newPosition = Math.min(maxPos, currentPosition + paddleSpeed);
        //     }
        // } else {
            // Left/Right players move vertically with W/S  
            const maxPos = this.canvas ? this.canvas.height - 50 : 150;
            const minPos = 10;
            
            if (this.keys['KeyW'] && currentPosition > minPos) {
                newPosition = Math.max(minPos, currentPosition - paddleSpeed);
            }
            if (this.keys['KeyS'] && currentPosition < maxPos) {
                newPosition = Math.min(maxPos, currentPosition + paddleSpeed);
            }
        // }
            
        if (newPosition !== this.paddlePosition) {
            this.paddlePosition = newPosition;
            this.sendPlayerMove(newPosition);
        }
    }

    // Enhanced sendPlayerMove to include player ID
    sendPlayerMove(position: number): void {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                type: 'move',
                playerId: 1, // Always Player 1
                position: position,
                timestamp: Date.now()
            }));
        }
    }

    // Enhanced render method with 4-player support
    render(): void {
        if (!this.ctx || !this.canvas) return;

        // Use gameState with fallback values
        const ballPosX = this.gameState.ballPosX || 200;
        const ballPosY = this.gameState.ballPosY || 100;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Determine game mode from WebSocket messages or global variable
        const is4Player = this.gameState.mode === '4player' || currentGameMode === '4player';

        if (is4Player) {
            this.render4Player(ballPosX, ballPosY);
        } else {
            this.render2Player(ballPosX, ballPosY);
        }

        // Draw ball (same for both modes)
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

    render2Player(ballPosX: number, ballPosY: number): void {
        if (!this.ctx || !this.canvas) return;

        const player1Pos = this.gameState.player1Pos || 80;
        const player2Pos = this.gameState.player2Pos || 80;

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
        
        // Left paddle (YOU - Player 1) - use your input position
        this.ctx.fillRect(0, this.paddlePosition, 10, 40);
        
        // Right paddle (Player 2) - use server position
        this.ctx.fillRect(this.canvas.width - 10, player2Pos, 10, 40);
    }

    render4Player(ballPosX: number, ballPosY: number): void {
        if (!this.ctx || !this.canvas) return;

        // Get all 4 player positions from gameState
        const playerPositions = this.gameState.playerPositions || [180, 180, 180, 180]; // Default to center positions
        
        this.ctx.fillStyle = "grey";

        // Draw Top paddle (Player 1) - horizontal
        const topPaddleX = playerPositions[0] || 180;
        this.ctx.fillRect(topPaddleX, 0, 40, 10);

        // Draw Right paddle (Player 2) - vertical  
        const rightPaddleY = playerPositions[1] || 180;
        this.ctx.fillRect(this.canvas.width - 10, rightPaddleY, 10, 40);

        // Draw Bottom paddle (Player 3) - horizontal
        const bottomPaddleX = playerPositions[2] || 180;
        this.ctx.fillRect(bottomPaddleX, this.canvas.height - 10, 40, 10);

        // Draw Left paddle (Player 4 - YOU) - vertical - this is controlled by your input
        const leftPaddleY = this.paddlePosition; // Use your input position
        this.ctx.fillRect(0, leftPaddleY, 10, 40);

        // Draw center cross lines for 4-player
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        this.ctx.setLineDash([3, 10]);
        
        // Vertical center line
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width / 2, 0);
        this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
        this.ctx.stroke();
        
        // Horizontal center line  
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.canvas.height / 2);
        this.ctx.lineTo(this.canvas.width, this.canvas.height / 2);
        this.ctx.stroke();
        
        this.ctx.setLineDash([]);
    }

    setupKeyboardControls(): void {
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        
        document.addEventListener('keydown', (e) => {
            const gameKeys = ['KeyW', 'KeyS'];
            if (gameKeys.includes(e.code)) {
                e.preventDefault();
            }
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
        const player3Name = document.getElementById('player3Name');
        const player4Name = document.getElementById('player4Name');
        const username = window.__USERNAME__ || currentUsername || "Player 1";
        if (player1Name) player1Name.textContent = username;
        if (player2Name) player2Name.textContent = "Marvin";
        if (player3Name) player3Name.textContent = "Ben";
        if (player4Name) player4Name.textContent = "Jerry";
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
type AppPage = 'landing' | 'login' | 'game' | 'gameSelect' | 'register';

// Initialize from SSR if available, otherwise use defaults
let currentPage: AppPage = (window.__CURRENT_PAGE__ as AppPage) || 'landing';
let pongGame: PongGame | null = null;
let currentUsername: string = window.__USERNAME__ || '';

// Global variable to store the current game mode
let currentGameMode: string = '1v1';

// Log SSR initialization
if (window.__INITIAL_STATE__) {
    console.log('🔍 SSR: Initialized with server data:', window.__INITIAL_STATE__);
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
            history.pushState({ page: 'login' }, '', '/login');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
    }
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            history.pushState({ page: 'register' }, '', '/register');
            currentPage = 'register';
            renderApp();
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
            currentGameMode = '1v1';
            history.pushState({ page: 'game', mode: '1v1' }, '', '#game');
            currentPage = 'game';
            renderApp();
        });
    }
    
    const fourPlayerBtn = document.getElementById('4PlayerBtn');
    if (fourPlayerBtn) {
        fourPlayerBtn.addEventListener('click', () => {
            currentUsername = currentUsername || 'Player 1';
            currentGameMode = '4player';
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



function renderGamePage() {
    if (currentGameMode === "1v1") {
        renderTwoPlayerGame();
    } else if (currentGameMode === "4player") {
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
        <h1 class="main-title">ft_transcendence - Pong 2-Player</h1>
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
                <span id="player1score" class="player1-score">0</span> 
                <span class="score-separator">-</span> 
                <span id="player2score" class="player2-score">0</span>
            </div>
        </div>
        <canvas id="gameScreen" width="400" height="200"></canvas>
        <div class="controls-info">
            <p>Player 1 - Up/Down W/S</p>
        </div>
        <hr>
        <div id="tournamentRoot" class="t-section"></div>
    `;
    
    setupGameButtons();
    initializeGame();
}

function renderFourPlayerGame() {
    const root = document.getElementById('app-root');
    if (!root) return;
    root.innerHTML = `
        <h1 class="main-title">ft_transcendence - Pong 4-Player Battle</h1>
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
        
        <!-- 4-Player Layout -->
        <div class="player-info">
                <span id="player1Name" class="player1-name">${currentUsername || 'Player 1'}</span>
                <span class="vs-text">vs</span> 
                <span id="player2Name" class="player2-name">Player 2</span>
                <span class="vs-text">vs</span> 
                <span id="player3Name" class="player3-name">Player 3</span>
                <span class="vs-text">vs</span> 
                <span id="player4Name" class="player4-name">Player 4</span>
            </div>
            <div class="score-container">
                <span id="player1score" class="player1-score">0</span> 
                <span class="score-separator">-</span> 
                <span id="player2score"" class="player2-score">0</span>
                <span class="score-separator">-</span> 
                <span id="player3score"" class="player3-score">0</span>
                <span class="score-separator">-</span> 
                <span id="player4score"" class="player4-score">0</span>
            </div>
        
        <canvas id="gameScreen" width="400" height="400"></canvas>
        
        <div class="controls-info" style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 5px; margin-top: 15px;">
            <div class="four-player-controls">
                <p style="color: #ffaa00; font-style: italic; text-align: center; margin-top: 10px;">Last player to touch ball gets point when opponent misses!</p>
            </div>
        </div>
        <hr>
        <div id="tournamentRoot" class="t-section"></div>
    `;
    
    setupGameButtons();
    initializeGame();
}

function setupGameButtons() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const reconnectBtn = document.getElementById('reconnectBtn');
    const tournamentsBtn = document.getElementById('tournamentsBtn');
    
    if (startBtn) startBtn.addEventListener('click', startGame);
    if (stopBtn) stopBtn.addEventListener('click', stopGame);
    if (reconnectBtn) reconnectBtn.addEventListener('click', reconnectWS);
    if (tournamentsBtn) tournamentsBtn.addEventListener('click', toggleTournaments);
}

function initializeGame() {
    // Reset previous game instance
    if (pongGame) {
        pongGame.stopGame();
        pongGame = null;
    }
    
    // Create new game instance
    pongGame = new PongGame();
    pongGame.init();
}

function renderApp() {
    switch (currentPage) {
        case 'landing':
            renderLandingPage();
            break;
        case 'login':
            renderLoginPage();
            break;
        case 'gameSelect':
            renderGameSelectPage();
            break;
        case 'register':
            renderRegisterPage();
            break;
        default:
            renderGamePage();
    }
}

// Handle browser navigation (back/forward)
window.addEventListener('popstate', () => {
    switch (location.pathname) {
        case '/register':
            currentPage = 'register';
            break;
        case '/login':
            currentPage = 'login';
            break;
        case '/gameSelect':
            currentPage = 'gameSelect';
            break;
        case '/game':
            currentPage = 'game';
            break;
        case '/':
            currentPage = 'landing';
            break;
        default:
            currentPage = 'landing';
    }
    renderApp();
});

// Enhanced SPA entry with SSR support
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 App starting with SSR support...');
    
    if (window.__INITIAL_STATE__) {
        currentPage = (window.__CURRENT_PAGE__ as AppPage) || 'landing';
        currentUsername = window.__USERNAME__ || '';
    } else {
        console.log('⚠️ No SSR data found, using URL-based routing');
        
        if (location.pathname === '/register') {
            currentPage = 'register';
        } else if (location.pathname === '/game') {
            currentPage = 'game';
        } else if (location.pathname === '/login') {
            currentPage = 'login';
        } else if (location.pathname === '/gameSelect') {
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