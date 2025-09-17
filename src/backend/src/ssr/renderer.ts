import { GameState } from '../database/index';

export interface SSRPageProps {
  gameState: {
    ballPosX: number;
    ballPosY: number;
    player1Pos: number;
    player2Pos: number;
    scorePlayer1: number;
    scorePlayer2: number;
  };
  gameId: number | null;
  currentUsername: string;
  currentPage: 'landing' | 'login' | 'game';
}

export function renderFullPage(props: SSRPageProps): string {
  const { gameState, gameId, currentUsername, currentPage } = props;
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ft_transcendence - Pong Prototype</title>
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <style>
        // ${getInlineCSS()}
    </style>
    <script>
        window.__INITIAL_STATE__ = ${JSON.stringify(props)};
    </script>
</head>
<body>
    <div id="app-root">
        ${renderPageContent(props)}
    </div>
    <script>
        ${getHydratedClientScript()}
    </script>
</body>
</html>
  `;
}

function renderPageContent(props: SSRPageProps): string {
  const { currentPage } = props;
  
  switch (currentPage) {
    case 'landing':
      return renderLandingPage();
    case 'login':
      return renderLoginPage();
    case 'game':
      return renderGamePage(props);
    default:
      return renderLandingPage();
  }
}

function renderLandingPage(): string {
  return `
    <div class="landing-container">
        <h1 class="main-title">PING PONG</h1>
        <div class="button-container">
            <button id="loginBtn" class="btn btn-login">Login</button>
            <button id="registerBtn" class="btn btn-register">Register</button>
            <button id="quickPlayBtn" class="btn btn-quickplay">Quick Play</button>
        </div>
    </div>
  `;
}

function renderLoginPage(): string {
  return `
    <div class="login-container">
        <h2 class="login-title">Login</h2>
        <form id="loginForm" class="login-form">
            <input id="usernameInput" type="text" placeholder="Username" required class="form-input" />
            <input id="passwordInput" type="password" placeholder="Password" required class="form-input" />
            <button type="submit" class="btn btn-login">Login</button>
            <div id="loginError" class="error-message"></div>
        </form>
        <button id="backToLandingBtn" class="btn btn-secondary">Back</button>
    </div>
  `;
}

function renderGamePage(props: SSRPageProps): string {
  const { gameState, gameId, currentUsername } = props;
  
  return `
    <h1 class="main-title">ft_transcendence - Pong Prototype</h1>
    <div class="game-status">
        <div>Status: <span id="gameStatus" class="status-text">Initializing...</span></div>
        <div>WebSocket: <span id="wsStatus" class="ws-status">Disconnected</span></div>
        <div>FPS: <span id="fpsCounter" class="fps-text">0</span></div>
        ${gameId ? `<div>Game ID: <span>${gameId}</span></div>` : ''}
    </div>
    <div class="controls-container">
        <button id="startBtn" class="btn btn-start">Start Game</button>
        <button id="stopBtn" class="btn btn-stop" disabled>Stop Game</button>
        <button id="reconnectBtn" class="btn btn-reconnect">Reconnect WebSocket</button>
    </div>
    <div class="player-info">
        <div class="player-names">
            <span id="player1Name" class="player1-name">${currentUsername || 'Player 1'}</span> 
            <span class="vs-text">vs</span> 
            <span id="player2Name" class="player2-name">Player 2</span>
        </div>
        <div class="score-container">
            <span id="leftScore" class="left-score">${gameState.scorePlayer1}</span> 
            <span class="score-separator">-</span> 
            <span id="rightScore" class="right-score">${gameState.scorePlayer2}</span>
        </div>
    </div>
    <canvas id="gameScreen" width="400" height="200"></canvas>
    <div class="controls-info">
        <p>Player 1 - Up/Down W/S</p>
        <p>Player 2 - Up/Down O/L</p>
    </div>
  `;
}

function getHydratedClientScript(): string {
  return `
    class PongGameSSR {
      constructor() {
        this.gameId = window.__INITIAL_STATE__.gameId;
        this.gameState = window.__INITIAL_STATE__.gameState;
        this.currentUsername = window.__INITIAL_STATE__.currentUsername;
        this.currentPage = window.__INITIAL_STATE__.currentPage;
        this.websocket = null;
        this.isActive = false;
        this.keys = {};
        this.paddlePosition = 80;
        this.playerId = 1;
        this.fpsStartTime = performance.now();
        this.frameCount = 0;
        
        this.initializeHandlers();
      }

      initializeHandlers() {
        // Add event listeners for buttons and forms
        this.bindEventListeners();
        this.setupKeyboardControls();

        // Initialize game if on game page
        if (this.currentPage === 'game') {
          this.initializeGame();
        }
      }

      bindEventListeners() {
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const reconnectBtn = document.getElementById('reconnectBtn');
        const loginBtn = document.getElementById('loginBtn');
        const quickPlayBtn = document.getElementById('quickPlayBtn');
        const backBtn = document.getElementById('backToLandingBtn');
        const loginForm = document.getElementById('loginForm');

        if (startBtn) startBtn.addEventListener('click', () => this.startGame());
        if (stopBtn) stopBtn.addEventListener('click', () => this.stopGame());
        if (reconnectBtn) reconnectBtn.addEventListener('click', () => this.reconnectWS());
        if (loginBtn) loginBtn.addEventListener('click', () => this.navigateTo('login'));
        if (quickPlayBtn) quickPlayBtn.addEventListener('click', () => this.quickPlay());
        if (backBtn) backBtn.addEventListener('click', () => this.navigateTo('landing'));
        if (loginForm) loginForm.addEventListener('submit', (e) => this.handleLogin(e));
      }

      navigateTo(page) {
        const newProps = { ...window.__INITIAL_STATE__, currentPage: page };
        
        if (page === 'game' && !this.currentUsername) {
          this.currentUsername = 'Guest Player';
          newProps.currentUsername = this.currentUsername;
        }
        
        this.updatePage(newProps);
        history.pushState({ page }, '', page === 'landing' ? '/' : '/' + page);
      }

      async quickPlay() {
        this.currentUsername = 'Quick Player';
        this.navigateTo('game');
      }

      async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('usernameInput').value.trim();
        const password = document.getElementById('passwordInput').value;
        
        // Simple validation for now
        if (username) {
          this.currentUsername = username;
          this.navigateTo('game');
        } else {
          document.getElementById('loginError').textContent = 'Username required';
        }
      }

      updatePage(newProps) {
        window.__INITIAL_STATE__ = newProps;
        const appRoot = document.getElementById('app-root');
        appRoot.innerHTML = this.renderPageContent(newProps);
        this.initializeHandlers(); // Re-bind event listeners
      }

      renderPageContent(props) {
        const { currentPage } = props;
        
        if (currentPage === 'landing') {
          return \`
            <div class="landing-container">
                <h1 class="main-title">PING PONG</h1>
                <div class="button-container">
                    <button id="loginBtn" class="btn btn-login">Login</button>
                    <button id="registerBtn" class="btn btn-register">Register</button>
                    <button id="quickPlayBtn" class="btn btn-quickplay">Quick Play</button>
                </div>
            </div>
          \`;
        } else if (currentPage === 'login') {
          return \`
            <div class="login-container">
                <h2 class="login-title">Login</h2>
                <form id="loginForm" class="login-form">
                    <input id="usernameInput" type="text" placeholder="Username" required class="form-input" />
                    <input id="passwordInput" type="password" placeholder="Password" required class="form-input" />
                    <button type="submit" class="btn btn-login">Login</button>
                    <div id="loginError" class="error-message"></div>
                </form>
                <button id="backToLandingBtn" class="btn btn-secondary">Back</button>
            </div>
          \`;
        } else {
          return this.renderGamePageContent(props);
        }
      }

      renderGamePageContent(props) {
        const { gameState, gameId, currentUsername } = props;
        return \`
          <h1 class="main-title">ft_transcendence - Pong Prototype</h1>
          <div class="game-status">
              <div>Status: <span id="gameStatus" class="status-text">Initializing...</span></div>
              <div>WebSocket: <span id="wsStatus" class="ws-status">Disconnected</span></div>
              <div>FPS: <span id="fpsCounter" class="fps-text">0</span></div>
              \${gameId ? \`<div>Game ID: <span>\${gameId}</span></div>\` : ''}
          </div>
          <div class="controls-container">
              <button id="startBtn" class="btn btn-start">Start Game</button>
              <button id="stopBtn" class="btn btn-stop" disabled>Stop Game</button>
              <button id="reconnectBtn" class="btn btn-reconnect">Reconnect WebSocket</button>
          </div>
          <div class="player-info">
              <div class="player-names">
                  <span id="player1Name" class="player1-name">\${currentUsername || 'Player 1'}</span> 
                  <span class="vs-text">vs</span> 
                  <span id="player2Name" class="player2-name">Player 2</span>
              </div>
              <div class="score-container">
                  <span id="leftScore" class="left-score">\${gameState.scorePlayer1}</span> 
                  <span class="score-separator">-</span> 
                  <span id="rightScore" class="right-score">\${gameState.scorePlayer2}</span>
              </div>
          </div>
          <canvas id="gameScreen" width="400" height="200"></canvas>
          <div class="controls-info">
              <p>Player 1 - Up/Down W/S</p>
              <p>Player 2 - Up/Down O/L</p>
          </div>
        \`;
      }

      async initializeGame() {
        this.canvas = document.getElementById("gameScreen");
        this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
        
        if (!this.canvas || !this.ctx) return;
        
        this.updateStatus("Initializing...");
        
        try {
          await this.createGame();
          
          if (this.gameId) {
            await this.connectWebSocket();
            this.startRenderLoop();
          }
        } catch (error) {
          this.updateStatus(\`Initialization failed: \${error.message}\`);
        }
      }

      async createGame() {
        try {
          const response = await fetch("/api/game/new", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "1v1", difficulty: "normal" }),
          });

          const data = await response.json();
          if (data.success && data.data && data.data.id) {
            this.gameId = data.data.id;
            window.__INITIAL_STATE__.gameId = this.gameId;
          } else {
            throw new Error(data.message || "Failed to create game");
          }
        } catch (error) {
          throw error;
        }
      }

      async connectWebSocket() {
        return new Promise((resolve, reject) => {
          const wsUrl = \`ws://localhost:3000/game/\${this.gameId}/ws\`;
          this.websocket = new WebSocket(wsUrl);
          
          this.websocket.onopen = () => {
            this.updateWSStatus("Connected", true);
            resolve();
          };
          
          this.websocket.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data);
              this.handleWebSocketMessage(message);
            } catch (error) {
              console.error('WebSocket message error:', error);
            }
          };
          
          this.websocket.onclose = () => {
            this.updateWSStatus("Disconnected", false);
            this.isActive = false;
          };
          
          this.websocket.onerror = (error) => {
            this.updateWSStatus("Error", false);
            reject(error);
          };
          
          setTimeout(() => {
            if (this.websocket && this.websocket.readyState !== WebSocket.OPEN) {
              reject(new Error("WebSocket connection timeout"));
            }
          }, 5000);
        });
      }

      handleWebSocketMessage(message) {
        switch (message.type) {
          case 'gameState':
            if (message.state) {
              this.gameState = {
                ballPosX: message.state.ballPosX || this.gameState.ballPosX,
                ballPosY: message.state.ballPosY || this.gameState.ballPosY,
                player1Pos: message.state.player1Pos || this.gameState.player1Pos,
                player2Pos: message.state.player2Pos || this.gameState.player2Pos,
                scorePlayer1: message.state.scorePlayer1 || 0,
                scorePlayer2: message.state.scorePlayer2 || 0
              };
              this.updateScoreDisplay();
            }
            break;
          case 'gameStop':
            this.isActive = false;
            this.updateStatus("Game stopped");
            break;
          case 'score':
            this.gameState.scorePlayer1 = message.scorePlayer1 || 0;
            this.gameState.scorePlayer2 = message.scorePlayer2 || 0;
            this.updateScoreDisplay();
            break;
        }
      }

      async startGame() {
        if (!this.gameId) {
          await this.initializeGame();
        }
        
        if (this.gameId) {
          await this.startServerGame();
        }
      }

      async startServerGame() {
        try {
          const response = await fetch(\`/api/game/\${this.gameId}/start\`, {
            method: "POST"
          });

          const data = await response.json();
          if (data.success) {
            this.isActive = true;
            this.updateStatus("Game running!");
            const startBtn = document.getElementById('startBtn');
            const stopBtn = document.getElementById('stopBtn');
            if (startBtn) startBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = false;
          } else {
            throw new Error(data.message || "Failed to start game");
          }
        } catch (error) {
          this.updateStatus(\`Failed to start: \${error.message}\`);
        }
      }

      async stopGame() {
        this.isActive = false;
        
        if (this.websocket) {
          this.websocket.close();
        }

        if (this.gameId) {
          try {
            await fetch(\`/api/game/\${this.gameId}/stop\`, {
              method: "POST"
            });
            this.updateStatus("Game stopped");
          } catch (error) {
            console.error('Stop game error:', error);
          }
        }

        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
      }

      reconnectWS() {
        if (this.gameId && this.websocket) {
          this.websocket.close();
          this.connectWebSocket();
        }
      }

      setupKeyboardControls() {
        document.addEventListener('keydown', (event) => {
          this.keys[event.code] = true;
        });

        document.addEventListener('keyup', (event) => {
          this.keys[event.code] = false;
        });
      }

      startRenderLoop() {
        const renderFrame = () => {
          this.updateFPS();
          this.handleInput();
          this.render();
          if (this.isActive || this.currentPage === 'game') {
            requestAnimationFrame(renderFrame);
          }
        };
        
        requestAnimationFrame(renderFrame);
      }

      handleInput() {
        if (!this.isActive) return;
        
        let newPosition = this.paddlePosition;
        const paddleSpeed = 4;
        
        if (this.keys['KeyW'] && this.paddlePosition > 0) {
          newPosition = Math.max(0, this.paddlePosition - paddleSpeed);
        }
        if (this.keys['KeyS'] && this.paddlePosition < 160) {
          newPosition = Math.min(160, this.paddlePosition + paddleSpeed);
        }        
        
        if (newPosition !== this.paddlePosition) {
          this.paddlePosition = newPosition;
          this.sendPlayerMove(newPosition);
        }
      }

      sendPlayerMove(position) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
          this.websocket.send(JSON.stringify({
            type: 'move',
            position: position
          }));
        }
      }

      render() {
        if (!this.ctx || !this.canvas) return;

        const ballPosX = this.gameState.ballPosX || 200;
        const ballPosY = this.gameState.ballPosY || 100;
        const player1Pos = this.gameState.player1Pos || 80;
        const player2Pos = this.gameState.player2Pos || 80;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw center line
        this.ctx.strokeStyle = "white";
        this.ctx.setLineDash([5, 15]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width / 2, 0);
        this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw paddles
        this.ctx.fillStyle = "grey";
        
        const leftPaddleY = this.playerId === 1 ? this.paddlePosition : player1Pos;
        this.ctx.fillRect(0, leftPaddleY, 10, 40);
        
        const rightPaddleY = this.playerId === 2 ? this.paddlePosition : player2Pos;
        this.ctx.fillRect(this.canvas.width - 10, rightPaddleY, 10, 40);

        // Draw ball
        this.ctx.beginPath();
        this.ctx.arc(ballPosX, ballPosY, 10, 0, 2 * Math.PI);
        this.ctx.fillStyle = "white";
        this.ctx.fill();

        // Draw game info
        this.ctx.font = "12px Arial";
        this.ctx.fillStyle = "white";
        this.ctx.textAlign = "center";
        this.ctx.fillText(\`Game \${this.gameId || 'N/A'}\`, this.canvas.width / 2, 15);
      }

      updateFPS() {
        const now = performance.now();
        this.frameCount++;
        const elapsed = now - this.fpsStartTime;
        
        if (elapsed >= 1000) {
          const fps = Math.round((this.frameCount * 1000) / elapsed);
          const fpsCounter = document.getElementById('fpsCounter');
          if (fpsCounter) fpsCounter.textContent = fps.toString();
          this.fpsStartTime = now;
          this.frameCount = 0;
        }
      }

      updateStatus(status) {
        const gameStatus = document.getElementById('gameStatus');
        if (gameStatus) gameStatus.textContent = status;
      }

      updateWSStatus(status, connected) {
        const element = document.getElementById('wsStatus');
        if (element) {
          element.textContent = status;
          element.className = connected ? 'ws-status connected' : 'ws-status disconnected';
        }
      }

      updateScoreDisplay() {
        const leftScore = document.getElementById('leftScore');
        const rightScore = document.getElementById('rightScore');
        if (leftScore) leftScore.textContent = this.gameState.scorePlayer1.toString();
        if (rightScore) rightScore.textContent = this.gameState.scorePlayer2.toString();
      }
    }

    // Initialize the hydrated app
    const app = new PongGameSSR();

    // Handle browser navigation
    window.addEventListener('popstate', (event) => {
      const page = event.state?.page || 'landing';
      const newProps = { ...window.__INITIAL_STATE__, currentPage: page };
      app.updatePage(newProps);
    });
  `;
}
