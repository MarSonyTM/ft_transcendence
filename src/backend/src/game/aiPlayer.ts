interface AIGameView {
    ballPosX: number;
    ballPosY: number;
    ballVelX: number;  // pixels/second
    ballVelY: number;  // pixels/second
    paddlePos: number;
    lastUpdate: number;
}

export type AIDifficulty = 'easy' | 'normal' | 'hard';

export class AIPongPlayer {
    private lastView: AIGameView | null = null;
    private lastUpdateTime: number = 0;
    private currentKeys: { up: boolean; down: boolean } = { up: false, down: false };
    private currentPaddlePos: number = 0; // Updated every frame
    private readonly max: number;
    private readonly maxPaddle: number;
    private readonly center: number;
    private readonly sides: string[];
    private readonly side: string;

    // Difficulty settings
    private settings: {
        updateInterval: number;     // How often AI updates its view (ms) - must be 1000ms
        predictionError: number;    // Random error in prediction (pixels)
        reactionDelay: number;      // Not used currently
        centerOffset: number;       // Not used currently
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
        console.log(`   Settings: predictionError=${this.settings.predictionError}px, updateInterval=${this.settings.updateInterval}ms`);
    }

    private getDifficultySettings(difficulty: AIDifficulty) {
        switch (difficulty) {
            case 'easy':
                return {
                    updateInterval: 1000,    // Once per second (as required)
                    predictionError: 100,     // Large random error (pixels) - makes AI miss often
                    reactionDelay: 800,
                    centerOffset: 80
                };
            case 'normal':
                return {
                    updateInterval: 1000,    // Once per second (as required)
                    predictionError: 20,     // Moderate random error (pixels)
                    reactionDelay: 200,
                    centerOffset: 20
                };
            case 'hard':
                return {
                    updateInterval: 1000,    // Once per second (as required)
                    predictionError: 0,      // No random error
                    reactionDelay: 0,
                    centerOffset: 0
                };
        }
    }

    // This gets called every frame but only updates VIEW once per second
    // However, DECISIONS are made every frame using the last view
    updateAIView(gameState: any): void {
        const now = Date.now();
        
        // Safety check
        if (!gameState || gameState.ballPosX === undefined || gameState.ballPosY === undefined) {
            return;
        }
        
        // Update paddle position every frame (it changes every frame)
        this.currentPaddlePos = gameState.paddlePos ?? this.center;
        
        // Only update VIEW (ball position/velocity) once per second (as required)
        if (now - this.lastUpdateTime >= this.settings.updateInterval) {
            this.lastView = {
                ballPosX: gameState.ballPosX,
                ballPosY: gameState.ballPosY,
                ballVelX: gameState.ballVelX || 0,
                ballVelY: gameState.ballVelY || 0,
                paddlePos: this.currentPaddlePos,
                lastUpdate: now
            };
            this.lastUpdateTime = now;
        }
        
        // Make decision every frame (using last view and extrapolating forward)
        this.decideMovement();
    }

    // Returns current key states
    getKeyStates(): { up: boolean; down: boolean } {
        return this.currentKeys;
    }

    private decideMovement(): void {
        if (!this.lastView) {
            // No view yet - return to center
            this.moveTowardsTarget(this.center);
            return;
        }

        // Calculate time elapsed since last view update (in seconds)
        const timeSinceViewUpdate = (Date.now() - this.lastView.lastUpdate) / 1000;

        // Get ball position and velocity from last view
        const ballX = this.lastView.ballPosX;
        const ballY = this.lastView.ballPosY;
        const ballVelX = this.lastView.ballVelX;  // pixels/second
        const ballVelY = this.lastView.ballVelY;  // pixels/second

        // Determine which axis this paddle moves on
        const isVerticalPaddle = this.side === 'left' || this.side === 'right';
        
        // Get the relevant ball position and velocity for this paddle's axis
        const ballPosOnAxis = isVerticalPaddle ? ballY : ballX;
        const ballVelOnAxis = isVerticalPaddle ? ballVelY : ballVelX;
        const ballPosTowardsPaddle = isVerticalPaddle ? ballX : ballY;
        const ballVelTowardsPaddle = isVerticalPaddle ? ballVelX : ballVelY;

        // Determine if ball is coming towards this paddle
        let isComingTowards = false;
        if (this.side === 'left') {
            isComingTowards = ballVelX < 0 && ballPosTowardsPaddle > this.values.paddleWidth;
        } else if (this.side === 'right') {
            isComingTowards = ballVelX > 0 && ballPosTowardsPaddle < (this.values.maxX - this.values.paddleWidth);
        } else if (this.side === 'top') {
            isComingTowards = ballVelY < 0 && ballPosTowardsPaddle > this.values.paddleWidth;
        } else if (this.side === 'bottom') {
            isComingTowards = ballVelY > 0 && ballPosTowardsPaddle < (this.values.maxY - this.values.paddleWidth);
        }

        let target: number;

        if (isComingTowards) {
            // Easy mode: Only react when ball is close to paddle (makes it easier to beat)
            if (this.settings.predictionError >= 100) {
                const paddleCourtPos = this.side === 'left' || this.side === 'top' ?
                    this.values.paddleWidth : 
                    (this.side === 'right' ? this.values.maxX - this.values.paddleWidth : this.values.maxY - this.values.paddleWidth);
                const distanceToPaddle = Math.abs(paddleCourtPos - ballPosTowardsPaddle);
                
                // Only start moving when ball is within 100 pixels (slow reaction)
                if (distanceToPaddle > 100) {
                    // Ball too far - just return to center slowly
                    target = this.center;
                } else {
                    // Ball is close - predict where it will be (but with errors)
                    target = this.predictBallPosition(
                        ballPosOnAxis,
                        ballVelOnAxis,
                        ballPosTowardsPaddle,
                        ballVelTowardsPaddle,
                        timeSinceViewUpdate
                    );
                }
            } else if (this.settings.predictionError >= 80) {
                // Medium easy mode (if we add more levels later)
                const paddleCourtPos = this.side === 'left' || this.side === 'top' ?
                    this.values.paddleWidth : 
                    (this.side === 'right' ? this.values.maxX - this.values.paddleWidth : this.values.maxY - this.values.paddleWidth);
                const distanceToPaddle = Math.abs(paddleCourtPos - ballPosTowardsPaddle);
                
                if (distanceToPaddle > 150) {
                    target = this.center;
                } else {
                    target = this.predictBallPosition(
                        ballPosOnAxis,
                        ballVelOnAxis,
                        ballPosTowardsPaddle,
                        ballVelTowardsPaddle,
                        timeSinceViewUpdate
                    );
                }
            } else {
                // Normal/Hard mode: Always predict
                target = this.predictBallPosition(
                    ballPosOnAxis,
                    ballVelOnAxis,
                    ballPosTowardsPaddle,
                    ballVelTowardsPaddle,
                    timeSinceViewUpdate
                );
            }
        } else {
            // Ball moving away - return to center
            target = this.center;
        }

        // Move towards target
        this.moveTowardsTarget(target);
    }

    private predictBallPosition(
        ballPosOnAxis: number,
        ballVelOnAxis: number,
        ballPosTowardsPaddle: number,
        ballVelTowardsPaddle: number,
        timeSinceUpdate: number
    ): number {
        // First, extrapolate ball's CURRENT position (since last view was timeSinceUpdate seconds ago)
        // The ball has moved since the last view update
        let currentBallPosOnAxis = ballPosOnAxis + (ballVelOnAxis * timeSinceUpdate);
        let currentBallPosTowardsPaddle = ballPosTowardsPaddle + (ballVelTowardsPaddle * timeSinceUpdate);

        // Handle bounces that may have occurred since last view
        currentBallPosOnAxis = this.calculateBounces(currentBallPosOnAxis, ballVelOnAxis, timeSinceUpdate);
        
        // Calculate where the paddle is on the court
        const paddleCourtPos = this.side === 'left' || this.side === 'top' ?
            this.values.paddleWidth : 
            (this.side === 'right' ? this.values.maxX - this.values.paddleWidth : this.values.maxY - this.values.paddleWidth);

        // Calculate time until ball reaches paddle (in seconds) from CURRENT position
        // Avoid division by zero
        if (Math.abs(ballVelTowardsPaddle) < 0.1) {
            // Ball moving very slowly or stopped - just track current position
            return this.clampTarget(currentBallPosOnAxis);
        }

        const distanceToPaddle = Math.abs(paddleCourtPos - currentBallPosTowardsPaddle);
        const timeToReach = distanceToPaddle / Math.abs(ballVelTowardsPaddle);

        // Predict where ball will be on our axis after timeToReach seconds from CURRENT position
        let predictedPos = currentBallPosOnAxis + (ballVelOnAxis * timeToReach);

        // Handle wall bounces during timeToReach
        predictedPos = this.calculateBounces(predictedPos, ballVelOnAxis, timeToReach);

        // Add difficulty-based error
        if (this.settings.predictionError > 0) {
            const error = (Math.random() - 0.5) * this.settings.predictionError;
            predictedPos += error;
            
            // Easy mode: Add even more randomness - sometimes just guess randomly
            if (this.settings.predictionError >= 100 && Math.random() < 0.22) {
                // 22% chance to just use a random position instead of prediction
                predictedPos = Math.random() * this.max;
            }
        }

        return this.clampTarget(predictedPos);
    }

    private calculateBounces(predictedPos: number, velocity: number, totalTime: number): number {
        // Simple bounce calculation using reflection
        // If predicted position is out of bounds, reflect it
        let pos = predictedPos;
        
        // Handle bounces by reflecting the position
        while (pos < 0 || pos > this.max) {
            if (pos < 0) {
                // Bounce off top/left wall
                pos = -pos;
            } else if (pos > this.max) {
                // Bounce off bottom/right wall
                pos = 2 * this.max - pos;
            }
            
            // Safety check to prevent infinite loops
            if (pos < -this.max * 2 || pos > this.max * 3) {
                // Something went wrong, clamp to bounds
                pos = Math.max(0, Math.min(this.max, pos));
                break;
            }
        }
        
        return pos;
    }

    private clampTarget(target: number): number {
        // Clamp to valid paddle range and center paddle on target
        const centeredTarget = target - (this.values.paddleHeight / 2);
        return Math.max(0, Math.min(this.maxPaddle, centeredTarget));
    }

    private moveTowardsTarget(target: number): void {
        // Use current paddle position (updated every frame)
        const paddle = this.currentPaddlePos;

        // Calculate deadzone based on difficulty
        let deadzone: number;
        if (this.settings.predictionError >= 100) {
            // Easy mode: Large deadzone (50px) - AI is imprecise and lazy
            deadzone = 50;
        } else if (this.settings.predictionError >= 80) {
            // Medium easy mode: Moderate deadzone
            deadzone = 35;
        } else if (this.settings.predictionError > 0) {
            // Normal mode: Moderate deadzone
            deadzone = Math.max(5, this.settings.predictionError / 4);
        } else {
            // Hard mode: Small deadzone for precision
            deadzone = 2;
        }

        const distance = Math.abs(paddle - target);

        // Easy mode: Sometimes don't move at all (15% chance) to make it easier
        if (this.settings.predictionError >= 100 && Math.random() < 0.15) {
            this.currentKeys.up = false;
            this.currentKeys.down = false;
            return;
        }
        
        // Medium easy mode: Sometimes don't move at all (8% chance)
        if (this.settings.predictionError >= 80 && this.settings.predictionError < 100 && Math.random() < 0.08) {
            this.currentKeys.up = false;
            this.currentKeys.down = false;
            return;
        }

        if (distance > deadzone) {
            this.currentKeys.up = target < paddle;
            this.currentKeys.down = target > paddle;
        } else {
            // Close enough - stop moving
            this.currentKeys.up = false;
            this.currentKeys.down = false;
        }
    }
}
