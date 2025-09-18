import { GameState, database } from "../database";
import { broadcastToGame, getGameConnectionCount } from "../websocket/websocketHandler";

const DEBUG = false;

// Global Env (linked to canvas settings!)
const maxX = 400;
const minX = 0;
const maxY = 200;
const minY = 0;
const ballRadius = 10;
const paddleHeight = 40;
const paddleWidth = 10;

interface GameEngineOptions {
    maxX?: number;
    minX?: number;
    maxY?: number;
    minY?: number;
}

export class GameEngine {
    private gameTimer: NodeJS.Timeout | null = null;
    private frameCount: number = 0;
    
    // Game boundaries 
    private readonly maxX: number = maxX - ballRadius; // 400 - 10
    private readonly minX: number = minX + ballRadius;   // 0 + 10
    private readonly maxY: number = maxY - ballRadius;  // 200 - 10
    private readonly minY: number = minY + ballRadius;   // 0 + 10
    
    // Direction for ball movement
    private xDir: number = 1;
    private yDir: number = 1;

    // GameState
    private gameState: GameState;

    // Player score
    private scorePlayer1 = 0;
    private scorePlayer2 = 0;

    constructor(gameState: GameState, options?: GameEngineOptions) {
        this.gameState = gameState;
        
        // Apply custom boundaries if provided
        if (options) {
            this.maxX = (options.maxX ?? maxX) - ballRadius;
            this.minX = (options.minX ?? minX) + ballRadius;
            this.maxY = (options.maxY ?? maxY) - ballRadius;
            this.minY = (options.minY ?? minY) + ballRadius;
        }

        // Initialize ball in center if not set
        if (!this.gameState.ballPosX)
            this.gameState.ballPosX = (this.maxX + this.minX) / 2;
        if (!this.gameState.ballPosY)
            this.gameState.ballPosY = (this.maxY + this.minY) / 2;
        if (!this.gameState.player1Pos)
            this.gameState.player1Pos = (this.maxY + this.minY) / 2 - 20;
        if (!this.gameState.player2Pos)
            this.gameState.player2Pos = (this.maxY + this.minY) / 2 - 20;

        // Initialize scores if not already
        if (!this.gameState.scorePlayer1)
            this.gameState.scorePlayer1 = 0;
        if (!this.gameState.scorePlayer2)
            this.gameState.scorePlayer2 = 0;
    }

    // Get current ball position
    public getBallX(): number {
        return this.gameState.ballPosX;
    }

    public getBallY(): number {
        return this.gameState.ballPosY;
    }

    // Get player positions
    public getPlayer1Position(): number {
        return this.gameState.player1Pos;
    }

    public getPlayer2Position(): number {
        return this.gameState.player2Pos;
    }

    // Update game state in database
    private updateDatabaseState(): void {
        try {
            const updateData = {
                ballPosX: this.gameState.ballPosX,
                ballPosY: this.gameState.ballPosY,
                ballVelX: this.gameState.ballVelX,
                ballVelY: this.gameState.ballVelY,
                player1Pos: this.gameState.player1Pos,
                player2Pos: this.gameState.player2Pos,
                scorePlayer1: this.gameState.scorePlayer1,
                scorePlayer2: this.gameState.scorePlayer2
            };
            
            database.gameState.updateGameState(this.gameState.id, updateData);
        } catch (error) {
            // DB update failed, but game continues
        }
    }

    // Broadcast game state to all connected clients
    private broadcastGameState(): void {
        const gameState = {
            type: 'gameState',
            gameId: this.gameState.gameId,
            state: {
                ballPosX: this.gameState.ballPosX,
                ballPosY: this.gameState.ballPosY,
                ballVelX: this.gameState.ballVelX,
                ballVelY: this.gameState.ballVelY,
                player1Pos: this.gameState.player1Pos,
                player2Pos: this.gameState.player2Pos,
                scorePlayer1: this.gameState.scorePlayer1,
                scorePlayer2: this.gameState.scorePlayer2,
                frameCount: this.frameCount,
                timestamp: Date.now()
            }
        };

        broadcastToGame(this.gameState.gameId, gameState);
    }

    // Start the game
    public startGame(): void {
        this.gameLoop();
    }

    // Update ball position with physics
    private updateBallPosition(): number {
        
        // Check X boundaries and paddle collisions
        // Right paddle collision (Player 2)
        if (this.gameState.ballPosX >= (maxX - paddleWidth - ballRadius) && this.xDir > 0) {
            const rightPaddleTop = this.gameState.player2Pos;
            const rightPaddleBottom = this.gameState.player2Pos + paddleHeight;
            
            if (this.gameState.ballPosY >= rightPaddleTop &&
                this.gameState.ballPosY <= rightPaddleBottom) {
                this.xDir = -1;
            } else if (this.gameState.ballPosX >= this.maxX) {
                this.updateScoreBoard(1);
                return 1;
            }
        } 
        // Left paddle collision (Player 1)
        else if (this.gameState.ballPosX <= (paddleWidth + ballRadius) && this.xDir < 0) {
            const leftPaddleTop = this.gameState.player1Pos;
            const leftPaddleBottom = this.gameState.player1Pos + paddleHeight;
            if (this.gameState.ballPosY >= leftPaddleTop &&
                this.gameState.ballPosY <= leftPaddleBottom) {
                this.xDir = 1;
            } else if (this.gameState.ballPosX <= this.minX) {
                this.updateScoreBoard(2);
                return 1;
            }
        }

        // Check Y boundaries and reverse direction
        if (this.gameState.ballPosY >= this.maxY) {
            this.yDir = -1;
        } else if (this.gameState.ballPosY <= this.minY) {
            this.yDir = 1;
        }

        // Move ball
        const speed = 3;
        this.gameState.ballPosX += speed * this.xDir;
        this.gameState.ballPosY += speed * this.yDir;

        // Update velocity in gameState
        this.gameState.ballVelX = speed * this.xDir;
        this.gameState.ballVelY = speed * this.yDir;

        return 0;
    }

    private updateScoreBoard(player: number): void {
        if (player === 1) {
            this.scorePlayer1 += 1;
            this.gameState.scorePlayer1 = this.scorePlayer1;
        } else if (player === 2) {
            this.scorePlayer2 += 1;
            this.gameState.scorePlayer2 = this.scorePlayer2;
        } else {
            return;
        }

        // Broadcast score update
        this.broadcastScoreUpdate();
        this.updateDatabaseState();
    }

    private broadcastScoreUpdate(): void {
        const scoreUpdate = {
            type: 'score',
            gameId: this.gameState.gameId,
            scorePlayer1: this.gameState.scorePlayer1,
            scorePlayer2: this.gameState.scorePlayer2,
            timestamp: Date.now()
        };

        broadcastToGame(this.gameState.gameId, scoreUpdate);
    }

    private resetBall(): void {
        // Reset ball to center
        this.gameState.ballPosX = (this.maxX + this.minX) / 2;
        this.gameState.ballPosY = (this.maxY + this.minY) / 2;
        
        // Reset velocities
        this.gameState.ballVelX = 0;
        this.gameState.ballVelY = 0;
        
        // Reset direction (random)
        this.xDir = Math.random() > 0.5 ? 1 : -1;
        this.yDir = Math.random() > 0.5 ? 1 : -1;
        
        this.broadcastGameState();
        this.updateDatabaseState();
        
        const resetMessage = {
            type: 'ballReset',
            gameId: this.gameState.gameId,
            message: 'Ball reset - get ready!',
            timestamp: Date.now()
        };
        broadcastToGame(this.gameState.gameId, resetMessage);
        
        setTimeout(() => {
            this.broadcastGameState();
        }, 1000);
    }

    // Main game loop
    private gameLoop = (): void => {
        const resetSignal = this.updateBallPosition();
        
        // Check if we need to reset (someone scored)
        if (resetSignal === 1) {
            this.resetBall();
        }
        
        if (this.scorePlayer1 >= 3 || this.scorePlayer2 >= 3) {
            const winner = this.scorePlayer1 >= 3 ? 1 : 2;
            
            const gameEndMessage = {
                type: 'gameEnd',
                gameId: this.gameState.gameId,
                winner: winner,
                finalScore: {
                    player1: this.scorePlayer1,
                    player2: this.scorePlayer2
                },
                timestamp: Date.now()
            };
            broadcastToGame(this.gameState.gameId, gameEndMessage);
            
            this.stopGame();
            return;
        }
        
        this.frameCount++;

        // Broadcast to clients every frame (60 FPS)
        this.broadcastGameState();

        // Update database (every 30 frames)
        if (this.frameCount % 30 === 0) {
            this.updateDatabaseState();
        }

        // Continue loop at 60 FPS
        this.gameTimer = setTimeout(this.gameLoop, 16);
    }

    // Stop the game
    public stopGame(): void {
        if (this.gameTimer) {
            clearTimeout(this.gameTimer);
            this.gameTimer = null;
            
            broadcastToGame(this.gameState.gameId, {
                type: 'gameStop',
                gameId: this.gameState.gameId
            });
            
            this.updateDatabaseState();
        }
    }

    // Get current game state
    public getCurrentState(): GameState {
        return { ...this.gameState };
    }

    // Update player positions
    public updatePlayer1Position(newPos: number): void {
        const paddleHeight = 40;
        newPos = Math.max(0, Math.min(newPos, (this.maxY + this.minY) - paddleHeight + 20));
        this.gameState.player1Pos = newPos;
    }

    public updatePlayer2Position(newPos: number): void {
        const paddleHeight = 40;
        newPos = Math.max(0, Math.min(newPos, (this.maxY + this.minY) - paddleHeight + 20));
        this.gameState.player2Pos = newPos;
    }

    public updatePlayerScore(score1: number, score2: number): void {
        this.gameState.scorePlayer1 += score1;
        this.gameState.scorePlayer2 += score2;
    }

    public getScore() {
        return {
            type: "score",
            scorePlayer1: this.gameState.scorePlayer1,
            scorePlayer2: this.gameState.scorePlayer2
        }
    }

    // Get game ID
    public getGameId(): number {
        return this.gameState.gameId;
    }

    // Check if game is running
    public isRunning(): boolean {
        return this.gameTimer !== null;
    }

    // Reset game state to initial values
    public resetGame(): void {
        this.gameState.ballPosX = (this.maxX + this.minX) / 2;
        this.gameState.ballPosY = (this.maxY + this.minY) / 2;
        this.gameState.ballVelX = 0;
        this.gameState.ballVelY = 0;
        this.gameState.player1Pos = (this.maxY + this.minY) / 2 - 20;
        this.gameState.player2Pos = (this.maxY + this.minY) / 2 - 20;
        this.xDir = 1;
        this.yDir = 1;
        this.frameCount = 0;
        
        this.updateDatabaseState();
        this.broadcastGameState();
    }
}