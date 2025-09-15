#!/home/schmitzi/fuckpy/bin/python3

import httpx
import curses
import asyncio
import websockets
import json
import threading
import time
from typing import Dict, Any, Optional

class PongCLI:
    def __init__(self):
        self.game_id: Optional[int] = None
        self.websocket = None
        self.is_active = False
        self.stdscr = None
        self.game_state = {
            "ballPosX": 200,  # Center of 400-width canvas
            "ballPosY": 100,  # Center of 200-height canvas
            "player1Pos": 80,  # Center of 200-height canvas
            "player2Pos": 80,  # Center of 200-height canvas
            "scorePlayer1": 0,
            "scorePlayer2": 0
        }
        self.player_id = 1
        self.paddle_position = 80
        self.score_player1 = 0
        self.score_player2 = 0
        self.websocket_thread = None
        self.win_score = 3
        self.loop = None
        
    def init(self):
        """Initialize the CLI game"""
        try:
            print("Initializing Smooth Pong CLI...")
            self.create_game()
            if self.game_id:
                self.start_server_game()
                # Start WebSocket in separate thread
                self.websocket_thread = threading.Thread(target=self.run_websocket)
                self.websocket_thread.daemon = True
                self.websocket_thread.start()
                # Wait a moment for WebSocket to connect
                time.sleep(0.5)
                # Start render loop
                self.start_render_loop()
        except Exception as e:
            print(f"Initialization failed: {e}")
    
    def create_game(self):
        """Create a new game via REST API"""
        try:
            with httpx.Client() as client:
                response = client.post("http://localhost:3000/api/game/new", 
                    json={"mode": "1v1", "difficulty": "normal"})
                data = response.json()
                if data["success"]:
                    self.game_id = data["data"]["id"]
                    print(f"Game created with ID: {self.game_id}")
                else:
                    raise Exception(data.get("message", "Failed to create game"))
        except Exception as e:
            print(f"Failed to create game: {e}")
            raise
    
    def start_server_game(self):
        """Start the game on server via REST API"""
        try:
            with httpx.Client() as client:
                response = client.post(f"http://localhost:3000/api/game/{self.game_id}/start")
                data = response.json()
                if data["success"]:
                    self.is_active = True
                    print("Game started!")
                else:
                    raise Exception(data.get("message", "Failed to start game"))
        except Exception as e:
            print(f"Failed to start game: {e}")
            raise
    
    def run_websocket(self):
        """Run WebSocket in separate thread"""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(self.connect_websocket())
    
    async def connect_websocket(self):
        """Connect to WebSocket for real-time updates"""
        try:
            ws_url = f"ws://localhost:3000/game/{self.game_id}/ws"
            print(f"Connecting to WebSocket: {ws_url}")
            
            async with websockets.connect(ws_url) as websocket:
                self.websocket = websocket
                print("WebSocket connected!")
                
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        self.process_websocket_message(data)
                    except json.JSONDecodeError:
                        continue
                    except Exception as e:
                        pass  # Ignore message errors
                        
        except Exception as e:
            print(f"WebSocket connection failed: {e}")
    
    def process_websocket_message(self, message: Dict[str, Any]):
        """Process WebSocket message from backend"""
        message_type = message.get("type", "")
        
        if message_type == "connected":
            print("Connected to game server")
            
        elif message_type == "gameState":
            state = message.get("state", {})
            if state:
                self.game_state.update({
                    "ballPosX": state.get("ballPosX", self.game_state["ballPosX"]),
                    "ballPosY": state.get("ballPosY", self.game_state["ballPosY"]),
                    "player1Pos": state.get("player1Pos", self.game_state["player1Pos"]),
                    "player2Pos": state.get("player2Pos", self.game_state["player2Pos"]),
                    "scorePlayer1": state.get("scorePlayer1", 0),
                    "scorePlayer2": state.get("scorePlayer2", 0)
                })
                
        elif message_type == "score":
            self.game_state["scorePlayer1"] = message.get("scorePlayer1", 0)
            self.game_state["scorePlayer2"] = message.get("scorePlayer2", 0)
            self.score_player1 = message.get("scorePlayer1", 0)
            self.score_player2 = message.get("scorePlayer2", 0)
            
            # Check win condition
            if (self.game_state["scorePlayer1"] >= self.win_score or 
                self.game_state["scorePlayer2"] >= self.win_score):
                self.is_active = False
                winner = "Player 1" if self.game_state["scorePlayer1"] >= self.win_score else "Player 2"
                print(f"\n{winner} wins! Final score: {self.game_state['scorePlayer1']}-{self.game_state['scorePlayer2']}")
            
        elif message_type == "gameStop":
            self.is_active = False
            print("Game stopped")
            
        elif message_type == "gameEnd":
            self.is_active = False
            print("Game ended")
    
    def start_render_loop(self):
        """Start the main game loop with curses"""
        # Initialize curses
        self.stdscr = curses.initscr()
        curses.cbreak()
        curses.noecho()
        self.stdscr.keypad(True)
        self.stdscr.nodelay(True)
        curses.curs_set(0)
        
        try:
            while self.is_active:
                self.handle_input()
                self.render()
                time.sleep(0.05)  # 20 FPS
        except KeyboardInterrupt:
            print("\nGame interrupted by user")
        finally:
            self.cleanup()
    
    def handle_input(self):
        """Handle keyboard input and send to backend"""
        if not self.is_active:
            return
        
        try:
            key = self.stdscr.getch()
            if key == curses.ERR:
                return
                
            new_position = self.paddle_position
            paddle_speed = 4
            
            if key == ord('w') and self.paddle_position > 0:
                new_position = max(0, self.paddle_position - paddle_speed)
            elif key == ord('s') and self.paddle_position < 150:
                new_position = min(160, self.paddle_position + paddle_speed)
            elif key == ord('q'):
                self.is_active = False
                return
            
            if new_position != self.paddle_position:
                self.paddle_position = new_position
                self.send_player_move(new_position)
                
        except Exception as e:
            pass  # Ignore input errors
    
    def send_player_move(self, position: int):
        """Send player movement via WebSocket to backend"""
        if self.websocket and self.loop:
            try:
                message = json.dumps({
                    "type": "move",
                    "position": position
                })
                # Schedule the send in the WebSocket loop
                asyncio.run_coroutine_threadsafe(self._send_websocket_message(message), self.loop)
            except Exception as e:
                pass  # Ignore send errors
    
    async def _send_websocket_message(self, message: str):
        """Send WebSocket message asynchronously"""
        try:
            await self.websocket.send(message)
        except Exception as e:
            pass  # Ignore send errors
    
    def render(self):
        """Render the game state from backend"""
        if not self.stdscr:
            return
        
        # Clear screen
        self.stdscr.clear()
        
        # Get terminal dimensions
        height, width = self.stdscr.getmaxyx()
        
        # Create proper 400x200 aspect ratio rectangle (2:1 ratio) - LANDSCAPE
        # Terminal display: 400x200 -> 80x20 (maintains 4:1 aspect ratio for better landscape)
        game_width = min(80, width - 4)  # 400 -> 80 (5:1 scale)
        game_height = min(20, height - 6)  # 200 -> 20 (10:1 scale)
        
        # Scale positions from 400x200 canvas to terminal display
        ball_x = int(self.game_state["ballPosX"] * game_width / 400)
        ball_y = int(self.game_state["ballPosY"] * game_height / 200)
        player1_pos = int(self.game_state["player1Pos"] * game_height / 200)
        player2_pos = int(self.game_state["player2Pos"] * game_height / 200)
        
        # Draw borders
        for y in range(2, game_height + 2):
            self.stdscr.addch(y, 2, '|')
            self.stdscr.addch(y, game_width + 2, '|')
        
        for x in range(2, game_width + 3):
            self.stdscr.addch(2, x, '-')
            self.stdscr.addch(game_height + 2, x, '-')
        
        # Draw center line
        center_x = game_width // 2 + 2
        for y in range(3, game_height + 2):
            if y % 2 == 0:
                self.stdscr.addch(y, center_x, '|')
        
        # Draw paddles (properly positioned for landscape)
        paddle_height = 4
        paddle1_y = max(0, min(player1_pos, game_height - paddle_height))
        paddle2_y = max(0, min(player2_pos, game_height - paddle_height))
        
        for i in range(paddle_height):
            if 3 + paddle1_y + i <= game_height + 1:
                self.stdscr.addch(3 + paddle1_y + i, 3, '█')
            if 3 + paddle2_y + i <= game_height + 1:
                self.stdscr.addch(3 + paddle2_y + i, game_width + 1, '█')
        
        # Draw ball (ensure it can reach both sides)
        ball_display_y = 3 + ball_y
        ball_display_x = 3 + ball_x
        
        # Clamp ball position to game area bounds
        ball_display_y = max(3, min(ball_display_y, game_height + 1))
        ball_display_x = max(3, min(ball_display_x, game_width + 1))
        
        if 3 <= ball_display_y <= game_height + 1 and 3 <= ball_display_x <= game_width + 1:
            self.stdscr.addch(ball_display_y, ball_display_x, '●')
        
        # Draw scores from backend
        score1 = self.game_state["scorePlayer1"]
        score2 = self.game_state["scorePlayer2"]
        self.stdscr.addstr(1, 5, f"Player 1: {score1}")
        self.stdscr.addstr(1, game_width - 10, f"Player 2: {score2}")
        
        # Draw win condition
        if score1 >= self.win_score or score2 >= self.win_score:
            winner = "Player 1" if score1 >= self.win_score else "Player 2"
            self.stdscr.addstr(height - 3, 2, f"*** {winner} WINS! ***")
        
        # Draw controls
        self.stdscr.addstr(height - 2, 2, "Controls: W/S (move) | Q (quit)")
        
        # Draw status
        status = "ACTIVE" if self.is_active else "GAME OVER"
        self.stdscr.addstr(height - 1, 2, f"Status: {status} | Game ID: {self.game_id} | WebSocket: Connected")
        
        self.stdscr.refresh()
    
    def cleanup(self):
        """Clean up curses and connections"""
        if self.stdscr:
            curses.endwin()
        if self.websocket and self.loop:
            try:
                asyncio.run_coroutine_threadsafe(self.websocket.close(), self.loop)
            except:
                pass

# Main execution
if __name__ == "__main__":
    game = PongCLI()
    try:
        game.init()
    except KeyboardInterrupt:
        print("\nExiting...")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        print("\nGame Over!")
        if (game.score_player1 == 3):
            print("Player 1 Wins!")
        else:
            print("Player 2 Wins!")
