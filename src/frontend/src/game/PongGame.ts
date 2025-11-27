import { GameState, WebSocketMessage, Player } from '../types';
import { getCurrentGameMode } from '../utils/globalState';
import { getCurrentRoom } from '../utils/roomState';
import { authService } from '../utils/auth';
import { baby3D } from './game3D';
import { RoomWebSocketManager } from '../utils/roomWebSocket';

export class PongGame {
    gameId?: number = 0;
    canvas: HTMLCanvasElement | null = null;
    ctx: CanvasRenderingContext2D | null = null;
    babylonGame?: baby3D;
    websocket: WebSocket | null = null;
    isActive: boolean = false;
    fpsStartTime: number = performance.now();
    frameCount: number = 0;
    lastPingTime: number = 0;
    players: Player[] = [];

    gameState: GameState = {
        gameId: this.gameId!,
        players: [],
		ballPosX: 200,
        ballPosY: getCurrentGameMode() === '4P' ? 200 : 100,
        mode: getCurrentGameMode(),
        lastContact: 0,
    };
    heartbeatInterval: any = null;
    keys: { [key: string]: boolean } = {};
    playerId: number = 1;
    paddlePosition: number = this.gameState.mode === '4P' ? 160 : 70;
    onGameEnd?: (winnerId: number) => Promise<void>;
    roomWS: RoomWebSocketManager | null = null;
    currentGameState: any = null;
    private renderLoopRunning: boolean = false;
    private animationFrameId: number | null = null;
    private stateListeners: Array<(state: GameState, game: PongGame) => void> = [];
    hasLocal: boolean = false;
    isGuest: boolean = false;

    private interpolatedState = {
        ballPosX: 200,
        ballPosY: getCurrentGameMode() === '4P' ? 200 : 100,
    };
    private lerpFactor = 1;
    
    constructor() {
        this.setupKeyboardControls();
        const uiMode = getCurrentGameMode();
        if (uiMode) this.gameState.mode = uiMode as any;
        this.initializeModelFromGameState();

        if (window.__GAME_STATE__) {
            this.gameState = { ...this.gameState, ...window.__GAME_STATE__ };
            this.initializeModelFromGameState();
            console.log('Initialized with SSR game state:', this.gameState);
            this.notifyStateListeners();
        }

        if (window.__GAME_ID__) {
            this.gameId = window.__GAME_ID__;
            console.log('Using SSR game ID:', this.gameId);
        }
    }

    /** Ensure local players mirror gameState */
    private initializeModelFromGameState() {
        const existingPlayersLen = this.gameState.players?.length ?? 0;
        const desiredCount = existingPlayersLen > 0
            ? existingPlayersLen
            : (this.gameState.mode === '4P' ? 4 : 2);

        if (!this.gameState.players) this.gameState.players = [] as any;
        for (let i = this.gameState.players.length; i < desiredCount; i++) {
            let defaultPos = this.gameState.mode === '4P' ? 160 : 70;
            this.gameState.players.push({
                id: i + 1,
                gameId: this.gameId,
                pos: defaultPos,
                score: 0,
                connectionStatus: '',
                lastActivity: ''
            } as any);
        }

        this.players = this.gameState.players;
    }

    addPlayer(initialPos?: number): Player {
        const idx = this.gameState.players?.length ?? 0;
        const paddlePos = initialPos !== undefined ? initialPos : (this.gameState.mode === '4P' ? 160 : 70);
        if (!this.gameState.players) this.gameState.players = [] as any;

        const newPlayer: Player = {
            id: idx + 1,
            gameId: this.gameId,
            pos: paddlePos,
            score: 0,
            connectionStatus: '',
            lastActivity: ''
        } as any;
        this.gameState.players.push(newPlayer);

        this.players = this.gameState.players;
        this.notifyStateListeners();
        return newPlayer;
    }

    /** Ensure at least n players exist; added players start with default positions */
    ensurePlayerCount(n: number): void {
        for (let i = this.gameState.players.length; i < n; i++) {
            this.addPlayer();
        }
    }

    /** Register a callback to be invoked whenever gameState mutates */
    addStateListener(cb: (state: GameState, game: PongGame) => void): void {
        this.stateListeners.push(cb);
    }

    removeStateListener(cb: (state: GameState, game: PongGame) => void): void {
        this.stateListeners = this.stateListeners.filter(l => l !== cb);
    }

    public notifyStateListeners(): void {
        for (const l of this.stateListeners) {
            try { l(this.gameState, this); } catch (e) { /* swallow listener errors */ }
        }
    }

    async init() {
        console.log('🎮 [PONGGAME] Initializing PongGame...');
        
        this.canvas = document.getElementById('gameScreen') as HTMLCanvasElement;
        this.ctx = this.canvas?.getContext('2d');
        
        this.paddlePosition = (this.gameState.mode === '4P') ? 160 : 70;
        
        this.updateStatus("Ready to start...");
        
        const currentUser = await authService.getCurrentUser();
        if (currentUser && currentUser.id)
            this.playerId = parseInt(currentUser.id);
        
        try {
            const room = getCurrentRoom();
            
            // If gameId was already set externally (from gamePage), use it
            if (this.gameId) {
                console.log(`✅ [PONGGAME] Using pre-set game ID: ${this.gameId}`);
            }
            // If there's a room with a gameId, use it
            if (room && room.gameId) {
                this.gameId = room.gameId;
                console.log(`✅ [PONGGAME] Using room's shared game ID: ${this.gameId}`);
            }
            // Create a new game if there's NO room AND no gameId set
            else if (!room) {
                console.log(`🆕 [PONGGAME] No room found - creating standalone game`);
                await this.createGame();
                console.log(`✅ [PONGGAME] Created new standalone game ID: ${this.gameId}`);
            }
            // Room exists but no gameId yet - wait for host to start
            else {
                console.warn(`⏳ [PONGGAME] Room exists but no gameId - game not started yet`);
                this.updateStatus("Waiting for host to start game...");
                return; // Don't initialize yet
            }
            
            if (this.gameId) {
                await this.connectWebSocket();
                this.updateStatus("Connected - Click Start to begin");
                
                await this.init3DGame();
                
                this.startRenderLoop();
            } else {
                throw new Error("Failed to establish game ID");
            }
        } catch (error) {
            console.error("❌ [PONGGAME] Initialization error:", error);
            this.updateStatus(`Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async init3DGame() {
        console.log('🎨 [PONGGAME] Initializing 3D renderer...');
        
        try {
            // Make sure DOM is ready
            await new Promise<void>(resolve => {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => resolve());
                } else {
                    resolve();
                }
            });
            
            // Add a small delay to ensure everything is settled
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check if BabylonJS game exists
            if (!this.babylonGame) {
                console.warn('⚠️ [PONGGAME] BabylonGame not initialized, skipping 3D');
                return;
            }
            
            // Create the scene
            console.log('🎨 [PONGGAME] Creating BabylonJS scene...');
            await this.babylonGame.createScene();
            console.log('✅ [PONGGAME] 3D scene created successfully');
            
        } catch (error) {
            console.error('❌ [PONGGAME] Failed to initialize 3D game:', error);
            console.warn('⚠️ [PONGGAME] Falling back to 2D-only mode');
            // Don't throw - just continue without 3D
            // The 2D canvas will still work
        }
    }

    async createGame(): Promise<void> {
        try {
            const modeSelector = document.getElementById('gameModeSelect') as HTMLSelectElement;
            const selectedMode = modeSelector ? modeSelector.value : getCurrentGameMode();
            
            const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
            const response = await fetch(`${apiEndpoint}/api/game/new`, {
                method: "POST",
                credentials: 'include',
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
                console.log(`Created new ${selectedMode} game:`, this.gameId);
            } else {
                throw new Error(data.message || "Failed to create game");
            }
        } catch (error) {
            throw error;
        }
    }

    async connectWebSocket(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsEndpoint = window.__INITIAL_STATE__?.wsEndpoint || `${protocol}://${window.location.hostname}:3000`;
            const wsUrl = `${wsEndpoint}/game/${this.gameId}/ws`;
            
            console.log('Connecting to WebSocket:', wsUrl);
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = () => {
                console.log('WebSocket connected');
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
            
            this.websocket.onclose = () => {
                console.log('WebSocket disconnected');
                this.updateWSStatus("Disconnected", false);
                this.isActive = false;
                
                setTimeout(() => {
                    if (this.gameId && (!this.websocket || this.websocket.readyState === WebSocket.CLOSED)) {
                        console.log('Attempting WebSocket reconnection...');
                        this.connectWebSocket();
                    }
                }, 3000);
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateWSStatus("Error", false);
                reject(error);
            };
            
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
                console.log('WebSocket connection confirmed');
                break;
                
            case 'gameState':
                if (message.state) {
                    const s = message.state as any;

                    this.gameState.ballPosX = s.ballPosX === undefined ? 200 : s.ballPosX;
                    this.gameState.ballPosY = s.ballPosY === undefined ? this.gameState.mode === '4P' ? 200 : 100 : s.ballPosY;
                    this.gameState.lastContact = s.lastContact === undefined ? 0 : s.lastContact;

                    if (Array.isArray(s.players)) {
                        if (!this.gameState.players) this.gameState.players = [] as any;
                        const len = this.gameState.mode === '4P' ? 4 : 2;
                        for (let i = 0; i < len; i++) {
                            const incoming = s.players[i];
                            if (!this.gameState.players[i]) {
                                this.gameState.players[i] = {
                                    id: i + 1,
                                    gameId: this.gameId,
                                    pos: (this.gameState.mode === '4P' ? 160 : 70),
                                    score: 0,
                                    connectionStatus: '',
                                    lastActivity: ''
                                } as any;
                            }
                            if (incoming) {
                                if (incoming.pos !== undefined) this.gameState.players[i].pos = incoming.pos;
                                if (incoming.score !== undefined) this.gameState.players[i].score = incoming.score;
                            }
                        }
                    }

                    this.updateScoreDisplay();
                    this.notifyStateListeners();
                }
                break;
                
            case 'ballReset':
                console.log('Ball reset:', message.message);
                break;
                
            case 'score':
                if ((message as any).mode) {
                    this.gameState.mode = (message as any).mode as any;
                }
                if (Array.isArray(message.players)) {
                    const len = Math.min(this.gameState.players.length, message.players.length);
                    for (let i = 0; i < len; i++) {
                        const s = message.players[i]?.score ?? 0;
                        if (this.gameState.players[i]) this.gameState.players[i].score = s;
                    }
                }
                this.updateScoreDisplay();
                this.notifyStateListeners();
                break;
                
            case 'gameStop':
                this.isActive = false;
                this.updateStatus("Game stopped");
                break;

            case 'gameEnd':
            if (Array.isArray(message.finalScores)) {
                message.finalScores.forEach((scoreData: any) => {
                    const playerIndex = scoreData.playerId - 1;
                    if (this.gameState.players[playerIndex]) {
                        this.gameState.players[playerIndex].score = scoreData.score || 0;
                    }
                });
                this.updateScoreDisplay();
            }
            
            if (message.mode === '4P') {
                this.updateStatus(`Game Over! ${message.winnerName ?? 'Player ?'} wins!`);
                console.log(`4-Player Game Over! Winner: ${message.winnerName}`);
                
                // Trigger callback for 4-player mode
                if (this.onGameEnd) {
                    const winnerId = message.winner || 1;
                    this.onGameEnd(winnerId);
                }
            } else {
                this.updateStatus(`Game Over! ${message.winner} wins!`);
                console.log(`Game Over! Winner: ${message.winner}`);
                
                if (this.onGameEnd && message.winner !== undefined) {
                    this.onGameEnd(message.winner);
                }
            }
            this.isActive = false;
            break;

            case 'ping':
                console.log("pong");
                break;
            case 'pong':
                break;
                
            default:
                console.log("Unknown WebSocket message:", message);
        }
    }

    updateScoreDisplay(): void {
        const is4Player = this.gameState.mode === '4P' || getCurrentGameMode() === '4P';

        const player1Score = document.getElementById("player1score");
        const player2Score = document.getElementById("player2score");
        const player3Score = document.getElementById("player3score");
        const player4Score = document.getElementById("player4score");

        const uiNodes = [player1Score, player2Score, player3Score, player4Score];
        const max = is4Player ? 4 : 2;
        for (let i = 0; i < max; i++) {
            const node = uiNodes[i];
            const scoreVal = this.gameState.players[i]?.score ?? 0;
            if (node) node.textContent = scoreVal.toString();
        }
    }

    async startServerGame(): Promise<void> {
        try {
            const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
            const response = await fetch(`${apiEndpoint}/api/game/${this.gameId}/start`, {
                method: "POST",
                credentials: 'include',
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    gameId: this.gameId
                })
            });

            const data = await response.json();
            if (data.success) {
                this.isActive = true;
                this.updateStatus("Game running!");
                const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
                const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
                if (startBtn) startBtn.disabled = true;
                if (pauseBtn) pauseBtn.disabled = false;
            } else {
                throw new Error(data.message || "Failed to start game");
            }
        } catch (error) {
            throw error;
        }
    }

    startRenderLoop(): void {
        if (this.renderLoopRunning) return;
        this.renderLoopRunning = true;
        const renderFrame = () => {
            if (!this.renderLoopRunning) return;
            
            this.updateFPS();
            this.animationFrameId = requestAnimationFrame(renderFrame);
        };
        
        this.animationFrameId = requestAnimationFrame(renderFrame);
    }

    stopRenderLoop(): void {
        this.renderLoopRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    sendPlayerMove(position: number): void {
        if (getCurrentRoom()) return;
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            if (this.playerId === undefined) this.playerId = 1;// TODO: why default to 1? // Default to player 1 if unset
            this.websocket.send(JSON.stringify({
                type: 'move',
                playerId: this.playerId,
                position: position,
            }));
        }
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
        // const now = performance.now();
        // this.frameCount++;
        // const elapsed = now - this.fpsStartTime;
        
        // if (elapsed >= 1000) {
        //     const fps = Math.round((this.frameCount * 1000) / elapsed);
        //     const fpsCounter = document.getElementById('fpsCounter');
        //     if (fpsCounter) fpsCounter.textContent = fps.toString();
        //     this.fpsStartTime = now;
        //     this.frameCount = 0;
        // }
    }

    updatePlayerInfo(): void {
        const player2Name = document.getElementById('player2Name');
        const player3Name = document.getElementById('player3Name');
        const player4Name = document.getElementById('player4Name');
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
            element.className = connected ? 'connected' : 'disconnected';
            element.textContent = status;
        }
    }

    async pauseGame(): Promise<void> {
        this.isActive = false;
        this.stopRenderLoop();
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        if (this.gameId) {
            try {
                const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
                await fetch(`${apiEndpoint}/api/game/${this.gameId}/pause`, {
                    method: "POST",
                    credentials: 'include',
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        gameId: this.gameId
                    })
                });
                this.updateStatus("Game paused");
            } catch (error) {
                // Ignore errors
            }
        }

        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
        if (startBtn) startBtn.disabled = false;
        if (pauseBtn) pauseBtn.disabled = true;
    }

    reconnectWebSocket(): void {
        if (this.gameId) {
            if (this.websocket) {
                this.websocket.close();
            }
            this.connectWebSocket();
        }
    }

    async endGame(): Promise<void> {
        this.isActive = false;
        
        this.stopRenderLoop();
        
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }

        if (this.gameId) {
            try {
                const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
                await fetch(`${apiEndpoint}/api/game/${this.gameId}/end`, {
                    method: "POST",
                    credentials: 'include',
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        gameId: this.gameId
                    })
                });
                this.updateStatus("Game ended - Click Start for new game");
            } catch (error) {
                // Ignore errors
            }
            
            this.gameId = undefined;
        }

        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
        if (startBtn) startBtn.disabled = false;
        if (pauseBtn) pauseBtn.disabled = true;
    }

    private parseWinnerIdFromName(winnerName: string): number {
        const match = winnerName.match(/Player (\d+)/);
        return match ? parseInt(match[1]) : 1;
    }
}
