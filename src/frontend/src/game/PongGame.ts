import { GameState, WebSocketMessage } from '../types';
import { getCurrentGameMode, getCurrentUser } from '../utils/globalState';

export class PongGame {
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
    private renderLoopRunning: boolean = false;
    private animationFrameId: number | null = null;
    private shouldReconnect: boolean = true;
    
    constructor() {
        this.setupKeyboardControls();
        
        if (window.__GAME_STATE__) {
            this.gameState = { ...this.gameState, ...window.__GAME_STATE__ };
            console.log('Initialized with SSR game state:', this.gameState);
        }
        
        if (window.__GAME_ID__) {
            this.gameId = window.__GAME_ID__;
            console.log('Using SSR game ID:', this.gameId);
        }
    }

    async init(): Promise<void> {
        this.canvas = document.getElementById("gameScreen") as HTMLCanvasElement;
        this.ctx = this.canvas ? this.canvas.getContext("2d") : null;

        if (!this.canvas || !this.ctx) return;
        
        const is4Player = getCurrentGameMode() === '4player';
        if (is4Player) {
            this.paddlePosition = 180;
        } else {
            this.paddlePosition = 80;
        }
        
        this.updateStatus("Ready to start...");
        
        try {
            if (!this.gameId) {
                await this.createGame();
            }
            
            if (this.gameId) {
                await this.connectWebSocket();
                this.updateStatus("Connected - Click Start to begin");
                this.startRenderLoop();
            }
        } catch (error) {
            this.updateStatus(`Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async createGame(): Promise<void> {
        try {
            const modeSelector = document.getElementById('gameModeSelect') as HTMLSelectElement;
            const selectedMode = modeSelector ? modeSelector.value : getCurrentGameMode();
            
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
            const wsEndpoint = window.__INITIAL_STATE__?.wsEndpoint || 'ws://localhost:3000';
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
                        mode: message.mode || message.state.mode || this.gameState.mode,
                        playerPositions: message.state.playerPositions || this.gameState.playerPositions,
                        scores: message.state.scores || this.gameState.scores,
                        lastContact: message.state.lastContact || this.gameState.lastContact
                    };
                    
                    this.updateScoreDisplay();
                }
                break;
                
            case 'ballReset':
                console.log('Ball reset:', message.message);
                break;
                
            case 'score':
                if (message.mode === '4player' && message.scores) {
                    this.gameState.scores = message.scores;
                    this.gameState.scorePlayer1 = message.scores[3] || 0;
                    this.gameState.scorePlayer2 = message.scores[1] || 0;
                    this.gameState.scorePlayer3 = message.scores[0] || 0;
                    this.gameState.scorePlayer4 = message.scores[2] || 0;
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
                    console.log(`4-Player Game Over! Winner: ${message.winnerName}`, message.finalScores);
                } else {
                    this.updateStatus(`Game Over! Player ${message.winner} wins!`);
                    console.log(`Game Over! Winner: Player ${message.winner}`);
                }
                this.isActive = false;
                break;
                
            default:
                console.log("Unknown WebSocket message:", message);
        }
    }

    updateScoreDisplay(): void {
        const is4Player = this.gameState.mode === '4player' || getCurrentGameMode() === '4player';
        
        if (is4Player && this.gameState.scores) {
            const player1Score = document.getElementById("player1score");
            const player2Score = document.getElementById("player2score");
            const player3Score = document.getElementById("player3score");
            const player4Score = document.getElementById("player4score");
            
            if (player1Score) player1Score.textContent = this.gameState.scores[3]?.toString() || "0";
            if (player2Score) player2Score.textContent = this.gameState.scores[1]?.toString() || "0";
            if (player3Score) player3Score.textContent = this.gameState.scores[0]?.toString() || "0";
            if (player4Score) player4Score.textContent = this.gameState.scores[2]?.toString() || "0";
            
            console.log(`4P Scores - Top:${this.gameState.scores[0]} Right:${this.gameState.scores[1]} Bottom:${this.gameState.scores[2]} Left:${this.gameState.scores[3]}`);
        } else {
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
                const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
                if (startBtn) startBtn.disabled = true;
                if (pauseBtn) pauseBtn.disabled = false;
                this.updatePlayerInfo();
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
            this.handleInput();
            this.render();
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

    handleInput(): void {
        if (!this.isActive) return;
        
        let newPosition = this.paddlePosition;
        const paddleSpeed = 4;
        
        const is4Player = this.gameState.mode === '4player' || getCurrentGameMode() === '4player';
        
        if (is4Player) {
            const maxPos = 400 - 40 - 10;
            const minPos = 10;
            
            if (this.keys['KeyW'] && newPosition > minPos) {
                newPosition = Math.max(minPos, newPosition - paddleSpeed);
            }
            if (this.keys['KeyS'] && newPosition < maxPos) {
                newPosition = Math.min(maxPos, newPosition + paddleSpeed);
            }
        } else {
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

    sendPlayerMove(position: number): void {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                type: 'move',
                playerId: 1,
                position: position,
                timestamp: Date.now()
            }));
        }
    }

    render(): void {
        if (!this.ctx || !this.canvas) return;

        const ballPosX = this.gameState.ballPosX || 200;
        const ballPosY = this.gameState.ballPosY || 100;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const is4Player = this.gameState.mode === '4player' || getCurrentGameMode() === '4player';

        if (is4Player) {
            this.render4Player(ballPosX, ballPosY);
        } else {
            this.render2Player(ballPosX, ballPosY);
        }

        this.ctx.beginPath();
        this.ctx.arc(ballPosX, ballPosY, 10, 0, 2 * Math.PI);
        this.ctx.fillStyle = "white";
        this.ctx.fill();

        this.ctx.font = "12px Arial";
        this.ctx.fillStyle = "white";
        this.ctx.textAlign = "center";
        this.ctx.fillText(`Game ${this.gameId}`, this.canvas.width / 2, 15);
    }

    render2Player(ballPosX: number, ballPosY: number): void {
        if (!this.ctx || !this.canvas) return;

        const player1Pos = this.gameState.player1Pos || 80;
        const player2Pos = this.gameState.player2Pos || 80;

        this.ctx.strokeStyle = "white";
        this.ctx.setLineDash([5, 15]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width / 2, 0);
        this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        this.ctx.fillStyle = "grey";
        this.ctx.fillRect(0, this.paddlePosition, 10, 40);
        this.ctx.fillRect(this.canvas.width - 10, player2Pos, 10, 40);
    }

    render4Player(ballPosX: number, ballPosY: number): void {
        if (!this.ctx || !this.canvas) return;

        const playerPositions = this.gameState.playerPositions || [180, 180, 180, 180];
        
        this.ctx.fillStyle = "grey";

        const topPaddleX = playerPositions[0] || 180;
        this.ctx.fillRect(topPaddleX, 0, 40, 10);

        const rightPaddleY = playerPositions[1] || 180;
        this.ctx.fillRect(this.canvas.width - 10, rightPaddleY, 10, 40);

        const bottomPaddleX = playerPositions[2] || 180;
        this.ctx.fillRect(bottomPaddleX, this.canvas.height - 10, 40, 10);

        const leftPaddleY = this.paddlePosition;
        this.ctx.fillRect(0, leftPaddleY, 10, 40);

        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        this.ctx.setLineDash([3, 10]);
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width / 2, 0);
        this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
        this.ctx.stroke();
        
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
        const username = window.__USERNAME__ || getCurrentUser() || "Player 1";
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
            element.className = connected ? 'connected' : 'disconnected';
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
                    method: "POST"
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
        this.shouldReconnect = false;
        
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
                    method: "POST"
                });
                this.updateStatus("Game ended - Click Start for new game");
            } catch (error) {
                // Ignore errors
            }
            
            this.gameId = null;
        }

        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
        if (startBtn) startBtn.disabled = false;
        if (pauseBtn) pauseBtn.disabled = true;
    }
}