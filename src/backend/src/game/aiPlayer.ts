interface AIGameView {
    ballPosX: number;
    ballPosY: number;
    ballVelX: number;
    ballVelY: number;
    paddlePos: number;
    lastUpdate: number;
}

export type AIDifficulty = 'easy' | 'normal' | 'hard';

export class AIPongPlayer {
    private lastView: AIGameView | null = null;
    private lastUpdateTime: number = 0;
    private currentKeys: { up: boolean; down: boolean } = { up: false, down: false };
    private readonly max: number;
    private readonly maxPaddle: number;
    private readonly center: number;
    private readonly sides: string[];
    private readonly side: string;

    // Difficulty settings
    private settings: {
        updateInterval: number;     // How often AI updates its view (ms)
        predictionError: number;    // Random error in prediction (%)
        reactionDelay: number;      // Delay before responding to ball movement (ms)
        centerOffset: number;       // How far from center to rest position
    };
    
    constructor(
        private playerId: number,
        difficulty: AIDifficulty = 'normal',
        private values: {
            mode: string,
            maxX: number,
            maxY: number,
            ballRadius: number,
            paddleHeight: number,
            paddleWidth: number,
            defaultPaddlePos: number,
            paddleSpeed: number
        }
    ) {
        this.sides = values.mode === '2P' ? ['left', 'right'] : ['left', 'top', 'right', 'bottom'];
        this.side = this.sides[(playerId - 1) % this.sides.length];
        this.max = this.side === 'left' || this.side === 'right' ? this.values.maxX : this.values.maxY;
        this.maxPaddle = this.max - values.paddleHeight;
        this.center = this.maxPaddle / 2;
         
        // Initialize difficulty settings
        this.settings = this.getDifficultySettings(difficulty);
        console.log(`🤖 AI Player ${playerId} created (${difficulty} difficulty)`);
    }

    private getDifficultySettings(difficulty: AIDifficulty) {
        switch (difficulty) {
            case 'easy':
                return {
                    updateInterval: 500,     // Slow updates (twice per second)
                    predictionError: 60,     // Very inaccurate
                    reactionDelay: 800,      // Very slow reactions
                    centerOffset: 80         // Large random movement
                };
            case 'normal':
                return {
                    updateInterval: 100,     // Moderate updates
                    predictionError: 15,     // Basic prediction
                    reactionDelay: 200,      // Moderate reactions
                    centerOffset: 20         // Some randomness
                };
            case 'hard':
                return {
                    updateInterval: 50,      // Fast updates (20fps for very responsive movement)
                    predictionError: 0,      // Perfect prediction
                    reactionDelay: 0,        // Instant reactions
                    centerOffset: 0          // Perfect positioning
                };
        }
    }

    // This gets called every frame but only updates view once per second
    updateAIView(gameState: any): void {
        const now = Date.now();
        
        // Safety check - ensure required game state exists
        if (!gameState || gameState.ballPosX === undefined || gameState.ballPosY === undefined) {
            console.log(`⚠️ AI Player ${this.playerId} - invalid game state, skipping update`);
            return;
        }
        
        // Only update view based on difficulty setting
        if (now - this.lastUpdateTime >= this.settings.updateInterval) {
            const paddlePos = gameState.paddlePos ?? this.center; // Default to center if undefined
            
            this.lastView = {
                ballPosX: gameState.ballPosX,
                ballPosY: gameState.ballPosY,
                ballVelX: gameState.ballVelX || 0,
                ballVelY: gameState.ballVelY || 0,
                paddlePos: paddlePos,
                lastUpdate: now
            };
            this.lastUpdateTime = now;
            
            // Make decision based on new view
            this.decideMovement();
        }
    }

    // Returns current key states
    getKeyStates(): { up: boolean; down: boolean } {
        return this.currentKeys;
    }

    private decideMovement(): void {
        if (!this.lastView) return;

        // Calculate time since last view
        const timeSinceUpdate = (Date.now() - this.lastView.lastUpdate) / 1000;

        // Get current ball position
        const ballX = this.lastView.ballPosX;
        const ballY = this.lastView.ballPosY;
        const paddle = this.lastView.paddlePos;

        let target: number;
        let clampedTarget: number;
        let paddlePos: number;
        let predicted: number;
        let ball: number;
        let ballVel: number;

        // Predict if ball is coming towards this paddle
        const isComingTowards = (this.side === 'left' && this.lastView.ballVelX < 0) ||
                               (this.side === 'right' && this.lastView.ballVelX > 0) ||
                               (this.side === 'top' && this.lastView.ballVelY < 0) ||
                               (this.side === 'bottom' && this.lastView.ballVelY > 0);

        ball = this.side === 'left' || this.side === 'right' ? ballX : ballY;
        ballVel = this.side === 'left' || this.side === 'right' ? this.lastView.ballVelX : this.lastView.ballVelY;

        // Different behavior based on difficulty
        if (this.settings.predictionError >= 60) { // Easy mode
            // Easy mode: Very slow, inaccurate tracking
            target = this.side === 'left' || this.side === 'right' ?
                ballY + (Math.random() - 0.5) * 80 :
                ballX + (Math.random() - 0.5) * 80;
            clampedTarget = this.side === 'left' || this.side === 'right' ? 
                Math.max(0, Math.min(this.maxPaddle, target)) :
                Math.max(0, Math.min(this.maxPaddle, target));
            // Large deadzone - only move if far from target
            if (Math.abs(paddle - clampedTarget) > 40) {
                this.currentKeys.up = clampedTarget < paddle;
                this.currentKeys.down = clampedTarget > paddle;
            } else {
                this.currentKeys.up = false;
                this.currentKeys.down = false;
            }
            return;
        }

        if (this.settings.predictionError >= 15) { // Normal mode
            // Simpler prediction without bounce calculation
            target = this.side === 'left' || this.side === 'right' ?
                ballY + (this.lastView.ballVelY * timeSinceUpdate) :
                ballX + (this.lastView.ballVelX * timeSinceUpdate);
            
            // Add some randomness to make it miss sometimes
            const randomOffset = (Math.random() - 0.5) * 40;
            const adjustedTarget = Math.max(0, Math.min(this.maxPaddle, target + randomOffset));
            
            if (Math.abs(paddle - adjustedTarget) > 20) {
                this.currentKeys.up = adjustedTarget < paddle;
                this.currentKeys.down = adjustedTarget > paddle;
            } else {
                this.currentKeys.up = false;
                this.currentKeys.down = false;
            }
            return;
        }

        // Hard mode - perfect prediction with wall bounces
        if (isComingTowards) {
            // Calculate where ball will be when it reaches paddle
                paddlePos = this.side === 'left' || this.side === 'top' ?
                    this.values.paddleWidth : this.max - this.values.paddleWidth;
                const timeToReach = Math.abs(paddle - ball) / Math.abs(ballVel);
                
                // Predict position with wall bounces
                const perpVel = this.side === 'left' || this.side === 'right' ? 
                    this.lastView.ballVelY : this.lastView.ballVelX;
                const perpPos = this.side === 'left' || this.side === 'right' ?
                    this.lastView.ballPosY : this.lastView.ballPosX;
                
                predicted = perpPos + (perpVel * timeToReach);
                
                // Handle multiple wall bounces accurately
                while (predicted < 0 || predicted > this.max) {
                    if (predicted < 0) {
                        predicted = Math.abs(predicted);
                    } else if (predicted > this.max) {
                        predicted = this.max - (predicted - this.max);
                    }
                }
                
                // Target the center of the paddle to the predicted position
                target = Math.max(0, Math.min(this.maxPaddle, predicted - this.values.paddleHeight / 2));
                
                // Very small deadzone for precise movement (2px threshold)
                const deadzone = 2;
                if (Math.abs(paddle - target) > deadzone) {
                    this.currentKeys.up = target < paddle;
                    this.currentKeys.down = target > paddle;
                } else {
                    this.currentKeys.up = false;
                    this.currentKeys.down = false;
                }
            // }
        } else {
            // Ball moving away - return to center aggressively
            const target = this.center;
            const deadzone = 2;
            
            if (Math.abs(paddle - target) > deadzone) {
                this.currentKeys.up = target < paddle;
                this.currentKeys.down = target > paddle;
            } else {
                this.currentKeys.up = false;
                this.currentKeys.down = false;
            }
        }
    }
}
