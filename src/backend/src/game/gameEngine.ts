import { GameState, database } from "../database";
import { broadcastToGame, getGameConnectionCount } from "../websocket/websocketHandler";

const DEBUG = false;

// Global constants
const maxX = 400;
const minX = 0;
const maxY2P = 200;
const maxY4P = 400;
const minY = 0;
const ballRadius = 10;
const paddleHeight2P = 40;
const paddleHeight4P = 80;
const paddleWidth = 10;

interface GameEngineOptions {
    maxX?: number;
    minX?: number;
    maxY2P?: number;
    maxY4P?: number;
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
    protected readonly maxY2P: number;
    protected readonly maxY4P: number;
    protected readonly minY: number;
    
    // Ball movement
    protected xDir: number = 1;
    protected yDir: number = 1;

    protected aiPlayers: Set<number> = new Set();

    constructor(gameState: GameState, options?: GameEngineOptions) {
        this.gameState = gameState;
        
        this.maxX = (options?.maxX ?? maxX) - ballRadius;
        this.minX = (options?.minX ?? minX) + ballRadius;
        this.maxY2P = (options?.maxY2P ?? maxY2P) - ballRadius;
        this.maxY4P = (options?.maxY4P ?? maxY4P) - ballRadius;
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
            if (typeof (database.gameState as any).updateGameStateByGameId === 'function') {
                (database.gameState as any).updateGameStateByGameId(this.gameState.gameId, updateData);
            }
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
        
        this.frameCount++;
        this.broadcastGameState();

        if (this.frameCount % 30 === 0) {
            this.updateDatabaseState();
        }

        this.gameTimer = setTimeout(this.gameLoop, 16);
    }

    public setPlayerAI(playerId: number, isAI: boolean): void {
        if (isAI) {
            this.aiPlayers.add(playerId);
            console.log(`Player ${playerId} marked as AI`);
        } else {
            this.aiPlayers.delete(playerId);
            console.log(`Player ${playerId} marked as human`);
        }
    }

    public isPlayerAI(playerId: number): boolean {
        return this.aiPlayers.has(playerId);
    }

    public getAIPlayers(): number[] {
        return Array.from(this.aiPlayers);
    }

    protected updateAIPositions(): void {
        const paddleSpeed = 4;
        const paddleHeight = 40;

        // Only log every 60 frames (once per second)
        const shouldLog = this.frameCount % 60 === 0;

        // Right paddle (Player 2) AI - ONLY if Player 2 is AI
        if (this.isPlayerAI(2) && this.gameState.players[1].pos !== undefined) {
            if (shouldLog) console.log(`🤖 AI Update for Player 2: ballX=${this.gameState.ballPosX.toFixed(1)}, paddleY=${this.gameState.players[1].pos.toFixed(1)}`);
            
            const currentY = this.gameState.players[1].pos;
            let targetY = currentY;

            if (this.xDir > 0) {
                const distanceToTravel = 390 - this.gameState.ballPosX;
                const timeToIntercept = distanceToTravel / (this.xDir * 2.1);
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
        } else if (shouldLog && this.gameState.players[1].pos !== undefined) {
            console.log(`👤 Skipping AI update for Player 2 (Human player)`);
        }

        // Left paddle (Player 1) AI - ONLY if Player 1 is AI
        if (this.isPlayerAI(1) && this.gameState.players[0].pos !== undefined) {
            if (shouldLog) console.log(`🤖 AI Update for Player 1: ballX=${this.gameState.ballPosX.toFixed(1)}, paddleY=${this.gameState.players[0].pos.toFixed(1)}`);
            
            const currentY = this.gameState.players[0].pos;
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
        } else if (shouldLog && this.gameState.players[0].pos !== undefined) {
            console.log(`👤 Skipping AI update for Player 1 (Human player)`);
        }
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

    initializeGame(): void {
        console.log('🔍 [DEBUG] initializeGame() called');
        
        // Initialize ball in center if not set
        if (!this.gameState.ballPosX)
            this.gameState.ballPosX = (this.maxX + this.minX) / 2;
        if (!this.gameState.ballPosY)
            this.gameState.ballPosY = (this.maxY2P + this.minY) / 2;
        if (this.gameState.players[0].pos === undefined)
            this.gameState.players[0].pos = (this.maxY2P + this.minY) / 2 - (paddleHeight2P / 2);
        if (this.gameState.players[1].pos === undefined)
            this.gameState.players[1].pos = (this.maxY2P + this.minY) / 2 - (paddleHeight2P / 2);

        // Initialize scores
        if (this.gameState.players[0].score === undefined)
            this.gameState.players[0].score = 0;
        if (this.gameState.players[1].score === undefined)
            this.gameState.players[1].score = 0;
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
        if (this.gameState.ballPosY >= this.maxY2P) {
            this.yDir = -Math.abs(this.yDir);
            this.gameState.ballPosY = this.maxY2P;
        }
        
        // Right paddle collision - paddle is at x=390 (canvas width 400 - paddle width 10)
        if (this.xDir > 0 && this.gameState.ballPosX >= (390 - ballRadius)) {
            const rightPaddleTop = this.gameState.players[1].pos || 0;
            const rightPaddleBottom = rightPaddleTop + paddleHeight2P;
            
            // Check if ball hits paddle
            if (this.gameState.ballPosY >= rightPaddleTop && 
                this.gameState.ballPosY <= rightPaddleBottom) {
                
                const hitPosition = (this.gameState.ballPosY - rightPaddleTop) / paddleHeight2P;
                const relativeHit = (hitPosition - 0.5) * 2; // -1 to 1 range
                
                // Reverse and slightly increase speed
                this.xDir = -Math.abs(this.xDir);
                this.yDir = (this.yDir + relativeHit * 0.8);
                
                // Add tiny random element
                this.yDir += (Math.random() - 0.5) * 0.15;
                
                // Prevent too-shallow angles
                if (Math.abs(this.yDir) < 0.4) {
                    this.yDir = Math.sign(this.yDir || 1) * 0.4;
                }
                
                // Cap maximum speed
                const maxSpeed = 4;
                if (Math.abs(this.xDir) > maxSpeed) this.xDir = Math.sign(this.xDir) * maxSpeed;
                if (Math.abs(this.yDir) > maxSpeed) this.yDir = Math.sign(this.yDir) * maxSpeed;
                
                this.gameState.ballPosX = 390 - ballRadius;
            } else if (this.gameState.ballPosX >= 400) {
                this.updateScoreBoard(1);
                return 1;
            }
        }
        
        // Left paddle collision - paddle is at x=0
        if (this.xDir < 0 && this.gameState.ballPosX <= (paddleWidth + ballRadius)) {
            const leftPaddleTop = this.gameState.players[0].pos || 0;
            const leftPaddleBottom = leftPaddleTop + paddleHeight2P;
            
            // Check if ball hits paddle
            if (this.gameState.ballPosY >= leftPaddleTop && 
                this.gameState.ballPosY <= leftPaddleBottom) {
                
                const hitPosition = (this.gameState.ballPosY - leftPaddleTop) / paddleHeight2P;
                const relativeHit = (hitPosition - 0.5) * 2; // -1 to 1 range
                
                // Reverse and slightly increase speed
                this.xDir = Math.abs(this.xDir);
                this.yDir = (this.yDir + relativeHit * 0.8);
                
                // Add tiny random element
                this.yDir += (Math.random() - 0.5) * 0.15;
                
                // Prevent too-shallow angles
                if (Math.abs(this.yDir) < 0.4) {
                    this.yDir = Math.sign(this.yDir || 1) * 0.4;
                }
                
                // Cap maximum speed
                const maxSpeed = 4;
                if (Math.abs(this.xDir) > maxSpeed) this.xDir = Math.sign(this.xDir) * maxSpeed;
                if (Math.abs(this.yDir) > maxSpeed) this.yDir = Math.sign(this.yDir) * maxSpeed;
                
                this.gameState.ballPosX = paddleWidth + ballRadius;
            } else if (this.gameState.ballPosX <= 0) {
                // Missed paddle - Goal for Player 2
                this.updateScoreBoard(2);
                return 1;
            }
        }
        
        return 0;
    }

    broadcastGameState(): void {
        const gameState = {
            type: 'gameState',
            gameId: this.gameState.gameId,
            mode: '2P',
            state: {
                ballPosX: this.gameState.ballPosX,
                ballPosY: this.gameState.ballPosY,
                ballVelX: this.gameState.ballVelX,
                ballVelY: this.gameState.ballVelY,
                players: this.gameState.players,
                frameCount: this.frameCount,
                timestamp: Date.now()
            }
        };

        broadcastToGame(this.gameState.gameId, gameState);
    }

    updatePlayerPosition(playerId: number, position: number): void {
    const clampedPos = Math.max(0, Math.min(position, maxY2P - paddleHeight2P));
    
    const isAI = this.isPlayerAI(playerId);
    console.log(`🎮 Position update for Player ${playerId}: ${clampedPos.toFixed(1)} (${isAI ? '🤖 AI' : '👤 Human'})`);

    this.gameState.players[playerId - 1].pos = clampedPos;
}

    private updateScoreBoard(player: number): void {
        this.gameState.players[player - 1].score += 1;
        this.broadcastScoreUpdate();
        this.updateDatabaseState();
    }

    private broadcastScoreUpdate(): void {
        const scoreUpdate = {
            type: 'score',
            gameId: this.gameState.gameId,
            mode: '2P',
            players: this.gameState.players,
            timestamp: Date.now()
        };

        broadcastToGame(this.gameState.gameId, scoreUpdate);
    }

    checkGameEnd(): boolean {
        return this.gameState.players[0]?.score >= 3 || this.gameState.players[1]?.score >= 3;
    }

    endGame(): void {
        const winner = this.gameState.players[0]?.score >= 3 ? 1 : 2;

        const gameEndMessage = {
            type: 'gameEnd',
            gameId: this.gameState.gameId,
            winner: winner,
            finalScore: {
                player1: this.gameState.players[0]?.score,
                player2: this.gameState.players[1]?.score
            },
            timestamp: Date.now()
        };
        broadcastToGame(this.gameState.gameId, gameEndMessage);
    }

    resetBall(): void {
        this.gameState.ballPosX = (this.maxX + this.minX) / 2;
        this.gameState.ballPosY = (this.maxY2P + this.minY) / 2;
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
        this.gameState.ballPosY = (this.maxY2P + this.minY) / 2;
        this.gameState.ballVelX = 0;
        this.gameState.ballVelY = 0;
        this.gameState.players[0].pos = (this.maxY2P + this.minY) / 2 - (paddleHeight2P / 2);
        this.gameState.players[1].pos = (this.maxY2P + this.minY) / 2 - (paddleHeight2P / 2);
        this.gameState.players[0].score = 0;
        this.gameState.players[1].score = 0;
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
            ballVelY: this.gameState.ballVelY
        };
    }
}

// 4-Player Game Engine - MINIMAL IMPLEMENTATION FOR COMPILATION
export class FourPlayerGameEngine extends BaseGameEngine {
    private lastContact: number = 0;

    initializeGame(): void {
        // Initialize ball in center
        this.gameState.ballPosX = (this.maxX + this.minX) / 2;
        this.gameState.ballPosY = (this.maxY4P + this.minY) / 2;
        
        // Ensure players array exists and has 4 entries
        if (!Array.isArray(this.gameState.players)) {
            this.gameState.players = [] as any;
        }
        const defaultPos = (this.maxX - this.minX) / 2 - paddleHeight4P / 2;
        for (let i = this.gameState.players.length; i < 4; i++) {
            this.gameState.players.push({
                id: i + 1,
                gameId: this.gameState.gameId,
                pos: defaultPos,
                material: null as any,
                color: { r: 1, g: 1, b: 1 },
                score: 0,
                connectionStatus: 'connected',
                lastActivity: new Date().toISOString()
            } as any);
        }
    }

    updateBallPosition(): number {        
        // Move ball first
        this.gameState.ballPosX += this.xDir * 2.1;
        this.gameState.ballPosY += this.yDir * 1.8;
        
        // Update velocity for client prediction
        this.gameState.ballVelX = this.xDir * 2;
        this.gameState.ballVelY = this.yDir * 2;

        // Left paddle (Player ID 1 / players[0]) - vertical paddle at left
        if (this.gameState.ballPosX <= (this.minX + paddleWidth) && this.xDir < 0) {
            const paddleTop = this.gameState.players[0]?.pos ?? 0;
            const paddleBottom = paddleTop + paddleHeight4P;
            
            if (this.gameState.ballPosY >= paddleTop && this.gameState.ballPosY <= paddleBottom) {
                this.xDir = Math.abs(this.xDir); // Bounce right
                this.gameState.ballPosX = this.minX + paddleWidth;
                this.lastContact = 1; // Player ID 1
                this.addSpinToBall(this.gameState.ballPosY, paddleTop, paddleBottom, false);
            }
        }

        // Top paddle (Player ID 2 / players[1]) - horizontal paddle at top
        if (this.gameState.ballPosY <= (this.minY + paddleWidth) && this.yDir < 0) {
            const paddleLeft = this.gameState.players[1]?.pos ?? 0;
            const paddleRight = paddleLeft + paddleHeight4P;
            
            if (this.gameState.ballPosX >= paddleLeft && this.gameState.ballPosX <= paddleRight) {
                this.yDir = Math.abs(this.yDir); // Bounce down
                this.gameState.ballPosY = this.minY + paddleWidth;
                this.lastContact = 2; // Player ID 2
                this.addSpinToBall(this.gameState.ballPosX, paddleLeft, paddleRight, true);
            }
        }

        // Right paddle (Player ID 3 / players[2]) - vertical paddle at right
        if (this.gameState.ballPosX >= (this.maxX - paddleWidth) && this.xDir > 0) {
            const paddleTop = this.gameState.players[2]?.pos ?? 0;
            const paddleBottom = paddleTop + paddleHeight4P;
            
            if (this.gameState.ballPosY >= paddleTop && this.gameState.ballPosY <= paddleBottom) {
                this.xDir = -Math.abs(this.xDir); // Bounce left
                this.gameState.ballPosX = this.maxX - paddleWidth;
                this.lastContact = 3; // Player ID 3
                this.addSpinToBall(this.gameState.ballPosY, paddleTop, paddleBottom, false);
            }
        }
        
        // Bottom paddle (Player ID 4 / players[3]) - horizontal paddle at bottom
        if (this.gameState.ballPosY >= (this.maxY4P - paddleWidth) && this.yDir > 0) {
            const paddleLeft = this.gameState.players[3]?.pos ?? 0;
            const paddleRight = paddleLeft + paddleHeight4P;
            
            if (this.gameState.ballPosX >= paddleLeft && this.gameState.ballPosX <= paddleRight) {
                this.yDir = -Math.abs(this.yDir); // Bounce up
                this.gameState.ballPosY = this.maxY4P - paddleWidth;
                this.lastContact = 4; // Player ID 4
                this.addSpinToBall(this.gameState.ballPosX, paddleLeft, paddleRight, true);
            }
        }

        if (this.gameState.ballPosX <= this.minX || this.gameState.ballPosX >= this.maxX ||
            this.gameState.ballPosY <= this.minY || this.gameState.ballPosY >= this.maxY4P)
            return this.handleGoal();

        return 0;
    }

    private addSpinToBall(ballPos: number, paddleStart: number, paddleEnd: number, isHorizontal: boolean): void {
        // Add some variation to ball direction based on where it hits the paddle
        const paddleCenter = (paddleStart + paddleEnd) / 2;
        const hitOffset = ballPos - paddleCenter;
        const maxOffset = paddleHeight4P / 2;
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
        if (this.lastContact > 0 && this.lastContact <= 4) {
            if (this.gameState.players[this.lastContact - 1])
                this.gameState.players[this.lastContact - 1].score += 1;
        }
        
        this.broadcastScoreUpdate();
        this.updateDatabaseState();
        
        return 1;
    }

    broadcastGameState(): void {
        const gameState = {
            type: 'gameState',
            gameId: this.gameState.gameId,
            mode: '4P',
            state: {
                ballPosX: this.gameState.ballPosX,
                ballPosY: this.gameState.ballPosY,
                ballVelX: this.gameState.ballVelX,
                ballVelY: this.gameState.ballVelY,
                players: this.gameState.players,
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
            mode: '4P',
            players: this.gameState.players,
            timestamp: Date.now()
        };

        broadcastToGame(this.gameState.gameId, scoreUpdate);
    }

    updatePlayerPosition(playerId: number, position: number): void {
        if (playerId >= 1 && playerId <= 4) {
            let clampedPos: number;
            
            if (playerId === 1 || playerId === 3) {
                clampedPos = Math.max(0, Math.min(position, maxY4P - paddleHeight4P));
            } else {
                clampedPos = Math.max(0, Math.min(position, maxX - paddleHeight4P));
            }
            
            this.gameState.players[playerId - 1].pos = clampedPos;
        }
    }

    checkGameEnd(): boolean {
        return this.gameState.players.some(p => (p.score || 0) >= 5);
    }

    endGame(): void {
        const scoresArr = this.gameState.players.map(p => p.score || 0);
        const maxScore = Math.max(...scoresArr);
        const winnerId = scoresArr.findIndex(score => score === maxScore) + 1;
        // Map orientation to UI numbering: UI: 1=Left, 2=Top, 3=Right, 4=Bottom
        const orientationToUiMap: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4 };
        const orientationToSeat: Record<number, string> = { 1: 'left', 2: 'top', 3: 'right', 4: 'bottom' };
        const winnerUiNumber = orientationToUiMap[winnerId] ?? winnerId;
        const winnerSeat = orientationToSeat[winnerId] ?? 'unknown';
        
        const gameEndMessage = {
            type: 'gameEnd',
            gameId: this.gameState.gameId,
            mode: '4P',
            winner: winnerId,
            winnerSeat,
            winnerUiNumber,
            winnerName: `Player ${winnerUiNumber}`,
            players: this.gameState.players,
            timestamp: Date.now()
        };
        broadcastToGame(this.gameState.gameId, gameEndMessage);
        
    }

    resetBall(): void {
        // Reset ball to center
        this.gameState.ballPosX = (this.maxX + this.minX) / 2;
        this.gameState.ballPosY = (this.maxY4P + this.minY) / 2;
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
            ballVelY: this.gameState.ballVelY
        };
    }

    // Helper methods for 4-player mode
    protected updateAIPositions(): void {
        const paddleSpeed = 8;
        const paddleHeight = 80;

        // Player 1 (Right paddle) - Only if AI
        if (this.isPlayerAI(1) && this.gameState.players[0].pos !== undefined) {
            const currentY = this.gameState.players[0].pos;
            let targetY = currentY;

            if (this.xDir > 0) {
                const distanceToTravel = this.maxX - this.gameState.ballPosX;
                const timeToIntercept = distanceToTravel / (this.xDir * 2.1);
                const predictedY = this.gameState.ballPosY + (this.yDir * 1.8 * timeToIntercept);
                targetY = Math.max(0, Math.min(this.maxY4P - paddleHeight, predictedY - (paddleHeight / 2)));
            }

            if (Math.abs(targetY - currentY) > paddleSpeed) {
                this.updatePlayerPosition(1, currentY + (targetY > currentY ? paddleSpeed : -paddleSpeed));
            }
        }

        // Player 2 (Top paddle) - Only if AI
        if (this.isPlayerAI(2) && this.gameState.players[1].pos !== undefined) {
            const currentX = this.gameState.players[1].pos;
            let targetX = currentX;

            if (this.yDir < 0) {
                const distanceToTravel = this.gameState.ballPosY - this.minY;
                const timeToIntercept = distanceToTravel / (Math.abs(this.yDir) * 1.8);
                const predictedX = this.gameState.ballPosX + (this.xDir * 2.1 * timeToIntercept);
                targetX = Math.max(0, Math.min(this.maxX - paddleHeight, predictedX - (paddleHeight / 2)));
            }

            if (Math.abs(targetX - currentX) > paddleSpeed) {
                this.updatePlayerPosition(2, currentX + (targetX > currentX ? paddleSpeed : -paddleSpeed));
            }
        }

        // Player 3 (Bottom paddle) - Only if AI
        if (this.isPlayerAI(3) && this.gameState.players[2].pos !== undefined) {
            const currentX = this.gameState.players[2].pos;
            let targetX = currentX;

            if (this.yDir > 0) {
                const distanceToTravel = this.maxY4P - this.gameState.ballPosY;
                const timeToIntercept = distanceToTravel / (this.yDir * 1.8);
                const predictedX = this.gameState.ballPosX + (this.xDir * 2.1 * timeToIntercept);
                targetX = Math.max(0, Math.min(this.maxX - paddleHeight, predictedX - (paddleHeight / 2)));
            }

            if (Math.abs(targetX - currentX) > paddleSpeed) {
                this.updatePlayerPosition(3, currentX + (targetX > currentX ? paddleSpeed : -paddleSpeed));
            }
        }

        // Player 4 (Left paddle) - Only if AI
        if (this.isPlayerAI(4) && this.gameState.players[3].pos !== undefined) {
            const currentY = this.gameState.players[3].pos;
            let targetY = currentY;

            if (this.xDir < 0) {
                const distanceToTravel = this.gameState.ballPosX - this.minX;
                const timeToIntercept = distanceToTravel / (Math.abs(this.xDir) * 2.1);
                const predictedY = this.gameState.ballPosY + (this.yDir * 1.8 * timeToIntercept);
                targetY = Math.max(0, Math.min(this.maxY4P - paddleHeight, predictedY - (paddleHeight / 2)));
            }

            if (Math.abs(targetY - currentY) > paddleSpeed) {
                this.updatePlayerPosition(4, currentY + (targetY > currentY ? paddleSpeed : -paddleSpeed));
            }
        }
    }
}

// Factory function to create the appropriate game engine
export function createGameEngine(gameState: GameState, mode: string, options?: GameEngineOptions): BaseGameEngine {
    const gameOptions = mode === '4P' ? {
        maxX: maxX,
        minX: minX,
        maxY4P: maxY4P,
        minY: minY
    } : {
        maxX: maxX,
        minX: minX,
        maxY2P: maxY2P,
        minY: minY
    };

    switch (mode) {
        case '2P':
            return new TwoPlayerGameEngine(gameState, gameOptions);
        case '4P':
            return new FourPlayerGameEngine(gameState, gameOptions);
        default:
            throw new Error(`Unsupported game mode: ${mode}`);
    }
}

export const GameEngine = TwoPlayerGameEngine;