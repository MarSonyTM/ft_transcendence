import { GameState, WebSocketMessage } from '../types';
import { getCurrentGameMode, getCurrentUser } from '../utils/globalState';
import { getCurrentRoom } from '../utils/roomState';
import { RoomWebSocketManager } from '../utils/roomWebSocket';

export class PongGame {
    gameId: number | null = null;
    viewIndexMap: number[] = [0, 1, 2, 3];
    canvas: HTMLCanvasElement | null = null;
    ctx: CanvasRenderingContext2D | null = null;
    websocket: WebSocket | null = null;
    isActive: boolean = false;
    fpsStartTime: number = performance.now();
    frameCount: number = 0;
    lastPingTime: number = 0;
    private lastMoveTime: number = 0;
    private readonly MOVE_THROTTLE = 16;
    private lastSentPosition: number = 0;

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
        mode: "2player",
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
    onGameEnd?: (winnerId: number) => Promise<void>;
    roomWS: RoomWebSocketManager | null = null;
    currentGameState: any = null;
    private renderLoopRunning: boolean = false;
    private animationFrameId: number | null = null;
    private shouldReconnect: boolean = true;
    hasLocal: boolean = false;
    isGuest: boolean = false;

    private interpolatedState = {
        ballPosX: 200,
        ballPosY: 100,
        player1Pos: 80,
        player2Pos: 80,
        player3Pos: 180,
        player4Pos: 180
    };
    private lerpFactor = 1;
    
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

    async createGame(): Promise<void> {
        try {
            const modeSelector = document.getElementById('gameModeSelect') as HTMLSelectElement;
            const selectedMode = modeSelector ? modeSelector.value : getCurrentGameMode();
            
            const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
            const response = await fetch(`${apiEndpoint}/api/game/new`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem('authToken')}`
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
            const token = localStorage.getItem('authToken');
            const wsUrl = `${wsEndpoint}/game/${this.gameId}/ws?token=${token}`;
            
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
                // Delta merge - only update provided fields
                if (message.state.ballPosX !== undefined) {
                    this.gameState.ballPosX = message.state.ballPosX;
                }
                if (message.state.ballPosY !== undefined) {
                    this.gameState.ballPosY = message.state.ballPosY;
                }
                if (message.state.player1Pos !== undefined) {
                    this.gameState.player1Pos = message.state.player1Pos;
                }
                if (message.state.player2Pos !== undefined) {
                    this.gameState.player2Pos = message.state.player2Pos;
                }
                if (message.state.player3Pos !== undefined) {
                    this.gameState.player3Pos = message.state.player3Pos;
                }
                if (message.state.player4Pos !== undefined) {
                    this.gameState.player4Pos = message.state.player4Pos;
                }
                if (message.state.scorePlayer1 !== undefined) {
                    this.gameState.scorePlayer1 = message.state.scorePlayer1;
                }
                if (message.state.scorePlayer2 !== undefined) {
                    this.gameState.scorePlayer2 = message.state.scorePlayer2;
                }
                if (message.state.scorePlayer3 !== undefined) {
                    this.gameState.scorePlayer3 = message.state.scorePlayer3;
                }
                if (message.state.scorePlayer4 !== undefined) {
                    this.gameState.scorePlayer4 = message.state.scorePlayer4;
                }
                
                // Update arrays for 4-player mode
                if (message.state.scores) {
                    this.gameState.scores = message.state.scores;
                }
                if (message.state.playerPositions) {
                    // Store for 4-player rendering
                }
                
                this.updateScoreDisplay();
            }
            break;
                
            case 'ballReset':
                console.log('Ball reset:', message.message);
                break;
                
            case 'score':
                if (message.mode === '4player' && message.scores) {
                    this.gameState.scores = message.scores;
                    this.gameState.scorePlayer1 = message.scores[3] ?? 0;
                    this.gameState.scorePlayer2 = message.scores[1] ?? 0;
                    this.gameState.scorePlayer3 = message.scores[0] ?? 0;
                    this.gameState.scorePlayer4 = message.scores[2] ?? 0;
                } else {
                    this.gameState.scorePlayer1 = message.scorePlayer1 ?? 0;
                    this.gameState.scorePlayer2 = message.scorePlayer2 ?? 0;
                    this.gameState.scorePlayer3 = message.scorePlayer3 ?? 0;
                    this.gameState.scorePlayer4 = message.scorePlayer4 ?? 0;
                }
                this.updateScoreDisplay();
                break;
                
            case 'gameStop':
                this.isActive = false;
                this.updateStatus("Game stopped");
                break;

            case 'gameEnd':
                if (message.mode === '4player') {
                    this.updateStatus(`Game Over! ${message.winnerName ?? 'Player ?'} wins!`);
                    console.log(`4-Player Game Over! Winner: ${message.winnerName}`, message.finalScores);
                    
                    // Trigger callback for 4-player mode
                    if (this.onGameEnd) {
                        const winnerId = message.winnerName ? this.parseWinnerIdFromName(message.winnerName) : 1;
                        this.onGameEnd(winnerId);
                    }
                } else {
                    this.updateStatus(`Game Over! ${message.winner} wins!`);
                    console.log(`Game Over! Winner: ${message.winner}`);
                    
                    // Trigger callback for 2-player mode
                    if (this.onGameEnd && message.winner !== undefined) {
                        this.onGameEnd(message.winner);
                    }
                }
                this.isActive = false;
                break;

            case 'ping':
                console.log("pong");
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
            const leftScore = this.gameState.scorePlayer1;
            const rightScore = this.gameState.scorePlayer2;
            if (player1score) player1score.textContent = leftScore.toString();
            if (player2score) player2score.textContent = rightScore.toString();
        }
    }

    async startServerGame(): Promise<void> {
        try {
            const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
            const response = await fetch(`${apiEndpoint}/api/game/${this.gameId}/start`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem('authToken')}`
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

        if (this.ctx) {
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.imageSmoothingQuality = 'low';
        }
        
        const renderFrame = () => {
            if (!this.renderLoopRunning) return;
            
            this.updateFPS();
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


    sendPlayerMove(position: number): void {
        if (getCurrentRoom()) return;
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
                type: 'move',
                playerId: 1,
                position: position,
            }));
        }
    }

    render(): void {
        if (!this.ctx || !this.canvas) return;
    
        const is4Player = this.gameState.mode === '4player' || getCurrentGameMode() === '4player';

        this.interpolatedState.ballPosX += (this.gameState.ballPosX - this.interpolatedState.ballPosX) * this.lerpFactor;
        this.interpolatedState.ballPosY += (this.gameState.ballPosY - this.interpolatedState.ballPosY) * this.lerpFactor;
        this.interpolatedState.player1Pos += (this.gameState.player1Pos - this.interpolatedState.player1Pos) * this.lerpFactor;
        this.interpolatedState.player2Pos += (this.gameState.player2Pos - this.interpolatedState.player2Pos) * this.lerpFactor;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
        if (is4Player) {
            this.interpolatedState.player3Pos += (this.gameState.player3Pos - this.interpolatedState.player3Pos) * this.lerpFactor;
            this.interpolatedState.player4Pos += (this.gameState.player4Pos - this.interpolatedState.player4Pos) * this.lerpFactor;
            
            const rotatedBall = this.getRotatedBallPosition(
                this.interpolatedState.ballPosX, 
                this.interpolatedState.ballPosY
            );
            
            this.render4Player();
            
            this.ctx.beginPath();
            this.ctx.arc(rotatedBall.x, rotatedBall.y, 10, 0, 2 * Math.PI);
            this.ctx.fillStyle = "white";
            this.ctx.fill();
        } else {
            // Use interpolated values
            this.render2Player(this.interpolatedState.ballPosX, this.interpolatedState.ballPosY);
            
            this.ctx.beginPath();
            this.ctx.arc(this.interpolatedState.ballPosX, this.interpolatedState.ballPosY, 10, 0, 2 * Math.PI);
            this.ctx.fillStyle = "white";
            this.ctx.fill();
        }
        
            // Draw game ID
            this.ctx.font = "12px Arial";
            this.ctx.fillStyle = "white";
            this.ctx.textAlign = "center";
            this.ctx.fillText(`Game ${this.gameId}`, this.canvas.width / 2, 15);
        }

    private getRotatedBallPosition(ballX: number, ballY: number): { x: number, y: number } {
        if (!this.canvas) return { x: ballX, y: ballY };
        
        // Check if rotation is needed (viewIndexMap is not identity)
        if (this.viewIndexMap[0] === 0) {
            return { x: ballX, y: ballY };
        }
        
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // Determine rotation angle from viewIndexMap
        // viewIndexMap[0] tells us where server position 0 (top) goes visually
        const rotation = this.viewIndexMap[0]; // 0=no rotation, 1=90°CCW, 2=180°, 3=90°CW
        
        let rotatedX = ballX;
        let rotatedY = ballY;
        
        switch(rotation) {
            case 1: // 90° CCW (server bottom -> visual left)
                rotatedX = ballY;
                rotatedY = this.canvas.height - ballX;
                break;
            case 2: // 180° (server right -> visual left)
                rotatedX = this.canvas.width - ballX;
                rotatedY = this.canvas.height - ballY;
                break;
            case 3: // 90° CW (server top -> visual left)
                rotatedX = this.canvas.width - ballY;
                rotatedY = ballX;
                break;
        }
        
        return { x: rotatedX, y: rotatedY };
    }

    render2Player(ballPosX: number, ballPosY: number): void {
        if (!this.ctx || !this.canvas) return;

        const player1Pos = this.interpolatedState.player1Pos ?? 80;
        const player2Pos = this.interpolatedState.player2Pos ?? 80;

        this.ctx.save();
        
        // Draw center line
        this.ctx.strokeStyle = "white";
        this.ctx.setLineDash([5, 15]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width / 2, 0);
        this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
        this.ctx.stroke();
        
        this.ctx.restore();
        this.ctx.save();
        
        // Draw paddles (no line dash)
        this.ctx.fillStyle = "grey";
        this.ctx.fillRect(0, player1Pos, 10, 40);
        this.ctx.fillRect(this.canvas.width - 10, player2Pos, 10, 40);
        
        this.ctx.restore();
    }

    render4Player(): void {
        if (!this.ctx || !this.canvas) return;

        // ✅ Use interpolated positions for smooth paddles
        const serverPositions = [
            this.interpolatedState.player1Pos ?? 180,
            this.interpolatedState.player2Pos ?? 180,
            this.interpolatedState.player3Pos ?? 180,
            this.interpolatedState.player4Pos ?? 180
        ];

        // Apply view rotation
        const visualPositions = [0, 0, 0, 0];
        for (let serverPos = 0; serverPos < 4; serverPos++) {
            const visualPos = this.viewIndexMap[serverPos];
            visualPositions[visualPos] = serverPositions[serverPos];
        }
        
        this.ctx.save();
        this.ctx.fillStyle = "grey";

        // Draw paddles at rotated visual positions
        this.ctx.fillRect(visualPositions[0], 0, 40, 10);
        this.ctx.fillRect(this.canvas.width - 10, visualPositions[1], 10, 40);
        this.ctx.fillRect(visualPositions[2], this.canvas.height - 10, 40, 10);
        this.ctx.fillRect(0, visualPositions[3], 10, 40);

        // Draw center lines
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
        this.ctx.restore();
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
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${localStorage.getItem('authToken')}`
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
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${localStorage.getItem('authToken')}`
                    },
                    body: JSON.stringify({
                        gameId: this.gameId
                    })
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

    private parseWinnerIdFromName(winnerName: string): number {
        const match = winnerName.match(/Player (\d+)/);
        return match ? parseInt(match[1]) : 1;
    }
}