import { GameState, database } from "../database";
import { broadcastToGame, getGameConnectionCount } from "../websocket/websocketHandler";

const DEBUG = false;

// Global constants
const maxX = 400;
const minX = 0;
const maxY = 400;
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

    protected aiPlayers: Set<number> = new Set();

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

        // Update AI positions if any
        this.updateAIPositions();
        
        if (resetSignal === 1) {
            this.resetBall();
        }
        
        if (this.checkGameEnd()) {
            this.endGame();
            return;
        }
        
        this.broadcastGameState();
        this.frameCount++;
        
        if (this.frameCount % 10 === 0) {
            this.updateDatabaseState();
        }
        
        this.gameTimer = setTimeout(this.gameLoop, 16);
    };

    public setPlayerAI(playerId: number, isAI: boolean): void {
        if (isAI) {
            this.aiPlayers.add(playerId);
            console.log(`🤖 Player ${playerId} set as AI`);
        } else {
            this.aiPlayers.delete(playerId);
            console.log(`👤 Player ${playerId} set as human`);
        }
    }

    public isPlayerAI(playerId: number): boolean {
        return this.aiPlayers.has(playerId);
    }

    protected abstract updateAIPositions(): void;

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

    constructor(gameState: GameState, options?: GameEngineOptions) {
        // Override maxY to 200 for 2-player mode
        const twoPlayerOptions = {
            ...options,
            maxY: 200
        };
        super(gameState, twoPlayerOptions);
    }

    initializeGame(): void {
        console.log('🔍 [DEBUG] initializeGame() called');
        
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
        
        this.xDir = Math.random() > 0.5 ? 1 : -1;
        this.yDir = Math.random() > 0.5 ? 1 : -1;
        
        console.log(`🔍 [DEBUG] Ball initialized at (${this.gameState.ballPosX}, ${this.gameState.ballPosY})`);
        console.log(`🔍 [DEBUG] Ball direction: xDir=${this.xDir}, yDir=${this.yDir}`);
        console.log(`🔍 [DEBUG] AI Players: ${Array.from(this.aiPlayers).join(', ') || 'none'}`);
    }

    // FIXED 2-PLAYER COLLISION DETECTION
    updateBallPosition(): number {
        const ballRadius = 10; // Match the visual ball size
        const paddleWidth = 10;
        const paddleHeight = 40;
        
        // Move ball
        this.gameState.ballPosX += (this.xDir * 2.1);
        this.gameState.ballPosY += (this.yDir * 1.8);
        
        // Update velocity for state tracking
        this.gameState.ballVelX = this.xDir * 2;
        this.gameState.ballVelY = this.yDir * 2;
        
        // Top wall collision
        if (this.gameState.ballPosY - ballRadius <= this.minY) {
            this.yDir = Math.abs(this.yDir);
            this.gameState.ballPosY = this.minY + ballRadius;
        }
        
        // Bottom wall collision  
        if (this.gameState.ballPosY + ballRadius >= this.maxY) {
            this.yDir = -Math.abs(this.yDir);
            this.gameState.ballPosY = this.maxY - ballRadius;
        }
        
        // Right paddle collision - paddle at x=(maxX - paddleWidth)
        if (this.xDir > 0 && this.gameState.ballPosX + ballRadius >= (this.maxX - paddleWidth)) {
            const rightPaddleTop = this.gameState.player2Pos || 0;
            const rightPaddleBottom = rightPaddleTop + paddleHeight;
            
            // Check if ball center is within paddle's Y range
            if (this.gameState.ballPosY >= rightPaddleTop && 
                this.gameState.ballPosY <= rightPaddleBottom) {
                
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
                
                // Reset ball position to just left of paddle
                this.gameState.ballPosX = this.maxX - paddleWidth - ballRadius;
                console.log('✅ Right paddle hit!');
            } else if (this.gameState.ballPosX + ballRadius >= this.maxX) {
                // Player 2 missed - Player 1 scores
                this.updateScoreBoard(1);
                return 1;
            }
        }
        
        // Left paddle collision - paddle at x=0
        if (this.xDir < 0 && this.gameState.ballPosX - ballRadius <= paddleWidth) {
            const leftPaddleTop = this.gameState.player1Pos || 0;
            const leftPaddleBottom = leftPaddleTop + paddleHeight;
            
            // Check if ball center is within paddle's Y range
            if (this.gameState.ballPosY >= leftPaddleTop && 
                this.gameState.ballPosY <= leftPaddleBottom) {
                
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
                
                // Reset ball position to just right of paddle
                this.gameState.ballPosX = paddleWidth + ballRadius;
                console.log('✅ Left paddle hit!');
            } else if (this.gameState.ballPosX - ballRadius <= this.minX) {
                // Player 1 missed - Player 2 scores
                this.updateScoreBoard(2);
                return 1;
            }
        }
        
        return 0; // No reset needed
    }

    private updateScoreBoard(scoringPlayer: number): void {
        if (scoringPlayer === 1) {
            this.scorePlayer1++;
            this.gameState.scorePlayer1 = this.scorePlayer1;
        } else if (scoringPlayer === 2) {
            this.scorePlayer2++;
            this.gameState.scorePlayer2 = this.scorePlayer2;
        }
        
        const scoreMessage = {
            type: 'score',
            gameId: this.gameState.gameId,
            scorePlayer1: this.gameState.scorePlayer1,
            scorePlayer2: this.gameState.scorePlayer2,
            timestamp: Date.now()
        };

        broadcastToGame(this.gameState.gameId, scoreMessage);
        this.updateDatabaseState();
    }

    broadcastGameState(): void {
        const stateMessage = {
            type: 'gameState',
            gameId: this.gameState.gameId,
            state: {
                ballPosX: this.gameState.ballPosX,
                ballPosY: this.gameState.ballPosY,
                player1Pos: this.gameState.player1Pos,
                player2Pos: this.gameState.player2Pos,
                scorePlayer1: this.gameState.scorePlayer1,
                scorePlayer2: this.gameState.scorePlayer2,
                timestamp: Date.now()
            }
        };
        
        broadcastToGame(this.gameState.gameId, stateMessage);
    }

    updatePlayerPosition(playerId: number, position: number): void {
        const clampedPosition = Math.max(0, Math.min(position, 160));
        
        if (playerId === 1) {
            this.gameState.player1Pos = clampedPosition;
        } else if (playerId === 2) {
            this.gameState.player2Pos = clampedPosition;
        }
    }

    checkGameEnd(): boolean {
        return this.scorePlayer1 >= 3 || this.scorePlayer2 >= 3;
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

    protected updateAIPositions(): void {
        const paddleSpeed = 5;
        const paddleHeight = 40;
        const shouldLog = this.frameCount % 60 === 0 && DEBUG;

        // Right paddle (Player 2) AI - ONLY if Player 2 is AI
        if (this.isPlayerAI(2) && this.gameState.player2Pos !== undefined) {
            if (shouldLog) console.log(`🤖 AI Update for Player 2: ballX=${this.gameState.ballPosX.toFixed(1)}, paddleY=${this.gameState.player2Pos.toFixed(1)}`);
            
            const currentY = this.gameState.player2Pos;
            let targetY = currentY;

            if (this.xDir > 0) {
                const distanceToTravel = 390 - this.gameState.ballPosX;
                const timeToIntercept = distanceToTravel / (Math.abs(this.xDir) * 2.1);
                const predictedY = this.gameState.ballPosY + (this.yDir * 1.8 * timeToIntercept);
                targetY = Math.max(0, Math.min(200 - paddleHeight, predictedY - (paddleHeight / 2)));
            }

            if (Math.abs(targetY - currentY) > paddleSpeed) {
                if (targetY > currentY) {
                    this.updatePlayerPosition(2, currentY + paddleSpeed);
                } else {
                    this.updatePlayerPosition(2, currentY - paddleSpeed);
                }
            }
        }

        // Left paddle (Player 1) AI - ONLY if Player 1 is AI
        if (this.isPlayerAI(1) && this.gameState.player1Pos !== undefined) {
            if (shouldLog) console.log(`🤖 AI Update for Player 1: ballX=${this.gameState.ballPosX.toFixed(1)}, paddleY=${this.gameState.player1Pos.toFixed(1)}`);
            
            const currentY = this.gameState.player1Pos;
            let targetY = currentY;

            if (this.xDir < 0) {
                const distanceToTravel = this.gameState.ballPosX - 10;
                const timeToIntercept = distanceToTravel / (Math.abs(this.xDir) * 2.1);
                const predictedY = this.gameState.ballPosY + (this.yDir * 1.8 * timeToIntercept);
                targetY = Math.max(0, Math.min(200 - paddleHeight, predictedY - (paddleHeight / 2)));
            }

            if (Math.abs(targetY - currentY) > paddleSpeed) {
                if (targetY > currentY) {
                    this.updatePlayerPosition(1, currentY + paddleSpeed);
                } else {
                    this.updatePlayerPosition(1, currentY - paddleSpeed);
                }
            }
        }
    }
}

// 4-Player Game Engine
export class FourPlayerGameEngine extends BaseGameEngine {
    private scores: number[] = [0, 0, 0, 0];
    private playerPositions: number[] = [0, 0, 0, 0];
    private lastContact: number = 0;

    initializeGame(): void {
        // Initialize ball in center
        this.gameState.ballPosX = (this.maxX + this.minX) / 2;
        this.gameState.ballPosY = (this.maxY + this.minY) / 2;
        
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
        
        this.xDir = Math.random() > 0.5 ? 1 : -1;
        this.yDir = Math.random() > 0.5 ? 1 : -1;
    }

    // FIXED 4-PLAYER COLLISION DETECTION
    updateBallPosition(): number {
        const speed = 4;
        const ballRadius = 10;
        const paddleWidth = 10;
        const paddleHeight = 40;
        
        // Calculate next position BEFORE moving
        const nextX = this.gameState.ballPosX + (speed * this.xDir);
        const nextY = this.gameState.ballPosY + (speed * this.yDir);
        
        let collisionHandled = false;
        
        // Top paddle (Player 1) - horizontal paddle at top
        if (nextY - ballRadius <= paddleWidth && this.yDir < 0) {
            const paddleLeft = this.playerPositions[0];
            const paddleRight = this.playerPositions[0] + paddleHeight;
            
            // FIXED: Use nextX instead of this.gameState.ballPosX
            if (nextX >= paddleLeft && nextX <= paddleRight) {
                this.yDir = Math.abs(this.yDir);
                this.gameState.ballPosY = paddleWidth + ballRadius;
                this.lastContact = 1;
                this.addSpinToBall(nextX, paddleLeft, paddleRight, true);
                collisionHandled = true;
                console.log('✅ Top paddle hit!');
            } else if (nextY - ballRadius <= 0) {
                return this.handleGoal();
            }
        }
        
        // Right paddle (Player 2) - vertical paddle at right
        if (!collisionHandled && nextX + ballRadius >= (this.maxX - paddleWidth) && this.xDir > 0) {
            const paddleTop = this.playerPositions[1];
            const paddleBottom = this.playerPositions[1] + paddleHeight;
            
            // FIXED: Use nextY instead of this.gameState.ballPosY
            if (nextY >= paddleTop && nextY <= paddleBottom) {
                this.xDir = -Math.abs(this.xDir);
                this.gameState.ballPosX = this.maxX - paddleWidth - ballRadius;
                this.lastContact = 2;
                this.addSpinToBall(nextY, paddleTop, paddleBottom, false);
                collisionHandled = true;
                console.log('✅ Right paddle hit!');
            } else if (nextX + ballRadius >= this.maxX) {
                return this.handleGoal();
            }
        }
        
        // Bottom paddle (Player 3) - horizontal paddle at bottom
        if (!collisionHandled && nextY + ballRadius >= (this.maxY - paddleWidth) && this.yDir > 0) {
            const paddleLeft = this.playerPositions[2];
            const paddleRight = this.playerPositions[2] + paddleHeight;
            
            // FIXED: Use nextX instead of this.gameState.ballPosX
            if (nextX >= paddleLeft && nextX <= paddleRight) {
                this.yDir = -Math.abs(this.yDir);
                this.gameState.ballPosY = this.maxY - paddleWidth - ballRadius;
                this.lastContact = 3;
                this.addSpinToBall(nextX, paddleLeft, paddleRight, true);
                collisionHandled = true;
                console.log('✅ Bottom paddle hit!');
            } else if (nextY + ballRadius >= this.maxY) {
                return this.handleGoal();
            }
        }
        
        // Left paddle (Player 4) - vertical paddle at left
        if (!collisionHandled && nextX - ballRadius <= paddleWidth && this.xDir < 0) {
            const paddleTop = this.playerPositions[3];
            const paddleBottom = this.playerPositions[3] + paddleHeight;
            
            // FIXED: Use nextY instead of this.gameState.ballPosY
            if (nextY >= paddleTop && nextY <= paddleBottom) {
                this.xDir = Math.abs(this.xDir);
                this.gameState.ballPosX = paddleWidth + ballRadius;
                this.lastContact = 4;
                this.addSpinToBall(nextY, paddleTop, paddleBottom, false);
                collisionHandled = true;
                console.log('✅ Left paddle hit!');
            } else if (nextX - ballRadius <= 0) {
                return this.handleGoal();
            }
        }
        
        // Only move ball if no collision was handled
        if (!collisionHandled) {
            this.gameState.ballPosX = nextX;
            this.gameState.ballPosY = nextY;
        }
        
        // Update velocity for client prediction
        this.gameState.ballVelX = speed * this.xDir;
        this.gameState.ballVelY = speed * this.yDir;
        
        return 0;
    }

    private addSpinToBall(ballPos: number, paddleStart: number, paddleEnd: number, isHorizontal: boolean): void {
        const paddleCenter = (paddleStart + paddleEnd) / 2;
        const hitOffset = ballPos - paddleCenter;
        const maxOffset = paddleHeight / 2;
        const spinFactor = (hitOffset / maxOffset) * 0.5;
        
        if (isHorizontal) {
            this.xDir += spinFactor;
            this.xDir = Math.max(-1.5, Math.min(1.5, this.xDir));
        } else {
            this.yDir += spinFactor;
            this.yDir = Math.max(-1.5, Math.min(1.5, this.yDir));
        }
    }

    private handleGoal(): number {
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
                player1Pos: this.playerPositions[0] || 180,
                player2Pos: this.playerPositions[1] || 180,
                player3Pos: this.playerPositions[2] || 180,
                player4Pos: this.playerPositions[3] || 180,
                scores: this.scores,
                scorePlayer1: this.scores[3] || 0,
                scorePlayer2: this.scores[1] || 0,
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
            scorePlayer1: this.scores[3] || 0,
            scorePlayer2: this.scores[1] || 0,
            timestamp: Date.now()
        };

        broadcastToGame(this.gameState.gameId, scoreUpdate);
    }

    updatePlayerPosition(playerId: number, position: number): void {
        if (playerId >= 1 && playerId <= 4) {
            let clampedPos: number;
            
            if (playerId === 1 || playerId === 3) {
                // Top/Bottom paddles - horizontal movement along X axis
                clampedPos = Math.max(0, Math.min(position, this.maxX - paddleHeight));
            } else {
                // Left/Right paddles - vertical movement along Y axis
                clampedPos = Math.max(0, Math.min(position, this.maxY - paddleHeight));
            }
            
            this.playerPositions[playerId - 1] = clampedPos;
            
            // Also update compatibility fields for 2-player API
            if (playerId === 4) this.gameState.player1Pos = clampedPos; // Left player
            if (playerId === 2) this.gameState.player2Pos = clampedPos; // Right player
        }
    }

    checkGameEnd(): boolean {
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
        }, 1500);
    }

    resetGame(): void {
        this.initializeGame();
        this.frameCount = 0;
        this.lastContact = 0;
        
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
            player1Pos: this.playerPositions[3] || 0, // Left player
            player2Pos: this.playerPositions[1] || 0, // Right player  
            scorePlayer1: this.scores[3] || 0, // Left player score
            scorePlayer2: this.scores[1] || 0, // Right player score
        };
    }

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

    protected updateAIPositions(): void {
        const paddleSpeed = 5;
        const paddleHeight = 40;

        // Player 1 (Top paddle) - Only if AI
        if (this.isPlayerAI(1) && this.playerPositions[0] !== undefined) {
            const currentX = this.playerPositions[0];
            let targetX = currentX;

            if (this.yDir < 0) {
                const distanceToTravel = this.gameState.ballPosY - this.minY;
                const timeToIntercept = distanceToTravel / (Math.abs(this.yDir) * 4);
                const predictedX = this.gameState.ballPosX + (this.xDir * 4 * timeToIntercept);
                targetX = Math.max(0, Math.min(this.maxX - paddleHeight, predictedX - (paddleHeight / 2)));
            }

            if (Math.abs(targetX - currentX) > paddleSpeed) {
                this.updatePlayerPosition(1, currentX + (targetX > currentX ? paddleSpeed : -paddleSpeed));
            }
        }

        // Player 2 (Right paddle) - Only if AI
        if (this.isPlayerAI(2) && this.playerPositions[1] !== undefined) {
            const currentY = this.playerPositions[1];
            let targetY = currentY;

            if (this.xDir > 0) {
                const distanceToTravel = this.maxX - this.gameState.ballPosX;
                const timeToIntercept = distanceToTravel / (this.xDir * 4);
                const predictedY = this.gameState.ballPosY + (this.yDir * 4 * timeToIntercept);
                targetY = Math.max(0, Math.min(this.maxY - paddleHeight, predictedY - (paddleHeight / 2)));
            }

            if (Math.abs(targetY - currentY) > paddleSpeed) {
                this.updatePlayerPosition(2, currentY + (targetY > currentY ? paddleSpeed : -paddleSpeed));
            }
        }

        // Player 3 (Bottom paddle) - Only if AI
        if (this.isPlayerAI(3) && this.playerPositions[2] !== undefined) {
            const currentX = this.playerPositions[2];
            let targetX = currentX;

            if (this.yDir > 0) {
                const distanceToTravel = this.maxY - this.gameState.ballPosY;
                const timeToIntercept = distanceToTravel / (this.yDir * 4);
                const predictedX = this.gameState.ballPosX + (this.xDir * 4 * timeToIntercept);
                targetX = Math.max(0, Math.min(this.maxX - paddleHeight, predictedX - (paddleHeight / 2)));
            }

            if (Math.abs(targetX - currentX) > paddleSpeed) {
                this.updatePlayerPosition(3, currentX + (targetX > currentX ? paddleSpeed : -paddleSpeed));
            }
        }

        // Player 4 (Left paddle) - Only if AI
        if (this.isPlayerAI(4) && this.playerPositions[3] !== undefined) {
            const currentY = this.playerPositions[3];
            let targetY = currentY;

            if (this.xDir < 0) {
                const distanceToTravel = this.gameState.ballPosX - this.minX;
                const timeToIntercept = distanceToTravel / (Math.abs(this.xDir) * 4);
                const predictedY = this.gameState.ballPosY + (this.yDir * 4 * timeToIntercept);
                targetY = Math.max(0, Math.min(this.maxY - paddleHeight, predictedY - (paddleHeight / 2)));
            }

            if (Math.abs(targetY - currentY) > paddleSpeed) {
                this.updatePlayerPosition(4, currentY + (targetY > currentY ? paddleSpeed : -paddleSpeed));
            }
        }
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