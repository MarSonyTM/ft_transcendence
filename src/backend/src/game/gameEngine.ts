import { get } from "http";
import { GameState, database, Player } from "../database";
import { broadcastToGame } from "../websocket/websocketHandler";
import { AIPongPlayer, AIDifficulty } from "./aiPlayer";

const DEBUG = false;

// Base class with shared functionality
export class BaseGameEngine {
    private gameTimer: NodeJS.Timeout | null = null;
    private frameCount: number = 0;
    private gameState: GameState;
    
    // Game boundaries
    private readonly maxX: number;
    private readonly min: number;
    private readonly maxY: number;
    
    // Ball
    private readonly ballRadius: number;
    private readonly ballSpeed: number;
    private xDir: number = 1;
    private yDir: number = 1;

    // Paddles
    private readonly paddleLength: number;
    private readonly paddleWidth: number;
    private readonly defaultPaddlePos: number;
    private readonly paddleSpeed: number;

    private aiPlayers: Set<number> = new Set();
    private aiPlayerInstances: Map<number, AIPongPlayer> = new Map();

    private lastBroadcastTime: number = 0;
    private readonly BROADCAST_INTERVAL = 16; // Changed from 33ms (30fps) to 16ms (60fps) for smoother updates

    private lastContact: number = 0;

    private playerKeyStates: Map<number, { [key: string]: boolean }> = new Map();

    private lastBroadcastState: {
        ballPosX?: number;
        ballPosY?: number;
        ballVelX?: number;
        ballVelY?: number;
        players?: { pos?: number; score?: number }[];
    } = {};

    constructor(gameState: GameState) {
        this.gameState = gameState;
        const is2P = this.gameState.mode === '2P';
        this.min = 0;
        this.maxX = 400;
        this.maxY = is2P? 200 : 400;
        this.ballRadius = 10;//TODO check -> balldiameter is 10
        this.ballSpeed = 4;
        this.paddleLength = is2P ? 60 : 80;
        this.paddleWidth = 10;
        this.defaultPaddlePos = is2P ? 70 : 160;
        this.paddleSpeed = is2P ? 4 : 8;

        this.initializeGame();
    }

    public getGameValues(): any {
        return {
            mode: this.gameState.mode,
            maxX: this.maxX,
            maxY: this.maxY,
            ballRadius: this.ballRadius,
            ballSpeed: this.ballSpeed,
            paddleHeight: this.paddleLength,
            paddleWidth: this.paddleWidth,
            defaultPaddlePos: this.defaultPaddlePos,
            paddleSpeed: this.paddleSpeed
        };
    }

    private updateDatabaseState(): void {
        try {
            const updateData = this.getUpdateData();
            if (typeof (database.gameState as any).updateGameStateByGameId === 'function') {
                (database.gameState as any).updateGameStateByGameId(this.gameState.gameId, updateData);
            }
        } catch (error) {
            // DB update failed, but game continues
        }
    }

    public startGame(): void {
        if (this.gameTimer)
            return;
        this.gameState.ballPosX = this.maxX / 2;
        this.gameState.ballPosY = this.maxY / 2;
        this.lastBroadcastState = {};
        this.broadcastGameState();
        this.updateDatabaseState();
        this.gameLoop();
    }

    public pauseGame(): void {
        if (this.gameTimer) {
            clearTimeout(this.gameTimer);
            this.gameTimer = null;
        }
        
        broadcastToGame(this.gameState.gameId!, {
            type: 'gamePause',
            gameId: this.gameState.gameId
        });
    }

    public endGame(): void {
        if (this.gameTimer) {
            clearTimeout(this.gameTimer);
            this.gameTimer = null;
        }

        const scoresArr = this.gameState.players.map(p => p.score || 0);
        const maxScore = Math.max(...scoresArr);
        const winnerIndex = scoresArr.findIndex(score => score === maxScore);
        const winnerId = winnerIndex + 1;
        const winnerName = `Player ${this.gameState.players[winnerIndex]?.name || winnerId}`;
        const orientationToSeat: Record<number, string> = this.gameState.mode === '4P'
            ? { 1: 'left', 2: 'top', 3: 'right', 4: 'bottom' }
            : { 1: 'left', 2: 'right' };
        const winnerPos = orientationToSeat[winnerId] ?? 'unknown';

        // Always use game state players (they have isAI and difficulty info)
        // Database players don't have this information
        let gamePlayers: any[] = [];
        
        if (this.gameState.players && this.gameState.players.length > 0) {
            gamePlayers = this.gameState.players.map((player: any, index: number) => {
                const positionId = index + 1; // 1-based position ID
                let actualUserId = positionId;
                
                // Try to find user by username or name (only for non-AI players)
                const playerName = player.username || player.name;
                const isAI = player.isAI || this.isPlayerAI(positionId);
                
                if (!isAI && playerName) {
                    const userByUsername = database.users.getAllUsers().find(
                        u => u.username === playerName
                    );
                    if (userByUsername) {
                        actualUserId = userByUsername.id;
                    }
                }
                
                // Also check if player.id is a valid user ID
                if (!isAI && player.id && typeof player.id === 'number' && player.id > 0 && player.id < 1000) {
                    const userById = database.users.getUserById(player.id);
                    if (userById) {
                        actualUserId = player.id;
                    }
                }
                
                return {
                    id: actualUserId,
                    gameId: this.gameState.gameId,
                    playerId: actualUserId,
                    positionId: positionId, // Store position for AI detection
                    playerPosition: index === 0 ? 'left' : (index === 1 ? 'right' : (index === 2 ? 'top' : 'bottom')),
                    score: player.score || 0,
                    connectionStatus: 'connected',
                    lastActivity: new Date().toISOString(),
                    pos: player.pos || 0,
                    name: playerName || `Player ${index + 1}`,
                    username: playerName,
                    isAI: isAI,
                    difficulty: player.difficulty || undefined
                };
            });
        }
        
        // Build players data for saving with usernames
        const playersData = gamePlayers.map((player: any, index: number) => {
            const positionId = player.positionId || (index + 1); // Use stored positionId or fallback
            const isAIFromEngine = this.isPlayerAI(positionId);
            
            let displayName = '';
            let playerId = player.playerId;
            
            // Check if this player is an AI (check both game engine and player data)
            const playerIsAI = player.isAI !== undefined ? player.isAI : isAIFromEngine;
            
            if (playerIsAI) {
                // Get difficulty from player data or default to Normal
                let difficulty = player.difficulty || 'normal';
                
                // Capitalize first letter
                difficulty = difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase();
                displayName = `AI Bot (${difficulty})`;
                // Use a special ID for AI players (9000 + positionId to avoid conflicts)
                playerId = 9000 + positionId;
            } else {
                // Regular player - check database first
                const user = database.users.getUserById(player.playerId);
                
                if (user) {
                    displayName = user.username;
                } else if (player.name) {
                    // Check if name suggests it's an AI (fallback)
                    if (player.name.toLowerCase().includes('ai') || player.name.toLowerCase().includes('bot')) {
                        const difficulty = player.difficulty || 'Normal';
                        displayName = `AI Bot (${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)})`;
                        // Use a special ID for AI players
                        playerId = 9000 + positionId;
                    } else {
                        displayName = player.name;
                    }
                } else {
                    displayName = `Player ${player.playerId}`;
                }
            }
            
            return {
                id: playerId.toString(),
                username: displayName,
                score: player.score || 0,
                position: player.playerPosition || 'unknown'
            };
        });
        
        // Get actual winner user ID and display name
        const winnerPlayer = gamePlayers[winnerIndex];
        const winnerPlayerData = playersData[winnerIndex];
        
        // For database storage, use the actual user ID (only for non-AI players)
        const isWinnerAI = winnerPlayer ? winnerPlayer.isAI : false;
        let actualWinnerId = winnerPlayer ? winnerPlayer.playerId : winnerId;
        
        // For AI winners, don't set a winnerId (it would violate foreign key constraint)
        // Just set the winner name
        const winnerUser = !isWinnerAI ? database.users.getUserById(actualWinnerId) : null;
        
        // Save game data with players and winner
        const updateData: any = {
            status: 'finished',
            endedAt: new Date().toISOString(),
            players: playersData
        };
        
        // Set winner info based on player type
        if (winnerUser) {
            // Real user won - set both winnerId and winner name
            updateData.winnerId = actualWinnerId;
            updateData.winner = winnerUser.username;
        } else if (winnerPlayerData) {
            // AI or guest won - only set winner name (no winnerId to avoid FK constraint)
            updateData.winner = winnerPlayerData.username;
            // Don't set winnerId for AI/guest players
        } else {
            // Fallback
            updateData.winner = winnerName;
        }
        
        database.games.updateGame(this.gameState.gameId, updateData);

        // Update user statistics for all players
        gamePlayers.forEach((player: any) => {
            // Only update stats for registered users (not AI or local players)
            if (!player.isAI && !player.isLocal && player.playerId && player.playerId > 0 && player.playerId < 1000) {
                const user = database.users.getUserById(player.playerId);
                if (user) {
                    // Check if this player won
                    const didWin = player.positionId === winnerId;
                    database.users.updateUserStats(player.playerId, didWin);
                }
            }
        });

        const gameEndMessage = {
            type: 'gameEnd',
            gameId: this.gameState.gameId,
            mode: this.gameState.mode,
            winner: winnerId,
            winnerName: updateData.winner,
            finalScores: this.gameState.players.map((p, index) => ({
                playerId: index + 1,
                score: p.score || 0
            })),
            message: `🏆 ${updateData.winner} (${winnerPos}) wins with ${maxScore} points!`
        };

        this.updateDatabaseState();
        broadcastToGame(this.gameState.gameId!, gameEndMessage);
        this.updateDatabaseState();
    }

    private gameLoop = (): void => {
        const resetSignal = this.updateBallPosition();

        this.updateAIPositions();
        this.processPlayerInputs();
        
        if (resetSignal === 1) {
            this.resetBall();
        }
        
        if (this.checkGameEnd()) {
            this.endGame();
            return;
        }
        
        this.frameCount++;
        const now = Date.now();
        if (now - this.lastBroadcastTime >= this.BROADCAST_INTERVAL) {
            this.broadcastGameState();
            this.lastBroadcastTime = now;
        }

        this.gameTimer = setTimeout(this.gameLoop, 16);
    }

    public setPlayerAI(playerId: number, isAI: boolean, difficulty: AIDifficulty = 'normal'): void {
        if (isAI) {
            this.aiPlayers.add(playerId);
            try {
                let gameValues = this.getGameValues();
                const aiPlayer = new AIPongPlayer(playerId, difficulty, gameValues);
                this.aiPlayerInstances.set(playerId, aiPlayer);
            } catch (error) {
                console.error(`❌ Error creating AI Player ${playerId}:`, error);
                throw error;
            }
        } else {
            this.aiPlayers.delete(playerId);
            this.aiPlayerInstances.delete(playerId);
        }
    }

    public isPlayerAI(playerId: number): boolean {
        return this.aiPlayers.has(playerId);
    }

    public getAIPlayers(): number[] {
        return Array.from(this.aiPlayers);
    }

    private updateAIPositions(): void {
        const is2P = this.gameState.mode === '2P';
        for (const [playerId, aiPlayer] of this.aiPlayerInstances) {
            if (this.gameState.ballPosX === undefined || this.gameState.ballPosY === undefined) {
                continue;
            }

            let paddlePosAxis: number = this.gameState.players[playerId - 1]?.pos ?? this.defaultPaddlePos;

            const gameView = {
                ballPosX: this.gameState.ballPosX,
                ballPosY: this.gameState.ballPosY,
                ballVelX: this.xDir * 2,
                ballVelY: this.yDir * 2,
                paddlePos: paddlePosAxis,
                lastUpdate: Date.now(),
                maxX: this.maxX,
                maxY: this.maxY,
                paddleLength: this.paddleLength
            };

            aiPlayer.updateAIView(gameView);
            const keys = aiPlayer.getKeyStates();

            const playerIndex = playerId - 1;
            const currentPos = this.gameState.players[playerIndex].pos;
            if (currentPos === undefined || currentPos === null) continue;

            if (is2P || playerId === 1 || playerId === 3) {
                if (keys.up || keys.down) {
                    let newY = currentPos;
                    if (keys.up) newY = Math.max(this.min, currentPos - this.paddleSpeed);
                    if (keys.down) newY = Math.min(this.maxY - this.paddleLength, currentPos + this.paddleSpeed);
                    if (newY !== currentPos) this.updatePlayerPosition(playerId, newY);
                }
            } else {
                if (keys.up || keys.down) {
                    let newX = currentPos;
                    if (keys.up) newX = Math.max(this.min, currentPos - this.paddleSpeed);
                    if (keys.down) newX = Math.min(this.maxX - this.paddleLength, currentPos + this.paddleSpeed);
                    if (newX !== currentPos) this.updatePlayerPosition(playerId, newX);
                }
            }
        }
    }

    public setPlayerKeyState(playerId: number, key: string, pressed: boolean): void {
        if (!this.playerKeyStates.has(playerId)) {
            this.playerKeyStates.set(playerId, {});
        }
        const playerKeys = this.playerKeyStates.get(playerId)!;
        playerKeys[key] = pressed;
    }

    // Process player inputs based on key states
    protected processPlayerInputs(): void {
        this.playerKeyStates.forEach((keys, playerId) => {
            // if (this.isPlayerAI(playerId)) return;//TODO try
            // let curPos = this.gameState.players[playerId - 1].pos;
            // if (curPos === undefined || curPos === null) return;
            // let newPos = curPos;
            // let max = (!is2P && playerId % 2 === 0) ? this.maxX - this.paddleLength : this.maxY - this.paddleLength;

            // if (keys['w'] || keys['o']) newPos = Math.max(this.min, newPos - this.paddleSpeed);
            // if (keys['s'] || keys['l']) newPos = Math.min(max, newPos + this.paddleSpeed);
            // if (newPos != curPos) this.updatePlayerPosition(playerId, newPos);
            const is2P = this.gameState.mode === '2P';
            if ((playerId === 1 || (!is2P && playerId === 3)) && this.gameState.players[playerId - 1].pos !== undefined) {
                let newPos = this.gameState.players[playerId - 1].pos;
                const maxYPos = this.maxY - this.paddleLength;
                if (keys['w']) newPos = Math.max(this.min, newPos - this.paddleSpeed);
                if (keys['s']) newPos = Math.min(maxYPos, newPos + this.paddleSpeed);
                if (newPos !== this.gameState.players[playerId - 1].pos) {
                    this.gameState.players[playerId - 1].pos = newPos;
                }
            }

            if (this.gameState.players[playerId - 1].pos !== undefined) {
                if (is2P && playerId === 2) {
                    // 2-Player Mode: Player 2 (right side, vertical movement)
                    let newPos = this.gameState.players[playerId - 1].pos;
                    const maxYPos = this.maxY - this.paddleLength;
                    // Accept both w/s (remote player) and o/l (local player) keys
                    if (keys['w'] || keys['o']) newPos = Math.max(this.min, newPos - this.paddleSpeed);
                    if (keys['s'] || keys['l']) newPos = Math.min(maxYPos, newPos + this.paddleSpeed);
                    if (newPos !== this.gameState.players[playerId - 1].pos) {
                        this.gameState.players[playerId - 1].pos = newPos;
                    }
                } else if (!is2P && (playerId === 2 || playerId === 4)) {
                    // 4-Player Mode: Players 2 & 4 (top & bottom sides, horizontal movement)
                    let newPos = this.gameState.players[playerId - 1].pos;
                    const maxXPos = this.maxX - this.paddleLength;
                    // Accept both w/s (remote player) and o/l (local player) keys
                    if (keys['w'] || keys['o']) newPos = Math.max(this.min, newPos - this.paddleSpeed);
                    if (keys['s'] || keys['l']) newPos = Math.min(maxXPos, newPos + this.paddleSpeed);
                    if (newPos !== this.gameState.players[playerId - 1].pos) {
                        this.gameState.players[playerId - 1].pos = newPos;
                    }
                } else if (!is2P && playerId === 3) {
                    // 4-Player Mode: Player 3 (right side, vertical movement)
                    let newPos = this.gameState.players[playerId - 1].pos;
                    const maxYPos = this.maxY - this.paddleLength;
                    if (keys['w']) newPos = Math.max(this.min, newPos - this.paddleSpeed);
                    if (keys['s']) newPos = Math.min(maxYPos, newPos + this.paddleSpeed);
                    if (newPos !== this.gameState.players[playerId - 1].pos) {
                        this.gameState.players[playerId - 1].pos = newPos;
                    }
                }
            }
        });
    }

    public getCurrentState(): GameState {
        return { ...this.gameState };
    }

    public getGameId(): number {
        return this.gameState.gameId!;
    }

    public isRunning(): boolean {
        return this.gameTimer !== null;
    }

    private initializeGame(): void {
        const is2P = this.gameState.mode === '2P';
        
        this.gameState.ballPosX = this.maxX / 2;
        this.gameState.ballPosY = this.maxY / 2;
        this.gameState.ballVelX = 0;
        this.gameState.ballVelY = 0;

        this.lastContact = 0;

        const maxPlayers = is2P ? 2 : 4;
        for (let i = 0; i < maxPlayers; i++) {
            this.gameState.players[i].pos = (this.maxY + this.min) / 2 - (this.paddleLength / 2);
            this.gameState.players[i].score = 0;
        }
        
        this.xDir = Math.random() > 0.5 ? 1 : -1;
        this.yDir = Math.random() > 0.5 ? 1 : -1;
    }

    private updateBallPosition(): number {
        const is2P = this.gameState.mode === '2P';
        // const prevX = this.gameState.ballPosX;
        // const prevY = this.gameState.ballPosY;
        
        this.gameState.ballPosX += this.xDir * 2;
        this.gameState.ballPosY += this.yDir * 2;
        
        this.gameState.ballVelX = this.xDir * 2;
        this.gameState.ballVelY = this.yDir * 2;
        
        let paddleStart: number;
        let paddleEnd: number;

        // Left collision
        if (this.xDir < 0 && this.gameState.ballPosX <= this.paddleWidth) {
            paddleStart = this.gameState.players[0].pos || 0;
            paddleEnd = paddleStart + this.paddleLength;

            if (this.gameState.ballPosY + this.ballRadius >= paddleStart && this.gameState.ballPosY - this.ballRadius <= paddleEnd) {
                
                this.lastContact = 1;
                this.xDir = Math.abs(this.xDir);

                const hitPosition = (this.gameState.ballPosY - paddleStart) / this.paddleLength;
                const relativeHit = (hitPosition - 0.5) * 2;
                this.yDir = (this.yDir + relativeHit * 0.8);
                this.yDir += (Math.random() - 0.5) * 0.15;
                if (Math.abs(this.yDir) < 0.4)
                    this.yDir = Math.sign(this.yDir || 1) * 0.4;
                this.addSpinToBall(this.gameState.ballPosY, paddleStart, paddleEnd, false);
                
                if (Math.abs(this.xDir) > this.ballSpeed) this.xDir = Math.sign(this.xDir) * this.ballSpeed;
                if (Math.abs(this.yDir) > this.ballSpeed) this.yDir = Math.sign(this.yDir) * this.ballSpeed;

                this.gameState.ballPosX = this.paddleWidth + this.ballRadius;
            } else {
                if (is2P && this.lastContact === 0) this.lastContact = 2;
                return this.handleGoal();
            }
        }

        // Bottom collision
        if (is2P && this.gameState.ballPosY <= this.ballRadius) {
            this.yDir = Math.abs(this.yDir);
            this.gameState.ballPosY = this.ballRadius;
        }
        else if (!is2P && this.yDir < 0 && this.gameState.ballPosY <= (this.paddleWidth + this.ballRadius)) {
            paddleStart = this.gameState.players[1].pos || 0;
            paddleEnd = paddleStart + this.paddleLength;

            if (this.gameState.ballPosX + this.ballRadius >= paddleStart && this.gameState.ballPosX - this.ballRadius <= paddleEnd) {
                
                this.lastContact = 2;
                this.yDir = Math.abs(this.yDir);

                const hitPosition = (this.gameState.ballPosX - paddleStart) / this.paddleLength;
                const relativeHit = (hitPosition - 0.5) * 2;
                this.xDir = (this.xDir + relativeHit * 0.8);
                this.xDir += (Math.random() - 0.5) * 0.15;
                if (Math.abs(this.xDir) < 0.4)
                    this.xDir = Math.sign(this.xDir || 1) * 0.4;
                this.addSpinToBall(this.gameState.ballPosX, paddleStart, paddleEnd, true);
                
                if (Math.abs(this.yDir) > this.ballSpeed) this.yDir = Math.sign(this.yDir) * this.ballSpeed;
                if (Math.abs(this.xDir) > this.ballSpeed) this.xDir = Math.sign(this.xDir) * this.ballSpeed;

                this.gameState.ballPosY = this.paddleWidth + this.ballRadius;
            } else {
                return this.handleGoal();
            }
        }

        // Right collision
        if (this.xDir > 0 && this.gameState.ballPosX >= (this.maxX - this.ballRadius - this.paddleWidth)) {
            paddleStart = is2P ? this.gameState.players[1].pos || 0 : this.gameState.players[2].pos || 0;
            paddleEnd = paddleStart + this.paddleLength;
            
            if (this.gameState.ballPosY + this.ballRadius >= paddleStart && this.gameState.ballPosY - this.ballRadius <= paddleEnd) {

                this.lastContact = is2P ? 2 : 3;
                this.xDir = -Math.abs(this.xDir);

                const hitPosition = (this.gameState.ballPosY - paddleStart) / this.paddleLength;
                const relativeHit = (hitPosition - 0.5) * 2;
                this.yDir = (this.yDir + relativeHit * 0.8);
                this.yDir += (Math.random() - 0.5) * 0.15;
                if (Math.abs(this.yDir) < 0.4)
                    this.yDir = Math.sign(this.yDir || 1) * 0.4;
                this.addSpinToBall(this.gameState.ballPosY, paddleStart, paddleEnd, false);

                if (Math.abs(this.xDir) > this.ballSpeed) this.xDir = Math.sign(this.xDir) * this.ballSpeed;
                if (Math.abs(this.yDir) > this.ballSpeed) this.yDir = Math.sign(this.yDir) * this.ballSpeed;

                this.gameState.ballPosX = this.maxX - this.paddleWidth - this.ballRadius;
            } else {
                if (is2P && this.lastContact === 0) this.lastContact = 1;
                return this.handleGoal();
            }
        }

        // Top collision
        if (is2P && this.gameState.ballPosY >= this.maxY - this.ballRadius) {
            this.yDir = -Math.abs(this.yDir);
            this.gameState.ballPosY = this.maxY - this.ballRadius;
        }
        else if (!is2P && this.yDir > 0 && this.gameState.ballPosY >= (this.maxY - this.ballRadius - this.paddleWidth)) {
            paddleStart = this.gameState.players[3].pos || 0;
            paddleEnd = paddleStart + this.paddleLength;
            
            if (this.gameState.ballPosX + this.ballRadius >= paddleStart && this.gameState.ballPosX - this.ballRadius <= paddleEnd) {

                this.lastContact = 4;
                this.yDir = -Math.abs(this.yDir);

                const hitPosition = (this.gameState.ballPosX - paddleStart) / this.paddleLength;
                const relativeHit = (hitPosition - 0.5) * 2;
                this.xDir = (this.xDir + relativeHit * 0.8);
                this.xDir += (Math.random() - 0.5) * 0.15;
                if (Math.abs(this.xDir) < 0.4)
                    this.xDir = Math.sign(this.xDir || 1) * 0.4;
                this.addSpinToBall(this.gameState.ballPosX, paddleStart, paddleEnd, true);

                if (Math.abs(this.yDir) > this.ballSpeed) this.yDir = Math.sign(this.yDir) * this.ballSpeed;
                if (Math.abs(this.xDir) > this.ballSpeed) this.xDir = Math.sign(this.xDir) * this.ballSpeed;

                this.gameState.ballPosY = this.maxY - this.paddleWidth - this.ballRadius;
            } else {
                return this.handleGoal();
            }
        }
        
        return 0;
    }

    private addSpinToBall(ballPos: number, paddleStart: number, paddleEnd: number, isHorizontal: boolean): void {
        // Add some variation to ball direction based on where it hits the paddle
        const paddleCenter = (paddleStart + paddleEnd) / 2;//
        const hitOffset = ballPos - paddleCenter;
        const maxOffset = this.paddleLength / 2;
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

    public getPlayerScore(playerId: number): number {
        return this.gameState.players[playerId - 1].score || 0;
    }

    private handleGoal(): number {
        if (this.lastContact > 0 && this.lastContact <= 4 && this.gameState.players[this.lastContact - 1]) {
            if (this.gameState.players[this.lastContact - 1].score === undefined)
                this.gameState.players[this.lastContact - 1].score = 0;
            this.gameState.players[this.lastContact - 1].score! += 1;            
        }
        this.lastContact = 0;
        this.broadcastScoreUpdate();
        this.updateDatabaseState();
        
        return 1;
    }

    private broadcastScoreUpdate(): void {
        const maxPlayers = this.gameState.mode === '2P' ? 2 : 4;
        const players = [];
        for (let i = 0; i < maxPlayers; i++) {
            players.push({
                score: this.gameState.players[i]?.score || 0
            });
        }

        const scoreUpdate = {
            type: 'score',
            gameId: this.gameState.gameId,
            mode: this.gameState.mode,
            players: players,
            timestamp: Date.now()
        };

        broadcastToGame(this.gameState.gameId!, scoreUpdate);
    }

    broadcastGameState(): void {
        const delta: any = {};
        let hasChanges = false;
        
        if (this.gameState.ballPosX === undefined) this.gameState.ballPosX = this.maxX / 2;
        if (this.gameState.ballPosY === undefined) this.gameState.ballPosY = this.maxY / 2;
        if (this.gameState.ballVelX === undefined) this.gameState.ballVelX = 0;
        if (this.gameState.ballVelY === undefined) this.gameState.ballVelY = 0;

        // Ball position (always changes, so always include)
        if (this.lastBroadcastState.ballPosX === undefined || this.gameState.ballPosX !== this.lastBroadcastState.ballPosX) {
            delta.ballPosX = this.gameState.ballPosX;
            this.lastBroadcastState.ballPosX = this.gameState.ballPosX;
            hasChanges = true;
        }
        if (this.lastBroadcastState.ballPosY === undefined || this.gameState.ballPosY !== this.lastBroadcastState.ballPosY) {
            delta.ballPosY = this.gameState.ballPosY;
            this.lastBroadcastState.ballPosY = this.gameState.ballPosY;
            hasChanges = true;
        }
        if (this.lastBroadcastState.ballVelX === undefined || this.gameState.ballVelX !== this.lastBroadcastState.ballVelX) {
            delta.ballVelX = this.gameState.ballVelX;
            this.lastBroadcastState.ballVelX = this.gameState.ballVelX;
            hasChanges = true;
        }
        if (this.lastBroadcastState.ballVelY === undefined || this.gameState.ballVelY !== this.lastBroadcastState.ballVelY) {
            delta.ballVelY = this.gameState.ballVelY;
            this.lastBroadcastState.ballVelY = this.gameState.ballVelY;
            hasChanges = true;
        }
        
        const maxPlayers = this.gameState.mode === '2P' ? 2 : 4;
        for (let i = 0; i < maxPlayers; i++) {
            // Skip if player entry missing
            if (!this.gameState.players?.[i]) continue;

            if (!delta.players) delta.players = [];
            if (!delta.players[i]) delta.players[i] = {};

            if (!this.lastBroadcastState.players) this.lastBroadcastState.players = [];
            if (!this.lastBroadcastState.players[i]) this.lastBroadcastState.players[i] = {};

            const prev = this.lastBroadcastState.players[i];
            const curr = this.gameState.players[i];

            if (prev.pos === undefined || curr.pos !== prev.pos) {
                delta.players[i].pos = curr.pos;
                prev.pos = curr.pos;
                hasChanges = true;
            }
            if (prev.score === undefined || curr.score !== prev.score) {
                delta.players[i].score = curr.score;
                prev.score = curr.score;
                hasChanges = true;
            }
        }
        // Only broadcast if something actually changed
        if (hasChanges) {
            const message = {
                type: 'gameState',
                gameId: this.gameState.gameId,
                mode: this.gameState.mode,
                state: delta  // Only changed values!
            };
            
            broadcastToGame(this.gameState.gameId!, message);
        }
    }

    updatePlayerPosition(playerId: number, position: number): void {
        const is2P = this.gameState.mode === '2P';
        let clampedPos: number;
        if (playerId >= 1 && playerId <= (is2P ? 2 : 4) && this.gameState.players[playerId - 1]) {
            // if (is2P || playerId === 1 || playerId === 3)//TODO try
            //     clampedPos = Math.max(0, Math.min(position, this.maxY - this.paddleLength));
            // else
            //     clampedPos = Math.max(0, Math.min(position, this.maxX - this.paddleLength));
            if (is2P) {
                clampedPos = Math.max(0, Math.min(position, this.maxY - this.paddleLength));
            } else {
                if (playerId === 1 || playerId === 3)
                    clampedPos = Math.max(0, Math.min(position, this.maxY - this.paddleLength));
                else
                    clampedPos = Math.max(0, Math.min(position, this.maxX - this.paddleLength));
            }
            const isAI = this.isPlayerAI(playerId);

            this.gameState.players[playerId - 1].pos = clampedPos;
        }
    }

    resetBall(): void {
        // Reset ball to center
        this.gameState.ballPosX = this.maxX / 2;
        this.gameState.ballPosY = this.maxY / 2;
        this.gameState.ballVelX = 0;
        this.gameState.ballVelY = 0;
        this.lastContact = 0;
        
        // Random direction
        this.xDir = Math.random() > 0.5 ? 1 : -1;
        this.yDir = Math.random() > 0.5 ? 1 : -1;

        // Force fresh delta tracking after reset
        this.lastBroadcastState = {};
        
        this.broadcastGameState();
        this.updateDatabaseState();
        
        const resetMessage = {
            type: 'ballReset',
            gameId: this.gameState.gameId,
            message: 'Ball reset - get ready!',
        };
        broadcastToGame(this.gameState.gameId!, resetMessage);
        
        // Brief pause before resuming
        setTimeout(() => {
            this.broadcastGameState();
        }, 1500);
    }

    resetGame(): void {
        this.initializeGame();
        this.frameCount = 0;
        this.lastContact = 0;

        // Force fresh delta tracking after reset
        this.lastBroadcastState = {};
        
        this.updateDatabaseState();
        this.broadcastGameState();
    }

    checkGameEnd(): boolean {
        return this.gameState.players.some(p => (p.score || 0) >= (this.gameState.mode === '4P' ? 5 : 3));
    }

    private getUpdateData(): any {
        return {
            ballPosX: this.gameState.ballPosX,
            ballPosY: this.gameState.ballPosY,
            ballVelX: this.gameState.ballVelX,
            ballVelY: this.gameState.ballVelY,
            players: this.gameState.players.map((p) => ({ pos: p.pos, score: p.score }))
        };
    }
}

// Factory function to create the appropriate game engine
export function createGameEngine(gameState: GameState, mode: string): BaseGameEngine {
    gameState.mode = mode;
    if (mode === '2P' || mode === '4P')
        return new BaseGameEngine(gameState);
    else
        throw new Error(`Unsupported game mode: ${mode}`);
}

export const GameEngine = BaseGameEngine;