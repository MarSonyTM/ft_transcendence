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
        console.log(`🤖 AI Player ${playerId} created (${side} side, ${difficulty} difficulty)`, this.settings);
    }

    private getDifficultySettings(difficulty: AIDifficulty) {
        switch (difficulty) {
            case 'easy':
                return {
                    updateInterval: 1000,    // Very slow updates (once per second)
                    predictionError: 35,     // Very inaccurate
                    reactionDelay: 1000,     // Very slow reactions
                    centerOffset: 100        // Large random movement
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
                    updateInterval: 16,      // 60fps updates
                    predictionError: 0,      // Perfect prediction
                    reactionDelay: 0,        // Instant reactions
                    centerOffset: 0          // Perfect positioning
                };
        }
    }

    // This gets called every frame but only updates view once per second
    updateAIView(gameState: any): void {
        const now = Date.now();
        
        // Only update view based on difficulty setting
        if (now - this.lastUpdateTime >= this.settings.updateInterval) {
            this.lastView = {
                ballPosX: gameState.ballPosX,
                ballPosY: gameState.ballPosY,
                ballVelX: gameState.ballVelX || 0,
                ballVelY: gameState.ballVelY || 0,
                paddlePos: this.side === 'left' ? gameState.player1Pos : gameState.player2Pos,
                lastUpdate: now
            };
            this.lastUpdateTime = now;
            
            // Make decision based on new view
            this.decideMovement();
            
            // Log AI's view and decision
            console.log(`🤖 AI Player ${this.playerId} view update:`, {
                ballPos: `(${this.lastView.ballPosX.toFixed(1)}, ${this.lastView.ballPosY.toFixed(1)})`,
                ballVel: `(${this.lastView.ballVelX.toFixed(1)}, ${this.lastView.ballVelY.toFixed(1)})`,
                paddlePos: this.lastView.paddlePos.toFixed(1),
                decision: this.currentKeys
            });
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
        if (this.settings.predictionError >= 35) { // Easy mode
            // Easy mode: Just slowly move towards the ball's Y position
            // No prediction, no fancy calculations
            
            // Only move every few updates to make it slower
            if (Math.random() > 0.5) { // 50% chance to not move at all
                this.currentKeys.up = false;
                this.currentKeys.down = false;
                return;
            }

            // Move very slowly (large threshold means less precise movement)
            const moveThreshold = 50; // Only move if ball is far away
            const distanceToMove = ballY - paddleY;

            if (Math.abs(distanceToMove) > moveThreshold) {
                // Move in wrong direction sometimes (20% chance)
                if (Math.random() < 0.2) {
                    this.currentKeys.up = distanceToMove > 0;
                    this.currentKeys.down = distanceToMove < 0;
                } else {
                    this.currentKeys.up = distanceToMove < 0;
                    this.currentKeys.down = distanceToMove > 0;
                }
            } else {
                // Stop moving when somewhat close
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
            }
            return;
        }

        // Hard mode - original good AI behavior
        if (isComingTowards) {
            let targetY;
                // Advanced ball trajectory prediction
                const paddleX = this.side === 'left' ? 0 : 400;
                const distanceX = Math.abs(paddleX - predictedBallX);
                
                // Calculate time with increased speed anticipation
                const anticipatedSpeed = Math.abs(this.lastView.ballVelX) * 1.2; // Assume ball will speed up
                const timeToReach = distanceX / (anticipatedSpeed * ballAcceleration);
                
                // Predict future position with acceleration and spin
                let intersectY = predictedBallY + (this.lastView.ballVelY * timeToReach * ballAcceleration);
                let velocityY = this.lastView.ballVelY * 1.2; // Anticipate increased vertical speed
                
                // Enhanced bounce prediction
                const bounceCount = Math.floor(Math.abs(intersectY) / 200);
                for (let i = 0; i < bounceCount; i++) {
                    velocityY = -velocityY * 1.15; // More aggressive bounce effect
                    intersectY = velocityY > 0 ? 
                        Math.abs(intersectY % 200) : 
                        200 - Math.abs(intersectY % 200);
                }
                
                // Dynamic strategic positioning
                const ballSpeed = Math.sqrt(
                    Math.pow(this.lastView.ballVelX, 2) + 
                    Math.pow(this.lastView.ballVelY, 2)
                );
                
                // Adjust strategic offset based on ball speed
                const baseOffset = Math.min(25, Math.abs(velocityY) * 2.5);
                const speedMultiplier = Math.min(2, ballSpeed / 10);
                const strategicOffset = baseOffset * speedMultiplier;
                
                // Calculate optimal hit position
                let hitPosition;
                if (this.settings.predictionError < 0) { // Hard mode specific
                    // Try to hit with the edge that will create the most difficult return
                    const edgeOffset = Math.min(30, ballSpeed * 1.5);
                    hitPosition = velocityY > 0 ?
                        Math.min(intersectY + edgeOffset, this.maxPaddleY - 5) : // Bottom edge
                        Math.max(intersectY - edgeOffset, 5); // Top edge
                    
                    // Add slight randomization to be less predictable
                    hitPosition += (Math.random() - 0.5) * 3;
                } else {
                    hitPosition = intersectY;
                }
                
                targetY = hitPosition;
                
                // Advanced anticipation for fast balls
                if (ballSpeed > 15) {
                    // Prepare for extreme angles and high speeds
                    const anticipationOffset = (velocityY > 0 ? 15 : -15) * (ballSpeed / 20);
                    targetY = Math.max(5, Math.min(this.maxPaddleY - 5, targetY + anticipationOffset));
                }
            } else {
                // Normal and Easy modes use simpler prediction
                const timeToReach = this.side === 'left' ? 
                    predictedBallX / Math.abs(this.lastView.ballVelX) :
                    (400 - predictedBallX) / Math.abs(this.lastView.ballVelX);
                
                const intersectY = predictedBallY + (this.lastView.ballVelY * timeToReach);
                const maxError = (this.paddleHeight * this.settings.predictionError) / 100;
                targetY = intersectY + (Math.random() * maxError - maxError/2);
            }

            // Clamp target position to valid range
            targetY = Math.max(0, Math.min(this.maxPaddleY, targetY));

            // More aggressive movement in hard mode
            const positionThreshold = this.settings.predictionError === 0 ? 1 : 10;
            const moveSpeed = this.settings.predictionError === 0 ? 1 : 5;
            
            const distance = Math.abs(this.lastView.paddlePos - targetY);
            if (distance > positionThreshold) {
                // Proportional movement speed based on distance
                this.currentKeys.up = targetY < this.lastView.paddlePos;
                this.currentKeys.down = targetY > this.lastView.paddlePos;
            } else {
                this.currentKeys.up = false;
                this.currentKeys.down = false;
            }
        } else {
            if (this.settings.predictionError < 0) { // Hard mode
                // Calculate ball's current speed and direction
                const ballSpeed = Math.sqrt(
                    Math.pow(this.lastView.ballVelX, 2) + 
                    Math.pow(this.lastView.ballVelY, 2)
                );
                const ballAngle = Math.atan2(this.lastView.ballVelY, this.lastView.ballVelX);
                
                // Predict where the ball might return
                const predictedReturnY = this.lastView.ballPosY + 
                    (Math.sin(ballAngle) * ballSpeed * 2);
                
                // Position strategically based on predicted return
                let strategicY = this.centerY;
                
                if (ballSpeed > 10) {
                    // For fast balls, prepare for quick returns
                    strategicY += (predictedReturnY > this.centerY ? 20 : -20);
                } else {
                    // For slower balls, stay closer to the predicted return point
                    strategicY = this.centerY + 
                        (predictedReturnY - this.centerY) * 0.3;
                }
                
                // Add slight movement to make AI less predictable
                strategicY += Math.sin(Date.now() / 1000) * 5;
                
                // Ensure we stay within bounds
                const targetY = Math.max(5, Math.min(this.maxPaddleY - 5, strategicY));
                
                // Move more precisely
                if (Math.abs(this.lastView.paddlePos - targetY) > 0.5) {
                    this.currentKeys.up = targetY < this.lastView.paddlePos;
                    this.currentKeys.down = targetY > this.lastView.paddlePos;
                } else {
                    this.currentKeys.up = false;
                    this.currentKeys.down = false;
                }
            } else {
                // Normal and Easy modes use center positioning with offset
                const targetY = this.centerY + 
                    (Math.random() * this.settings.centerOffset - this.settings.centerOffset/2);
                
                if (Math.abs(this.lastView.paddlePos - targetY) > 5) {
                    this.currentKeys.up = this.lastView.paddlePos > targetY;
                    this.currentKeys.down = this.lastView.paddlePos < targetY;
                } else {
                    this.currentKeys.up = false;
                    this.currentKeys.down = false;
                }
            }
        }
    }
}
