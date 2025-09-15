// Import CSS for Vite
import './styles.css';

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
    heartbeatInterval: NodeJS.Timeout | null = null;
    keys: { [key: string]: boolean } = {};
    playerId: number = 1;
    player2Id: number = 2;
    paddlePositionLeft: number = 80;
    paddlePositionRight: number = 80;
    
    constructor() {
        this.setupKeyboardControls();
    }

    async init(): Promise<void> {
        this.canvas = document.getElementById("gameScreen") as HTMLCanvasElement;
        this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
        
        this.updateStatus("Initializing...");
        
        try {
            await this.createGame();
            
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
            const response = await fetch("/api/game/new", {
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
            } else {
                throw new Error(data.message || "Failed to create game");
            }
        } catch (error) {
            throw error;
        }
    }

    async connectWebSocket(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const wsUrl = `ws://localhost:3000/game/${this.gameId}/ws`;
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = () => {
                this.updateWSStatus("Connected", true);
                this.startHeartbeat();
                resolve();
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleWebSocketMessage(message);
                } catch (error) {
                    // Ignore malformed messages
                }
            };
            
            this.websocket.onclose = (event) => {
                this.updateWSStatus("Disconnected", false);
                this.isActive = false;
                
                // Auto-reconnect after 3 seconds
                setTimeout(() => {
                    if (this.gameId && (!this.websocket || this.websocket.readyState === WebSocket.CLOSED)) {
                        this.connectWebSocket();
                    }
                }, 3000);
            };
            
            this.websocket.onerror = (error) => {
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
            const response = await fetch(`/api/game/${this.gameId}/start`, {
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
        if (player1Name) player1Name.textContent = "Michael";
        if (player2Name) player2Name.textContent = "Marvin";
    }

    updateStatus(status: string): void {
        const gameStatus = document.getElementById('gameStatus');
        if (gameStatus) gameStatus.textContent = status;
    }

    updateWSStatus(status: string, connected: boolean): void {
        const element = document.getElementById('wsStatus');
        if (element) {
            element.textContent = status;
            if (connected) {
                element.className = 'text-green-400';
            } else {
                element.className = 'text-red-400';
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
                await fetch(`/api/game/${this.gameId}/stop`, {
                    method: "POST"
                });
                this.updateStatus("Game stopped");
            } catch (error) {
                // Ignore stop errors
            }
        }

        const startBtn = document.getElementById('startBtn') as HTMLButtonElement;
        const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
    }

    reconnectWebSocket(): void {
        if (this.gameId) {
            if (this.websocket) {
                this.websocket.close();
            }
            this.connectWebSocket();
        }
    }

    switchLang(): void {
        // TODO: add language switching later
    }
}

// Global game instance
let pongGame: PongGame | null = null;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    pongGame = new PongGame();
    await pongGame.init();
});

// Control functions
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

function switchLang(): void {
    // Language switching not implemented yet
}

// Make functions globally accessible for HTML onclick attributes
(window as any).startGame = startGame;
(window as any).stopGame = stopGame;
(window as any).reconnectWS = reconnectWS;
(window as any).switchLang = switchLang;