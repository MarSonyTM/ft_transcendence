/**
 * AIGameView Interface
 * 
 * Represents a snapshot of the game state that the AI "sees" when it updates its view.
 * The AI only gets this information once per second (as per subject requirements),
 * so it must use this data to predict where the ball will be.
 */
interface AIGameView {
    ballPosX: number;      // Ball's X position on the court
    ballPosY: number;      // Ball's Y position on the court
    ballVelX: number;      // Ball's velocity in X direction (pixels/second)
    ballVelY: number;      // Ball's velocity in Y direction (pixels/second)
    paddlePos: number;     // Current paddle position along its movement axis
    lastUpdate: number;    // Timestamp (ms) when this view was captured
}

/**
 * AI Difficulty Levels
 * 
 * Three difficulty levels that control how accurate and responsive the AI is:
 * - easy: Large prediction errors, slow reactions, makes many mistakes
 * - normal: Moderate errors, balanced difficulty
 * - hard: Perfect prediction, very challenging
 */
export type AIDifficulty = 'easy' | 'normal' | 'hard';

/**
 * AIPongPlayer Class
 * 
 * Implements an AI opponent that simulates human keyboard input.
 * Key constraints:
 * - Must simulate keyboard input (not direct paddle control)
 * - Can only update its view once per second (1000ms)
 * - Must predict ball position and handle bounces
 * - Uses physics-based trajectory prediction (NOT A* algorithm)
 */
export class AIPongPlayer {
    // Last snapshot of the game state (updated once per second)
    private lastView: AIGameView | null = null;
    
    // Timestamp of when the view was last updated (used to enforce once-per-second constraint)
    private lastUpdateTime: number = 0;
    
    /**
     * KEYBOARD SIMULATION - This is how the AI replicates human behavior.
     * The AI sets these boolean flags, just like a human pressing keys.
     * The game engine treats these identically to human keyboard input.
     */
    private currentKeys: { up: boolean; down: boolean } = { up: false, down: false };
    
    // Current paddle position (updated every frame for accurate movement decisions)
    private currentPaddlePos: number = 0;
    
    // Game boundaries and calculated values
    private readonly max: number;           // Maximum position along paddle's movement axis
    private readonly maxPaddle: number;     // Maximum valid paddle position (max - paddleHeight)
    private readonly center: number;       // Center position (where paddle rests when ball is away)
    private readonly sides: string[];      // Available sides based on game mode
    private readonly side: string;         // Which side this AI controls (left/right/top/bottom)

    /**
     * Difficulty Settings
     * Controls AI behavior and accuracy based on selected difficulty level
     */
    private settings: {
        updateInterval: number;     // How often AI updates its view (ms) - MUST be 1000ms per requirements
        predictionError: number;    // Random error added to predictions (pixels) - larger = less accurate
        reactionDelay: number;      // Reserved for future use
        centerOffset: number;       // Reserved for future use
    };
    
    /**
     * Constructor
     * 
     * Initializes the AI player with game configuration and difficulty settings.
     * 
     * @param playerId - Which player this AI controls (1, 2, 3, or 4)
     * @param difficulty - Difficulty level (easy/normal/hard)
     * @param values - Game configuration (court size, paddle size, speeds, etc.)
     */
    constructor(
        private playerId: number,
        difficulty: AIDifficulty = 'normal',
        private values: {
            mode: string,              // Game mode: '2P' or '4P'
            maxX: number,              // Court width
            maxY: number,              // Court height
            ballRadius: number,        // Ball radius
            paddleHeight: number,      // Paddle length
            paddleWidth: number,       // Paddle thickness
            defaultPaddlePos: number,  // Default starting position
            paddleSpeed: number        // Pixels per frame movement speed
        }
    ) {
        // Determine which sides are valid based on game mode
        this.sides = values.mode === '2P' ? ['left', 'right'] : ['left', 'top', 'right', 'bottom'];
        
        // Calculate which side THIS AI is on (Player 1=left, Player 2=right/top, etc.)
        this.side = this.sides[(playerId - 1) % this.sides.length];
        
        // Set maximum boundary based on paddle orientation
        // Vertical paddles (left/right) move along Y axis, horizontal (top/bottom) move along X axis
        this.max = this.side === 'left' || this.side === 'right' ? this.values.maxX : this.values.maxY;
        
        // Maximum valid paddle position (can't go past court edge)
        this.maxPaddle = this.max - values.paddleHeight;
        
        // Center position (where paddle should rest when ball is away)
        this.center = this.maxPaddle / 2;
         
        // Initialize difficulty-specific settings
        this.settings = this.getDifficultySettings(difficulty);
    }

    private getDifficultySettings(difficulty: AIDifficulty) {
        switch (difficulty) {
            case 'easy':
                return {
                    updateInterval: 1000,    // Once per second (as required by subject)
                    predictionError: 100,     // Large random error (±100px) - makes AI miss often
                    reactionDelay: 800,      // Reserved for future use
                    centerOffset: 80          // Reserved for future use
                };
            case 'normal':
                return {
                    updateInterval: 1000,    // Once per second (as required by subject)
                    predictionError: 20,     // Moderate random error (±20px) - balanced difficulty
                    reactionDelay: 200,       // Reserved for future use
                    centerOffset: 20         // Reserved for future use
                };
            case 'hard':
                return {
                    updateInterval: 1000,    // Once per second (as required by subject)
                    predictionError: 0,      // No random error - perfect prediction
                    reactionDelay: 0,        // Reserved for future use
                    centerOffset: 0          // Reserved for future use
                };
        }
    }

    updateAIView(gameState: any): void {
        const now = Date.now();
        
        // Safety check - ensure game state is valid
        if (!gameState || gameState.ballPosX === undefined || gameState.ballPosY === undefined) {
            return;
        }
        
        // Update paddle position every frame (it changes every frame as we move)
        this.currentPaddlePos = gameState.paddlePos ?? this.center;
        
        if (now - this.lastUpdateTime >= this.settings.updateInterval) {
            // Capture a snapshot of the game state
            this.lastView = {
                ballPosX: gameState.ballPosX,
                ballPosY: gameState.ballPosY,
                ballVelX: gameState.ballVelX || 0,  // Velocity in pixels/second
                ballVelY: gameState.ballVelY || 0,  // Velocity in pixels/second
                paddlePos: this.currentPaddlePos,
                lastUpdate: now  // Store timestamp for time calculations
            };
            this.lastUpdateTime = now;
        }
        
        this.decideMovement();
    }

    getKeyStates(): { up: boolean; down: boolean } {
        return this.currentKeys;
    }

    private decideMovement(): void {
        // If no view exists yet (game just started), return to center
        if (!this.lastView) {
            this.moveTowardsTarget(this.center);
            return;
        }

        const timeSinceViewUpdate = (Date.now() - this.lastView.lastUpdate) / 1000;

        const ballX = this.lastView.ballPosX;
        const ballY = this.lastView.ballPosY;
        const ballVelX = this.lastView.ballVelX;  // pixels/second
        const ballVelY = this.lastView.ballVelY;  // pixels/second

        const isVerticalPaddle = this.side === 'left' || this.side === 'right';
        
        const ballPosOnAxis = isVerticalPaddle ? ballY : ballX;
        const ballVelOnAxis = isVerticalPaddle ? ballVelY : ballVelX;
        const ballPosTowardsPaddle = isVerticalPaddle ? ballX : ballY;
        const ballVelTowardsPaddle = isVerticalPaddle ? ballVelX : ballVelY;

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
            
            // Easy mode: Only react when ball is close (makes it easier to beat)
            if (this.settings.predictionError >= 100) {
                // Calculate where the paddle is positioned on the court
                const paddleCourtPos = this.side === 'left' || this.side === 'top' ?
                    this.values.paddleWidth : 
                    (this.side === 'right' ? this.values.maxX - this.values.paddleWidth : this.values.maxY - this.values.paddleWidth);
                
                // Calculate distance from ball to paddle
                const distanceToPaddle = Math.abs(paddleCourtPos - ballPosTowardsPaddle);
                
                // Easy mode: Only start moving when ball is within 100 pixels (slow reaction)
                // This makes the AI easier to beat by delaying its response
                if (distanceToPaddle > 100) {
                    // Ball too far - just return to center slowly (don't react yet)
                    target = this.center;
                } else {
                    // Ball is close - predict where it will be (but with large errors)
                    target = this.predictBallPosition(
                        ballPosOnAxis,
                        ballVelOnAxis,
                        ballPosTowardsPaddle,
                        ballVelTowardsPaddle,
                        timeSinceViewUpdate
                    );
                }
            } else if (this.settings.predictionError >= 80) {
                // Medium easy mode (for potential future difficulty levels)
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
                // Normal/Hard mode: Always predict (no delayed reaction)
                target = this.predictBallPosition(
                    ballPosOnAxis,
                    ballVelOnAxis,
                    ballPosTowardsPaddle,
                    ballVelTowardsPaddle,
                    timeSinceViewUpdate
                );
            }
        } else {
            // Ball moving away from this paddle - return to center position
            // This is a defensive strategy: be ready in the center for the next approach
            target = this.center;
        }

        // Move the paddle towards the calculated target position
        this.moveTowardsTarget(target);
    }

    /**
     * Predict Ball Position
     * 
     * Core prediction algorithm using physics equations (NOT A* pathfinding).
     * 
     * Algorithm:
     * 1. Extrapolate ball's CURRENT position (since last view was timeSinceUpdate seconds ago)
     * 2. Calculate time until ball reaches paddle
     * 3. Predict where ball will be on paddle's axis after that time
     * 4. Handle wall bounces during travel
     * 5. Add difficulty-based random error
     * 
     * Uses physics: position = position + (velocity × time)
     * 
     * @param ballPosOnAxis - Ball position along paddle's movement axis (from last view)
     * @param ballVelOnAxis - Ball velocity along paddle's movement axis
     * @param ballPosTowardsPaddle - Ball position along axis towards paddle
     * @param ballVelTowardsPaddle - Ball velocity along axis towards paddle
     * @param timeSinceUpdate - Time elapsed since last view (seconds)
     * @returns Predicted position where ball will be when it reaches paddle
     */
    private predictBallPosition(
        ballPosOnAxis: number,
        ballVelOnAxis: number,
        ballPosTowardsPaddle: number,
        ballVelTowardsPaddle: number,
        timeSinceUpdate: number
    ): number {
        // STEP 1: Extrapolate ball's CURRENT position
        // The last view was timeSinceUpdate seconds ago, so the ball has moved since then
        // Formula: currentPosition = lastPosition + (velocity × timeElapsed)
        let currentBallPosOnAxis = ballPosOnAxis + (ballVelOnAxis * timeSinceUpdate);
        let currentBallPosTowardsPaddle = ballPosTowardsPaddle + (ballVelTowardsPaddle * timeSinceUpdate);

        // Handle bounces that may have occurred since last view
        // If the ball bounced off a wall, we need to account for that
        currentBallPosOnAxis = this.calculateBounces(currentBallPosOnAxis, ballVelOnAxis, timeSinceUpdate);
        
        // STEP 2: Calculate where the paddle is positioned on the court
        const paddleCourtPos = this.side === 'left' || this.side === 'top' ?
            this.values.paddleWidth : 
            (this.side === 'right' ? this.values.maxX - this.values.paddleWidth : this.values.maxY - this.values.paddleWidth);

        // STEP 3: Calculate time until ball reaches paddle
        // Formula: time = distance / velocity
        // Avoid division by zero if ball is moving very slowly
        if (Math.abs(ballVelTowardsPaddle) < 0.1) {
            // Ball moving very slowly or stopped - just track current position
            return this.clampTarget(currentBallPosOnAxis);
        }

        const distanceToPaddle = Math.abs(paddleCourtPos - currentBallPosTowardsPaddle);
        const timeToReach = distanceToPaddle / Math.abs(ballVelTowardsPaddle);

        // STEP 4: Predict where ball will be on our axis after timeToReach seconds
        // Formula: predictedPosition = currentPosition + (velocity × timeToReach)
        let predictedPos = currentBallPosOnAxis + (ballVelOnAxis * timeToReach);

        // STEP 5: Handle wall bounces during timeToReach
        // The ball might bounce off walls while traveling to the paddle
        predictedPos = this.calculateBounces(predictedPos, ballVelOnAxis, timeToReach);

        // STEP 6: Add difficulty-based error to make AI less perfect
        // This simulates human inaccuracy and makes the game more fair
        if (this.settings.predictionError > 0) {
            // Add random error: ±(predictionError/2) pixels
            const error = (Math.random() - 0.5) * this.settings.predictionError;
            predictedPos += error;
            
            // Easy mode: Add even more randomness - sometimes just guess randomly
            // This makes easy mode much easier to beat
            if (this.settings.predictionError >= 100 && Math.random() < 0.22) {
                // 22% chance to completely ignore prediction and use random position
                predictedPos = Math.random() * this.max;
            }
        }

        // Clamp to valid range and return
        return this.clampTarget(predictedPos);
    }

    /**
     * Calculate Bounces
     * 
     * Handles wall bounces using geometric reflection (NOT A* pathfinding).
     * 
     * When the ball hits a wall, it bounces (reflects). This function simulates that
     * by reflecting the predicted position if it goes out of bounds.
     * 
     * Algorithm:
     * - If position < 0: bounced off top/left wall → reflect: pos = -pos
     * - If position > max: bounced off bottom/right wall → reflect: pos = 2×max - pos
     * - Handles multiple bounces iteratively
     * 
     * This is a physics-based calculation, not pathfinding.
     * 
     * @param predictedPos - Predicted position (may be out of bounds)
     * @param velocity - Ball velocity (used for safety checks)
     * @param totalTime - Total time being simulated
     * @returns Position after accounting for all bounces
     */
    private calculateBounces(predictedPos: number, velocity: number, totalTime: number): number {
        // Start with the predicted position
        let pos = predictedPos;
        
        // Handle bounces by reflecting the position when it goes out of bounds
        // This loop handles multiple bounces (ball can bounce several times)
        while (pos < 0 || pos > this.max) {
            if (pos < 0) {
                // Bounce off top/left wall: reflect the position
                // Example: if pos = -10, after bounce pos = 10
                pos = -pos;
            } else if (pos > this.max) {
                // Bounce off bottom/right wall: reflect the position
                // Example: if max = 400 and pos = 450, after bounce pos = 2×400 - 450 = 350
                pos = 2 * this.max - pos;
            }
            
            // Safety check to prevent infinite loops
            // If position is way out of bounds, something went wrong
            if (pos < -this.max * 2 || pos > this.max * 3) {
                // Clamp to valid bounds and break
                pos = Math.max(0, Math.min(this.max, pos));
                break;
            }
        }
        
        return pos;
    }

    /**
     * Clamp Target
     * 
     * Ensures the target position is within valid bounds and centers the paddle on the target.
     * 
     * @param target - Target ball position
     * @returns Valid paddle position (centered on target, clamped to bounds)
     */
    private clampTarget(target: number): number {
        // Center the paddle on the target position
        // We want the center of the paddle to align with the ball, not the top edge
        const centeredTarget = target - (this.values.paddleHeight / 2);
        
        // Clamp to valid paddle range (0 to maxPaddle)
        return Math.max(0, Math.min(this.maxPaddle, centeredTarget));
    }

    /**
     * Move Towards Target
     * 
     * Sets keyboard input (up/down keys) to move paddle towards target position.
     * This is where the AI simulates human keyboard input.
     * 
     * Uses a "deadzone" - if paddle is close enough to target, stop moving.
     * This prevents jittery movement and makes the AI feel more human-like.
     * 
     * @param target - Target paddle position to move towards
     */
    private moveTowardsTarget(target: number): void {
        // Get current paddle position (updated every frame)
        const paddle = this.currentPaddlePos;

        // Calculate deadzone based on difficulty
        // Deadzone = how close is "close enough" before stopping movement
        // Larger deadzone = less precise, smaller = more precise
        let deadzone: number;
        if (this.settings.predictionError >= 100) {
            // Easy mode: Large deadzone (50px) - AI is imprecise and lazy
            // Stops moving when within 50px of target
            deadzone = 50;
        } else if (this.settings.predictionError >= 80) {
            // Medium easy mode: Moderate deadzone
            deadzone = 35;
        } else if (this.settings.predictionError > 0) {
            // Normal mode: Deadzone proportional to prediction error
            deadzone = Math.max(5, this.settings.predictionError / 4);
        } else {
            // Hard mode: Small deadzone (2px) for precision
            // Very precise movement, stops only when very close
            deadzone = 2;
        }

        const distance = Math.abs(paddle - target);

        // Easy mode: Sometimes don't move at all (15% chance)
        // This simulates "lazy" behavior and makes the AI easier to beat
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

        // Set keyboard input based on target position
        if (distance > deadzone) {
            // Target is far enough away - move towards it
            // If target is above paddle, press UP (move up)
            // If target is below paddle, press DOWN (move down)
            this.currentKeys.up = target < paddle;
            this.currentKeys.down = target > paddle;
        } else {
            // Close enough to target - stop moving
            // This prevents jittery movement when already at target
            this.currentKeys.up = false;
            this.currentKeys.down = false;
        }
    }
}
