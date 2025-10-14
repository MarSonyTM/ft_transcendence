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
    private readonly paddleHeight: number = 40;  // Same as in gameEngine.ts
    private readonly maxPaddleY: number = 160;  // 200 - paddleHeight
    private readonly centerY: number = this.maxPaddleY / 2;
    
    // Difficulty settings
    private settings: {
        updateInterval: number;     // How often AI updates its view (ms)
        predictionError: number;    // Random error in prediction (%)
        reactionDelay: number;      // Delay before responding to ball movement (ms)
        centerOffset: number;       // How far from center to rest position
    };
    
    constructor(
        private playerId: number, 
        private side: 'left' | 'right',
        difficulty: AIDifficulty = 'normal'
    ) {
        // Initialize difficulty settings
        this.settings = this.getDifficultySettings(difficulty);
        console.log(`🤖 AI Player ${playerId} created (${side} side, ${difficulty} difficulty)`);
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
                    updateInterval: 50,      // Fast updates (20fps)
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
            const paddlePos = gameState.paddlePos ?? 80; // Default to center if undefined
            
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
        const paddleY = this.lastView.paddlePos;

        // Predict if ball is coming towards this paddle
        const isComingTowards = (this.side === 'left' && this.lastView.ballVelX < 0) ||
                               (this.side === 'right' && this.lastView.ballVelX > 0);

        // Different behavior based on difficulty
        if (this.settings.predictionError >= 60) { // Easy mode
            // Easy mode: Very slow, inaccurate tracking
            const targetY = ballY + (Math.random() - 0.5) * 80; // Random offset
            const clampedTarget = Math.max(0, Math.min(this.maxPaddleY, targetY));
            
            // Large deadzone - only move if far from target
            if (Math.abs(paddleY - clampedTarget) > 40) {
                this.currentKeys.up = clampedTarget < paddleY;
                this.currentKeys.down = clampedTarget > paddleY;
            } else {
                this.currentKeys.up = false;
                this.currentKeys.down = false;
            }
            return;
        }

        if (this.settings.predictionError >= 15) { // Normal mode
            // Simpler prediction without bounce calculation
            const targetY = ballY + (this.lastView.ballVelY * timeSinceUpdate);
            
            // Add some randomness to make it miss sometimes
            const randomOffset = (Math.random() - 0.5) * 40;
            const adjustedTargetY = Math.max(0, Math.min(this.maxPaddleY, targetY + randomOffset));
            
            if (Math.abs(paddleY - adjustedTargetY) > 20) {
                this.currentKeys.up = adjustedTargetY < paddleY;
                this.currentKeys.down = adjustedTargetY > paddleY;
            } else {
                this.currentKeys.up = false;
                this.currentKeys.down = false;
            }
            return;
        }

        // Hard mode - perfect prediction with wall bounces
        if (isComingTowards) {
            // Calculate where ball will be when it reaches paddle
            const paddleX = this.side === 'left' ? 10 : 390;
            const timeToReach = Math.abs(paddleX - ballX) / Math.abs(this.lastView.ballVelX);
            
            // Predict Y position with wall bounces
            let predictedY = ballY + (this.lastView.ballVelY * timeToReach);
            
            // Handle wall bounces
            while (predictedY < 0 || predictedY > 200) {
                if (predictedY < 0) {
                    predictedY = Math.abs(predictedY);
                } else if (predictedY > 200) {
                    predictedY = 200 - (predictedY - 200);
                }
            }
            
            // Target the center of the paddle to the predicted position
            const targetY = Math.max(0, Math.min(this.maxPaddleY, predictedY - this.paddleHeight / 2));
            
            // Deadzone to prevent jittery movement (3px threshold)
            const deadzone = 3;
            if (Math.abs(paddleY - targetY) > deadzone) {
                this.currentKeys.up = targetY < paddleY;
                this.currentKeys.down = targetY > paddleY;
            } else {
                this.currentKeys.up = false;
                this.currentKeys.down = false;
            }
        } else {
            // Ball moving away - return to center smoothly
            const targetY = this.centerY;
            const deadzone = 8;
            
            if (Math.abs(paddleY - targetY) > deadzone) {
                this.currentKeys.up = targetY < paddleY;
                this.currentKeys.down = targetY > paddleY;
            } else {
                this.currentKeys.up = false;
                this.currentKeys.down = false;
            }
        }
    }
}
