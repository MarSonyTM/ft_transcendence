import { GameState, database } from "../database";
import { broadcastToGame, getGameConnectionCount } from "../websocket/websocketHandler";

const DEBUG = false;

// Global constants
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

// Base abstract class with shared functionality
export abstract class BaseGameEngine {
    protected gameTimer: NodeJS.Timeout | null = null;
    protected frameCount: number = 0;
    protected gameState: GameState;
    
    // Game boundaries
    protected readonly maxX: number;
    protected readonly minX: number;
    protected readonly maxY: number;
    protected readonly minY: number;
    
    // Ball movement
    protected xDir: number = 1;
    protected yDir: number = 1;

    constructor(gameState: GameState, options?: GameEngineOptions) {
        this.gameState = gameState;
        
        this.maxX = (options?.maxX ?? maxX) - ballRadius;
        this.minX = (options?.minX ?? minX) + ballRadius;
        this.maxY = (options?.maxY ?? maxY) - ballRadius;
        this.minY = (options?.minY ?? minY) + ballRadius;
        
        this.initializeGame();
    }

    // Abstract methods that each game mode must implement
    abstract initializeGame(): void;
    abstract updateBallPosition(): number;
    abstract broadcastGameState(): void;
    abstract updatePlayerPosition(playerId: number, position: number): void;
    abstract resetGame(): void;

    // Shared methods
    protected updateDatabaseState(): void {
        // Common database update logic
        try {
            const updateData = this.getUpdateData();
            database.gameState.updateGameState(this.gameState.id, updateData);
        } catch (error) {
            // DB update failed, but game continues
        }
    }

    protected abstract getUpdateData(): any;

    public startGame(): void {
        this.gameLoop();
    }

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

    protected gameLoop = (): void => {
        const resetSignal = this.updateBallPosition();
        
        if (resetSignal === 1) {
            this.resetBall();
        }
        
        if (this.checkGameEnd()) {
            this.endGame();
            return;
        }
        
        this.frameCount++;
        this.broadcastGameState();

        if (this.frameCount % 30 === 0) {
            this.updateDatabaseState();
        }

        this.gameTimer = setTimeout(this.gameLoop, 16);
    }

    protected abstract checkGameEnd(): boolean;
    protected abstract endGame(): void;
    protected abstract resetBall(): void;

    public getCurrentState(): GameState {
        return { ...this.gameState };
    }

    public getGameId(): number {
        return this.gameState.gameId;
    }

    public isRunning(): boolean {
        return this.gameTimer !== null;
    }
}

// 2-Player Game Engine
export class TwoPlayerGameEngine extends BaseGameEngine {
    private scorePlayer1 = 0;
    private scorePlayer2 = 0;

    initializeGame(): void {
        // Initialize ball in center if not set
        if (!this.gameState.ballPosX)
            this.gameState.ballPosX = (this.maxX + this.minX) / 2;
        if (!this.gameState.ballPosY)
            this.gameState.ballPosY = (this.maxY + this.minY) / 2;
        if (!this.gameState.player1Pos)
            this.gameState.player1Pos = (this.maxY + this.minY) / 2 - 20;
        if (!this.gameState.player2Pos)
            this.gameState.player2Pos = (this.maxY + this.minY) / 2 - 20;

        // Initialize scores
        if (!this.gameState.scorePlayer1)
            this.gameState.scorePlayer1 = 0;
        if (!this.gameState.scorePlayer2)
            this.gameState.scorePlayer2 = 0;
    }

    updateBallPosition(): number {
        // Your existing 2-player collision detection logic
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

        // Y boundaries
        if (this.gameState.ballPosY >= this.maxY) {
            this.yDir = -1;
        } else if (this.gameState.ballPosY <= this.minY) {
            this.yDir = 1;
        }

        // Move ball
        const speed = 3;
        this.gameState.ballPosX += speed * this.xDir;
        this.gameState.ballPosY += speed * this.yDir;

        this.gameState.ballVelX = speed * this.xDir;
        this.gameState.ballVelY = speed * this.yDir;

        return 0;
    }

    broadcastGameState(): void {
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

    updatePlayerPosition(playerId: number, position: number): void {
        const clampedPos = Math.max(0, Math.min(position, (this.maxY + this.minY) - paddleHeight + 20));
        
        if (playerId === 1) {
            this.gameState.player1Pos = clampedPos;
        } else if (playerId === 2) {
            this.gameState.player2Pos = clampedPos;
        }
    }

    private updateScoreBoard(player: number): void {
        if (player === 1) {
            this.scorePlayer1 += 1;
            this.gameState.scorePlayer1 = this.scorePlayer1;
        } else if (player === 2) {
            this.scorePlayer2 += 1;
            this.gameState.scorePlayer2 = this.scorePlayer2;
        }

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

    protected checkGameEnd(): boolean {
        return this.scorePlayer1 >= 3 || this.scorePlayer2 >= 3;
    }

    protected endGame(): void {
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
    }

    protected resetBall(): void {
        this.gameState.ballPosX = (this.maxX + this.minX) / 2;
        this.gameState.ballPosY = (this.maxY + this.minY) / 2;
        this.gameState.ballVelX = 0;
        this.gameState.ballVelY = 0;
        
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

    resetGame(): void {
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

    protected getUpdateData(): any {
        return {
            ballPosX: this.gameState.ballPosX,
            ballPosY: this.gameState.ballPosY,
            ballVelX: this.gameState.ballVelX,
            ballVelY: this.gameState.ballVelY,
            player1Pos: this.gameState.player1Pos,
            player2Pos: this.gameState.player2Pos,
            scorePlayer1: this.gameState.scorePlayer1,
            scorePlayer2: this.gameState.scorePlayer2
        };
    }
}

// 4-Player Game Engine
export class FourPlayerGameEngine extends BaseGameEngine {
    private scores: number[] = [0, 0, 0, 0];
    private playerPositions: number[] = [0, 0, 0, 0];

    initializeGame(): void {
        // Initialize ball in center
        this.gameState.ballPosX = (this.maxX + this.minX) / 2;
        this.gameState.ballPosY = (this.maxY + this.minY) / 2;
        
        // Initialize 4 player positions (top, right, bottom, left)
        this.playerPositions = [
            (this.maxX + this.minX) / 2 - 20, // Top player
            (this.maxY + this.minY) / 2 - 20, // Right player  
            (this.maxX + this.minX) / 2 - 20, // Bottom player
            (this.maxY + this.minY) / 2 - 20  // Left player
        ];
        
        this.scores = [0, 0, 0, 0];
    }

    updateBallPosition(): number {
        // 4-player collision detection logic
        // You'll need to implement collision with 4 paddles around the perimeter
        
        // Top paddle (Player 1)
        if (this.gameState.ballPosY <= (paddleWidth + ballRadius) && this.yDir < 0) {
            // Check collision with top paddle
            // Implementation needed
        }
        
        // Right paddle (Player 2)  
        if (this.gameState.ballPosX >= (maxX - paddleWidth - ballRadius) && this.xDir > 0) {
            // Check collision with right paddle
            // Implementation needed
        }
        
        // Bottom paddle (Player 3)
        if (this.gameState.ballPosY >= (maxY - paddleWidth - ballRadius) && this.yDir > 0) {
            // Check collision with bottom paddle
            // Implementation needed
        }
        
        // Left paddle (Player 4)
        if (this.gameState.ballPosX <= (paddleWidth + ballRadius) && this.xDir < 0) {
            // Check collision with left paddle
            // Implementation needed
        }

        // Move ball
        const speed = 3;
        this.gameState.ballPosX += speed * this.xDir;
        this.gameState.ballPosY += speed * this.yDir;

        return 0;
    }

    broadcastGameState(): void {
        const gameState = {
            type: 'gameState',
            gameId: this.gameState.gameId,
            state: {
                ballPosX: this.gameState.ballPosX,
                ballPosY: this.gameState.ballPosY,
                ballVelX: this.gameState.ballVelX,
                ballVelY: this.gameState.ballVelY,
                playerPositions: this.playerPositions,
                scores: this.scores,
                frameCount: this.frameCount,
                timestamp: Date.now()
            }
        };

        broadcastToGame(this.gameState.gameId, gameState);
    }

    updatePlayerPosition(playerId: number, position: number): void {
        if (playerId >= 1 && playerId <= 4) {
            this.playerPositions[playerId - 1] = position;
        }
    }

    protected checkGameEnd(): boolean {
        return this.scores.some(score => score >= 3);
    }

    protected endGame(): void {
        const winnerIndex = this.scores.findIndex(score => score >= 3);
        
        const gameEndMessage = {
            type: 'gameEnd',
            gameId: this.gameState.gameId,
            winner: winnerIndex + 1,
            finalScores: this.scores,
            timestamp: Date.now()
        };
        broadcastToGame(this.gameState.gameId, gameEndMessage);
        
        this.stopGame();
    }

    protected resetBall(): void {
        // Reset ball to center
        this.gameState.ballPosX = (this.maxX + this.minX) / 2;
        this.gameState.ballPosY = (this.maxY + this.minY) / 2;
        
        // Random direction
        this.xDir = Math.random() > 0.5 ? 1 : -1;
        this.yDir = Math.random() > 0.5 ? 1 : -1;
    }

    resetGame(): void {
        this.initializeGame();
        this.frameCount = 0;
        this.updateDatabaseState();
        this.broadcastGameState();
    }

    protected getUpdateData(): any {
        return {
            ballPosX: this.gameState.ballPosX,
            ballPosY: this.gameState.ballPosY,
            ballVelX: this.gameState.ballVelX,
            ballVelY: this.gameState.ballVelY,
            // For now, map the 4-player positions to the database fields
            player1Pos: this.playerPositions[0] || 0,
            player2Pos: this.playerPositions[1] || 0,
            scorePlayer1: this.scores[0] || 0,
            scorePlayer2: this.scores[1] || 0,
            // TODO: Add player3Pos, player4Pos, scorePlayer3, scorePlayer4 when database is extended
        };
    }
}

// Factory function to create the appropriate game engine
export function createGameEngine(gameState: GameState, mode: string, options?: GameEngineOptions): BaseGameEngine {
    switch (mode) {
        case '1v1':
            return new TwoPlayerGameEngine(gameState, options);
        case '4player':
            return new FourPlayerGameEngine(gameState, options);
        default:
            throw new Error(`Unsupported game mode: ${mode}`);
    }
}

export const GameEngine = TwoPlayerGameEngine;