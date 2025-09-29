// Complete fix for src/backend/src/game/gameEngine.ts
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
    abstract checkGameEnd(): boolean;
    abstract resetBall(): void;

    // Shared methods
    protected updateDatabaseState(): void {
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

    public pauseGame(): void {
        if (this.gameTimer) {
            clearTimeout(this.gameTimer);
            this.gameTimer = null;
        }
        
        broadcastToGame(this.gameState.gameId, {
            type: 'gamePause',
            gameId: this.gameState.gameId
        });
    }

    public endGame(): void {
        if (this.gameTimer) {
            clearTimeout(this.gameTimer);
            this.gameTimer = null;
            
            broadcastToGame(this.gameState.gameId, {
                type: 'gameEnd',
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
            
        this.scorePlayer1 = this.gameState.scorePlayer1;
        this.scorePlayer2 = this.gameState.scorePlayer2;
    }

    updateBallPosition(): number {
        this.gameState.ballPosX += (this.xDir * 2.1);
        this.gameState.ballPosY += (this.yDir * 1.8);
        
        // Update velocity for state tracking
        this.gameState.ballVelX = this.xDir * 2;
        this.gameState.ballVelY = this.yDir * 2;
        
        // Top wall collision
        if (this.gameState.ballPosY <= this.minY) {
            this.yDir = Math.abs(this.yDir);
            this.gameState.ballPosY = this.minY;
        }
        
        // Bottom wall collision
        if (this.gameState.ballPosY >= this.maxY) {
            this.yDir = -Math.abs(this.yDir);
            this.gameState.ballPosY = this.maxY;
        }
        
        // Right paddle collision - paddle is at x=390 (canvas width 400 - paddle width 10)
        if (this.xDir > 0 && this.gameState.ballPosX >= (390 - ballRadius)) {
            const rightPaddleTop = this.gameState.player2Pos || 0;
            const rightPaddleBottom = rightPaddleTop + paddleHeight;
            
            // Check if ball hits paddle
            if (this.gameState.ballPosY >= rightPaddleTop && 
                this.gameState.ballPosY <= rightPaddleBottom) {
                
                // **ADD THIS SECTION - Calculate hit position and add spin**
                const hitPosition = (this.gameState.ballPosY - rightPaddleTop) / paddleHeight;
                const relativeHit = (hitPosition - 0.5) * 2; // -1 to 1 range
                
                // Reverse and slightly increase speed
                this.xDir = -Math.abs(this.xDir) * 1.05;
                this.yDir = (this.yDir + relativeHit * 0.8) * 1.05;
                
                // Add tiny random element
                this.yDir += (Math.random() - 0.5) * 0.15;
                
                // Prevent too-shallow angles
                if (Math.abs(this.yDir) < 0.4) {
                    this.yDir = Math.sign(this.yDir || 1) * 0.4;
                }
                
                // Cap maximum speed
                const maxSpeed = 5;
                if (Math.abs(this.xDir) > maxSpeed) this.xDir = Math.sign(this.xDir) * maxSpeed;
                if (Math.abs(this.yDir) > maxSpeed) this.yDir = Math.sign(this.yDir) * maxSpeed;
                // **END OF NEW SECTION**
                
                this.gameState.ballPosX = 390 - ballRadius;
            } else if (this.gameState.ballPosX >= 400) {
                // Missed paddle - Goal for Player 1
                this.updateScoreBoard(1);
                return 1;
            }
        }
        
        // Left paddle collision - paddle is at x=0
        if (this.xDir < 0 && this.gameState.ballPosX <= (paddleWidth + ballRadius)) {
            const leftPaddleTop = this.gameState.player1Pos || 0;
            const leftPaddleBottom = leftPaddleTop + paddleHeight;
            
            // Check if ball hits paddle
            if (this.gameState.ballPosY >= leftPaddleTop && 
                this.gameState.ballPosY <= leftPaddleBottom) {
                
                // **ADD THIS SECTION - Calculate hit position and add spin**
                const hitPosition = (this.gameState.ballPosY - leftPaddleTop) / paddleHeight;
                const relativeHit = (hitPosition - 0.5) * 2; // -1 to 1 range
                
                // Reverse and slightly increase speed
                this.xDir = Math.abs(this.xDir) * 1.05;
                this.yDir = (this.yDir + relativeHit * 0.8) * 1.05;
                
                // Add tiny random element
                this.yDir += (Math.random() - 0.5) * 0.15;
                
                // Prevent too-shallow angles
                if (Math.abs(this.yDir) < 0.4) {
                    this.yDir = Math.sign(this.yDir || 1) * 0.4;
                }
                
                // Cap maximum speed
                const maxSpeed = 5;
                if (Math.abs(this.xDir) > maxSpeed) this.xDir = Math.sign(this.xDir) * maxSpeed;
                if (Math.abs(this.yDir) > maxSpeed) this.yDir = Math.sign(this.yDir) * maxSpeed;
                // **END OF NEW SECTION**
                
                this.gameState.ballPosX = paddleWidth + ballRadius;
            } else if (this.gameState.ballPosX <= 0) {
                // Missed paddle - Goal for Player 2
                this.updateScoreBoard(2);
                return 1;
            }
        }
        
        return 0; // No reset needed
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
        const maxPosition = 200 - paddleHeight; // Use raw value, not this.maxY
        const clampedPos = Math.max(0, Math.min(position, maxPosition));
        
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

    checkGameEnd(): boolean {
        return this.scorePlayer1 >= 3 || this.scorePlayer2 >= 3;
    }

    endGame(): void {
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
    }

    resetBall(): void {
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
        this.gameState.scorePlayer1 = 0;
        this.gameState.scorePlayer2 = 0;
        this.xDir = 1;
        this.yDir = 1;
        this.frameCount = 0;
        this.scorePlayer1 = 0;
        this.scorePlayer2 = 0;
        
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

// 4-Player Game Engine - MINIMAL IMPLEMENTATION FOR COMPILATION
export class FourPlayerGameEngine extends BaseGameEngine {
    private scores: number[] = [0, 0, 0, 0];
    private playerPositions: number[] = [0, 0, 0, 0];
    private lastContact: number = 0;

    initializeGame(): void {
        // Initialize ball in center
        this.gameState.ballPosX = (this.maxX + this.minX) / 2;  // Should be 200 for 400x400
        this.gameState.ballPosY = (this.maxY + this.minY) / 2;  // Should be 200 for 400x400
        
        // Initialize 4 player positions with proper boundaries
        this.playerPositions = [
            (this.maxX - this.minX) / 2 - paddleHeight / 2, // Top player X position (center horizontally)
            (this.maxY - this.minY) / 2 - paddleHeight / 2, // Right player Y position (center vertically)
            (this.maxX - this.minX) / 2 - paddleHeight / 2, // Bottom player X position (center horizontally)
            (this.maxY - this.minY) / 2 - paddleHeight / 2  // Left player Y position (center vertically)
        ];
        
        this.scores = [0, 0, 0, 0];
        
        // 2-player compatibility mapping
        if (!this.gameState.scorePlayer1) this.gameState.scorePlayer1 = 0;
        if (!this.gameState.scorePlayer2) this.gameState.scorePlayer2 = 0;
        if (!this.gameState.player1Pos) this.gameState.player1Pos = this.playerPositions[3]; // Map to left player
        if (!this.gameState.player2Pos) this.gameState.player2Pos = this.playerPositions[1]; // Map to right player
    }

    updateBallPosition(): number {
        const speed = 4;
        
        // Move ball first
        this.gameState.ballPosX += speed * this.xDir;
        this.gameState.ballPosY += speed * this.yDir;
        
        // Update velocity for client prediction
        this.gameState.ballVelX = speed * this.xDir;
        this.gameState.ballVelY = speed * this.yDir;
        
        // Check paddle collisions with proper boundaries
        // Top paddle (Player 1) - horizontal paddle at top
        if (this.gameState.ballPosY <= (paddleWidth + ballRadius) && this.yDir < 0) {
            const paddleLeft = this.playerPositions[0];
            const paddleRight = this.playerPositions[0] + paddleHeight;
            
            if (this.gameState.ballPosX >= paddleLeft && this.gameState.ballPosX <= paddleRight) {
                this.yDir = Math.abs(this.yDir); // Bounce down
                this.lastContact = 1;
                this.addSpinToBall(this.gameState.ballPosX, paddleLeft, paddleRight, true);
            } else if (this.gameState.ballPosY <= this.minY) {
                // Player 1 missed - award point to last player who touched the ball
                return this.handleGoal();
            }
        }
        
        // Right paddle (Player 2) - vertical paddle at right
        else if (this.gameState.ballPosX >= (this.maxX - ballRadius) && this.xDir > 0) {
            const paddleTop = this.playerPositions[1];
            const paddleBottom = this.playerPositions[1] + paddleHeight;
            
            if (this.gameState.ballPosY >= paddleTop && this.gameState.ballPosY <= paddleBottom) {
                this.xDir = -Math.abs(this.xDir); // Bounce left
                this.lastContact = 2;
                this.addSpinToBall(this.gameState.ballPosY, paddleTop, paddleBottom, false);
            } else if (this.gameState.ballPosX >= this.maxX) {
                // Player 2 missed - award point to last player who touched the ball
                return this.handleGoal();
            }
        }
        
        // Bottom paddle (Player 3) - horizontal paddle at bottom
        else if (this.gameState.ballPosY >= (this.maxY - ballRadius) && this.yDir > 0) {
            const paddleLeft = this.playerPositions[2];
            const paddleRight = this.playerPositions[2] + paddleHeight;
            
            if (this.gameState.ballPosX >= paddleLeft && this.gameState.ballPosX <= paddleRight) {
                this.yDir = -Math.abs(this.yDir); // Bounce up
                this.lastContact = 3;
                this.addSpinToBall(this.gameState.ballPosX, paddleLeft, paddleRight, true);
            } else if (this.gameState.ballPosY >= this.maxY) {
                // Player 3 missed - award point to last player who touched the ball
                return this.handleGoal();
            }
        }
        
        // Left paddle (Player 4) - vertical paddle at left
        else if (this.gameState.ballPosX <= (this.minX + ballRadius) && this.xDir < 0) {
            const paddleTop = this.playerPositions[3];
            const paddleBottom = this.playerPositions[3] + paddleHeight;
            
            if (this.gameState.ballPosY >= paddleTop && this.gameState.ballPosY <= paddleBottom) {
                this.xDir = Math.abs(this.xDir); // Bounce right
                this.lastContact = 4;
                this.addSpinToBall(this.gameState.ballPosY, paddleTop, paddleBottom, false);
            } else if (this.gameState.ballPosX <= this.minX) {
                // Player 4 missed - award point to last player who touched the ball
                return this.handleGoal();
            }
        }

        return 0; // No reset needed
    }

    private addSpinToBall(ballPos: number, paddleStart: number, paddleEnd: number, isHorizontal: boolean): void {
        // Add some variation to ball direction based on where it hits the paddle
        const paddleCenter = (paddleStart + paddleEnd) / 2;
        const hitOffset = ballPos - paddleCenter;
        const maxOffset = paddleHeight / 2;
        const spinFactor = (hitOffset / maxOffset) * 0.5; // Max 0.5 units of spin
        
        if (isHorizontal) {
            // For top/bottom paddles, affect X direction
            this.xDir += spinFactor;
            // Clamp to reasonable values
            this.xDir = Math.max(-1.5, Math.min(1.5, this.xDir));
        } else {
            // For left/right paddles, affect Y direction
            this.yDir += spinFactor;
            // Clamp to reasonable values
            this.yDir = Math.max(-1.5, Math.min(1.5, this.yDir));
        }
    }

    private handleGoal(): number {
        // Award point to the last player who successfully hit the ball
        if (this.lastContact > 0 && this.lastContact <= 4) {
            this.scores[this.lastContact - 1]++;
            
            // Update 2-player compatibility scores
            this.gameState.scorePlayer1 = this.scores[3] || 0; // Left player (Player 4)
            this.gameState.scorePlayer2 = this.scores[1] || 0; // Right player (Player 2)
        }
        
        this.broadcastScoreUpdate();
        this.updateDatabaseState();
        
        return 1; // Signal to reset ball
    }

    broadcastGameState(): void {
        const gameState = {
            type: 'gameState',
            gameId: this.gameState.gameId,
            mode: '4player',
            state: {
                ballPosX: this.gameState.ballPosX,
                ballPosY: this.gameState.ballPosY,
                ballVelX: this.gameState.ballVelX,
                ballVelY: this.gameState.ballVelY,
                playerPositions: this.playerPositions,
                player1Pos: this.gameState.player1Pos, // For 2-player compatibility (Left)
                player2Pos: this.gameState.player2Pos, // For 2-player compatibility (Right)
                scores: this.scores,
                scorePlayer1: this.scores[3] || 0, // Left player score
                scorePlayer2: this.scores[1] || 0, // Right player score
                lastContact: this.lastContact,
                frameCount: this.frameCount,
                timestamp: Date.now()
            }
        };

        broadcastToGame(this.gameState.gameId, gameState);
    }

    private broadcastScoreUpdate(): void {
        const scoreUpdate = {
            type: 'score',
            gameId: this.gameState.gameId,
            mode: '4player',
            scores: this.scores,
            scorePlayer1: this.scores[3] || 0, // For 2-player compatibility
            scorePlayer2: this.scores[1] || 0, // For 2-player compatibility
            timestamp: Date.now()
        };

        broadcastToGame(this.gameState.gameId, scoreUpdate);
    }

    updatePlayerPosition(playerId: number, position: number): void {
        if (playerId >= 1 && playerId <= 4) {
            let clampedPos: number;
            
            // Different clamping for different paddle orientations with proper boundaries
            if (playerId === 1 || playerId === 3) {
                // Top and bottom players (horizontal paddles) - constrain X position
                // Can move from paddleWidth to (maxX - paddleWidth - paddleHeight)
                clampedPos = Math.max(paddleWidth, Math.min(position, this.maxX - paddleWidth - paddleHeight));
            } else {
                // Left and right players (vertical paddles) - constrain Y position  
                // Can move from paddleWidth to (maxY - paddleWidth - paddleHeight)
                clampedPos = Math.max(paddleWidth, Math.min(position, this.maxY - paddleWidth - paddleHeight));
            }
            
            this.playerPositions[playerId - 1] = clampedPos;
            
            // Update database-compatible positions for 2-player compatibility
            if (playerId === 4) { // Left player maps to player1
                this.gameState.player1Pos = clampedPos;
            } else if (playerId === 2) { // Right player maps to player2  
                this.gameState.player2Pos = clampedPos;
            }
        }
    }

    checkGameEnd(): boolean {
        // Game ends when any player reaches 5 points
        return this.scores.some(score => score >= 5);
    }

    endGame(): void {
        const maxScore = Math.max(...this.scores);
        const winnerId = this.scores.findIndex(score => score === maxScore) + 1;
        
        const gameEndMessage = {
            type: 'gameEnd',
            gameId: this.gameState.gameId,
            mode: '4player',
            winner: winnerId,
            winnerName: `Player ${winnerId}`,
            finalScores: this.scores,
            timestamp: Date.now()
        };
        broadcastToGame(this.gameState.gameId, gameEndMessage);
        
    }

    resetBall(): void {
        // Reset ball to center
        this.gameState.ballPosX = (this.maxX + this.minX) / 2;
        this.gameState.ballPosY = (this.maxY + this.minY) / 2;
        this.gameState.ballVelX = 0;
        this.gameState.ballVelY = 0;
        
        // Random direction
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
        
        // Brief pause before resuming
        setTimeout(() => {
            this.broadcastGameState();
        }, 1500);
    }

    resetGame(): void {
        this.initializeGame();
        this.frameCount = 0;
        this.lastContact = 0;
        
        // Reset direction
        this.xDir = 1;
        this.yDir = 1;
        
        this.updateDatabaseState();
        this.broadcastGameState();
    }

    protected getUpdateData(): any {
        return {
            ballPosX: this.gameState.ballPosX,
            ballPosY: this.gameState.ballPosY,
            ballVelX: this.gameState.ballVelX,
            ballVelY: this.gameState.ballVelY,
            // Map the 4-player positions to the database fields
            player1Pos: this.playerPositions[3] || 0, // Left player
            player2Pos: this.playerPositions[1] || 0, // Right player  
            scorePlayer1: this.scores[3] || 0, // Left player score
            scorePlayer2: this.scores[1] || 0, // Right player score
            // TODO: Add player3Pos, player4Pos, scorePlayer3, scorePlayer4 when database is extended
        };
    }

    // Helper methods for 4-player mode
    public getPlayerScore(playerId: number): number {
        return this.scores[playerId - 1] || 0;
    }

    public getPlayerPosition(playerId: number): number {
        return this.playerPositions[playerId - 1] || 0;
    }

    public getGameStats(): {
        scores: number[];
        playerPositions: number[];
        lastContact: number;
    } {
        return {
            scores: [...this.scores],
            playerPositions: [...this.playerPositions],
            lastContact: this.lastContact
        };
    }
}

// Factory function to create the appropriate game engine
export function createGameEngine(gameState: GameState, mode: string, options?: GameEngineOptions): BaseGameEngine {
    const gameOptions = mode === '4player' ? {
        maxX: 400,
        minX: 0,
        maxY: 400,
        minY: 0
    } : {
        maxX: 400,
        minX: 0,
        maxY: 200,
        minY: 0
    };

    switch (mode) {
        case '1v1':
            return new TwoPlayerGameEngine(gameState, gameOptions);
        case '4player':
            return new FourPlayerGameEngine(gameState, gameOptions);
        default:
            throw new Error(`Unsupported game mode: ${mode}`);
    }
}

export const GameEngine = TwoPlayerGameEngine;