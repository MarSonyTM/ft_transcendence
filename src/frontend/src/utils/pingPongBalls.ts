/**
 * Creates animated bouncing ping pong balls in the background
 * Call this function to add the animation to a page
 */
export function createPingPongBalls(containerId: string = 'app-root'): void {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Remove any existing ping pong balls container
  const existing = document.getElementById('ping-pong-balls-container');
  if (existing) {
    existing.remove();
  }

  // Create container for balls
  const ballsContainer = document.createElement('div');
  ballsContainer.id = 'ping-pong-balls-container';
  ballsContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
    overflow: hidden;
  `;
  document.body.appendChild(ballsContainer);

  const ballCount = 8;
  const MAX_SPEED = 3.0; // Maximum speed limit to prevent balls from getting too fast
  const balls: Array<{
    element: HTMLElement;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
  }> = [];

  // Helper function to clamp ball speed
  function clampBallSpeed(ball: { vx: number; vy: number }): void {
    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    if (speed > MAX_SPEED) {
      const scale = MAX_SPEED / speed;
      ball.vx *= scale;
      ball.vy *= scale;
    }
  }

  // Create balls
  for (let i = 0; i < ballCount; i++) {
    const ball = document.createElement('div');
    const radius = 20 + Math.random() * 15; // 20-35px radius
    const x = Math.random() * (window.innerWidth - radius * 2) + radius;
    const y = Math.random() * (window.innerHeight - radius * 2) + radius;
    
    // Random velocity
    const speed = 0.5 + Math.random() * 1.5; // 0.5-2.0
    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    // Random color from neon theme
    const colors = [
      'rgba(96, 165, 250, 0.6)',   // blue
      'rgba(167, 139, 250, 0.6)',  // purple
      'rgba(236, 72, 153, 0.6)',   // pink
      'rgba(34, 197, 94, 0.6)',    // green
      'rgba(251, 191, 36, 0.6)',   // yellow
    ];
    const color = colors[Math.floor(Math.random() * colors.length)];

    ball.style.cssText = `
      position: absolute;
      width: ${radius * 2}px;
      height: ${radius * 2}px;
      border-radius: 50%;
      background: ${color};
      box-shadow: 
        0 0 20px ${color},
        0 0 40px ${color},
        inset -5px -5px 10px rgba(0, 0, 0, 0.3);
      left: ${x}px;
      top: ${y}px;
      transition: none;
    `;

    ballsContainer.appendChild(ball);

    balls.push({
      element: ball,
      x,
      y,
      vx,
      vy,
      radius,
    });
  }

  // Animation loop
  let animationId: number;
  function animate() {
    // Update positions first
    balls.forEach((ball) => {
      ball.x += ball.vx;
      ball.y += ball.vy;
    });

    // Check for collisions between balls
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const ball1 = balls[i];
        const ball2 = balls[j];

        // Calculate distance between ball centers
        const dx = ball2.x - ball1.x;
        const dy = ball2.y - ball1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = ball1.radius + ball2.radius;

        // Check if balls are colliding
        if (distance < minDistance && distance > 0) {
          // Normalize collision vector
          const nx = dx / distance;
          const ny = dy / distance;

          // Separate balls to prevent overlap
          const overlap = minDistance - distance;
          const separationX = nx * overlap * 0.5;
          const separationY = ny * overlap * 0.5;
          
          ball1.x -= separationX;
          ball1.y -= separationY;
          ball2.x += separationX;
          ball2.y += separationY;

          // Calculate relative velocity
          const dvx = ball2.vx - ball1.vx;
          const dvy = ball2.vy - ball1.vy;

          // Calculate relative velocity along collision normal
          const dotProduct = dvx * nx + dvy * ny;

          // Only resolve if balls are moving towards each other
          if (dotProduct < 0) {
            // Elastic collision response
            // For equal mass (simplified), we can use a simple bounce
            const restitution = 0.9; // Slight energy loss for realism

            // Calculate impulse
            const impulse = 2 * dotProduct * restitution;

            // Update velocities
            ball1.vx += impulse * nx;
            ball1.vy += impulse * ny;
            ball2.vx -= impulse * nx;
            ball2.vy -= impulse * ny;
            
            // Clamp speeds to prevent balls from getting too fast
            clampBallSpeed(ball1);
            clampBallSpeed(ball2);
          }
        }
      }
    }

    // Handle wall collisions and update DOM
    balls.forEach((ball) => {
      // Bounce off walls
      if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= window.innerWidth) {
        ball.vx = -ball.vx;
        ball.x = Math.max(ball.radius, Math.min(window.innerWidth - ball.radius, ball.x));
        clampBallSpeed(ball); // Clamp speed after wall bounce
      }
      if (ball.y - ball.radius <= 0 || ball.y + ball.radius >= window.innerHeight) {
        ball.vy = -ball.vy;
        ball.y = Math.max(ball.radius, Math.min(window.innerHeight - ball.radius, ball.y));
        clampBallSpeed(ball); // Clamp speed after wall bounce
      }

      // Update DOM
      ball.element.style.left = `${ball.x - ball.radius}px`;
      ball.element.style.top = `${ball.y - ball.radius}px`;
    });

    animationId = requestAnimationFrame(animate);
  }

  // Handle window resize
  const handleResize = () => {
    balls.forEach((ball) => {
      // Keep balls within bounds
      ball.x = Math.max(ball.radius, Math.min(window.innerWidth - ball.radius, ball.x));
      ball.y = Math.max(ball.radius, Math.min(window.innerHeight - ball.radius, ball.y));
    });
  };
  window.addEventListener('resize', handleResize);

  // Start animation
  animate();

  // Cleanup function (can be called when page changes)
  (ballsContainer as any).cleanup = () => {
    cancelAnimationFrame(animationId);
    window.removeEventListener('resize', handleResize);
    ballsContainer.remove();
  };
}

/**
 * Removes ping pong balls animation
 */
export function removePingPongBalls(): void {
  const container = document.getElementById('ping-pong-balls-container');
  if (container && (container as any).cleanup) {
    (container as any).cleanup();
  } else if (container) {
    container.remove();
  }
}

