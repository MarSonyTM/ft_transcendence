// Background ping pong balls with physics and collision detection

interface Ball {
  element: HTMLElement;
  x: number;
  y: number;
  vx: number; // velocity x
  vy: number; // velocity y
  radius: number;
}

class BackgroundBallsManager {
  private balls: Ball[] = [];
  private animationId: number | null = null;
  private container: HTMLElement | null = null;
  private _isRunning = false;
  private readonly ballRadius = 20; // 40px diameter / 2
  private readonly minSpeed = 4.5;
  private readonly maxSpeed = 7.0;
  private readonly numBalls = 5;

  get isRunningState(): boolean {
    return this._isRunning;
  }

  init(): void {
    this.container = document.querySelector('.background-balls');
    if (!this.container) {
      console.warn('Background balls container not found');
      return;
    }

    // Clear any existing balls
    this.container.innerHTML = '';

    // Create balls with random initial positions and velocities
    for (let i = 0; i < this.numBalls; i++) {
      const ballElement = document.createElement('div');
      ballElement.className = `ping-pong-ball ball-${i + 1}`;
      this.container.appendChild(ballElement);

      const ball: Ball = {
        element: ballElement,
        x: Math.random() * (window.innerWidth - this.ballRadius * 2) + this.ballRadius,
        y: Math.random() * (window.innerHeight - this.ballRadius * 2) + this.ballRadius,
        vx: (Math.random() - 0.5) * 2 * this.maxSpeed,
        vy: (Math.random() - 0.5) * 2 * this.maxSpeed,
        radius: this.ballRadius,
      };

      // Ensure minimum speed
      if (Math.abs(ball.vx) < this.minSpeed) {
        ball.vx = ball.vx > 0 ? this.minSpeed : -this.minSpeed;
      }
      if (Math.abs(ball.vy) < this.minSpeed) {
        ball.vy = ball.vy > 0 ? this.minSpeed : -this.minSpeed;
      }

      this.balls.push(ball);
    }

    this.start();
  }

  private start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this.animate();
  }

  stop(): void {
    this._isRunning = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private animate = (): void => {
    if (!this._isRunning) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Update positions and handle collisions
    for (let i = 0; i < this.balls.length; i++) {
      const ball = this.balls[i];

      // Update position
      ball.x += ball.vx;
      ball.y += ball.vy;

      // Wall collisions
      if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= width) {
        ball.vx = -ball.vx;
        ball.x = Math.max(ball.radius, Math.min(width - ball.radius, ball.x));
      }
      if (ball.y - ball.radius <= 0 || ball.y + ball.radius >= height) {
        ball.vy = -ball.vy;
        ball.y = Math.max(ball.radius, Math.min(height - ball.radius, ball.y));
      }

      // Ball-to-ball collisions
      for (let j = i + 1; j < this.balls.length; j++) {
        const otherBall = this.balls[j];
        this.checkCollision(ball, otherBall);
      }

      // Update DOM position
      ball.element.style.transform = `translate(${ball.x - ball.radius}px, ${ball.y - ball.radius}px)`;
    }

    this.animationId = requestAnimationFrame(this.animate);
  };

  private checkCollision(ball1: Ball, ball2: Ball): void {
    const dx = ball2.x - ball1.x;
    const dy = ball2.y - ball1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = ball1.radius + ball2.radius;

    if (distance < minDistance) {
      // Collision detected - calculate new velocities
      const angle = Math.atan2(dy, dx);
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);

      // Rotate ball1's velocity
      const vx1 = ball1.vx * cos + ball1.vy * sin;
      const vy1 = ball1.vy * cos - ball1.vx * sin;

      // Rotate ball2's velocity
      const vx2 = ball2.vx * cos + ball2.vy * sin;
      const vy2 = ball2.vy * cos - ball2.vx * sin;

      // Swap velocities (elastic collision with equal mass)
      const finalVx1 = vx2;
      const finalVx2 = vx1;

      // Rotate velocities back
      ball1.vx = finalVx1 * cos - vy1 * sin;
      ball1.vy = vy1 * cos + finalVx1 * sin;
      ball2.vx = finalVx2 * cos - vy2 * sin;
      ball2.vy = vy2 * cos + finalVx2 * sin;

      // Separate balls to prevent overlap
      const overlap = minDistance - distance;
      const separationX = (dx / distance) * overlap * 0.5;
      const separationY = (dy / distance) * overlap * 0.5;

      ball1.x -= separationX;
      ball1.y -= separationY;
      ball2.x += separationX;
      ball2.y += separationY;

      // Ensure minimum speed after collision
      const speed1 = Math.sqrt(ball1.vx * ball1.vx + ball1.vy * ball1.vy);
      const speed2 = Math.sqrt(ball2.vx * ball2.vx + ball2.vy * ball2.vy);

      if (speed1 < this.minSpeed) {
        const scale = this.minSpeed / speed1;
        ball1.vx *= scale;
        ball1.vy *= scale;
      }
      if (speed2 < this.minSpeed) {
        const scale = this.minSpeed / speed2;
        ball2.vx *= scale;
        ball2.vy *= scale;
      }
    }
  }

  handleResize(): void {
    // Adjust ball positions if they're outside the new viewport
    const width = window.innerWidth;
    const height = window.innerHeight;

    for (const ball of this.balls) {
      if (ball.x < ball.radius) ball.x = ball.radius;
      if (ball.x > width - ball.radius) ball.x = width - ball.radius;
      if (ball.y < ball.radius) ball.y = ball.radius;
      if (ball.y > height - ball.radius) ball.y = height - ball.radius;
    }
  }
}

// Singleton instance
let manager: BackgroundBallsManager | null = null;

export function initBackgroundBalls(): void {
  // Only create manager if it doesn't exist
  if (!manager) {
    manager = new BackgroundBallsManager();
    
    // Handle window resize
    let resizeTimeout: number;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        manager?.handleResize();
      }, 100);
    });
  }
  
  // Hide by default - will be shown when needed
  const container = document.querySelector('.background-balls') as HTMLElement;
  if (container) {
    container.style.display = 'none';
    container.style.visibility = 'hidden';
  }
  
  // Stop any running animation
  if (manager) {
    manager.stop();
  }
}

export function stopBackgroundBalls(): void {
  if (manager) {
    manager.stop();
  }
}

export function showBackgroundBalls(): void {
  const container = document.querySelector('.background-balls') as HTMLElement;
  if (!container) return;
  
  container.style.display = 'block';
  container.style.visibility = 'visible';
  container.style.pointerEvents = 'none';
  container.style.opacity = '1';
  
  if (!manager) {
    initBackgroundBalls();
  }
  
  // Initialize balls if not already running
  if (manager && !manager.isRunningState) {
    manager.init();
  }
}

export function hideBackgroundBalls(): void {
  const container = document.querySelector('.background-balls') as HTMLElement;
  if (container) {
    container.style.display = 'none';
    container.style.visibility = 'hidden';
    container.style.pointerEvents = 'none';
    container.style.opacity = '0';
  }
  if (manager) {
    manager.stop();
  }
}

