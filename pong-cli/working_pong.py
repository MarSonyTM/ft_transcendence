#!/home/schmitzi/fuckpy/bin/python3

import curses
import time
import random

class WorkingPong:
    def __init__(self):
        self.stdscr = None
        self.running = True
        
        # Game dimensions
        self.width = 60
        self.height = 20
        
        # Ball
        self.ball_x = 30
        self.ball_y = 10
        self.ball_dx = 1
        self.ball_dy = 1
        
        # Paddles
        self.paddle1_y = 8
        self.paddle2_y = 8
        self.paddle_height = 4
        
        # Scores
        self.score1 = 0
        self.score2 = 0
        self.win_score = 3
        
    def init_curses(self):
        """Initialize curses"""
        self.stdscr = curses.initscr()
        curses.cbreak()
        curses.noecho()
        self.stdscr.keypad(True)
        self.stdscr.nodelay(True)
        curses.curs_set(0)
        
    def cleanup(self):
        """Clean up curses"""
        if self.stdscr:
            curses.endwin()
    
    def handle_input(self):
        """Handle keyboard input"""
        try:
            key = self.stdscr.getch()
            if key == curses.ERR:
                return
                
            # Player 1 controls (W/S)
            if key == ord('w') and self.paddle1_y > 1:
                self.paddle1_y -= 1
            elif key == ord('s') and self.paddle1_y < self.height - self.paddle_height - 1:
                self.paddle1_y += 1
                
            # Player 2 controls (O/L)
            elif key == ord('o') and self.paddle2_y > 1:
                self.paddle2_y -= 1
            elif key == ord('l') and self.paddle2_y < self.height - self.paddle_height - 1:
                self.paddle2_y += 1
                
            # Quit
            elif key == ord('q'):
                self.running = False
                
        except:
            pass
    
    def update_game(self):
        """Update game logic"""
        # Move ball
        self.ball_x += self.ball_dx
        self.ball_y += self.ball_dy
        
        # Bounce off top and bottom
        if self.ball_y <= 1 or self.ball_y >= self.height - 2:
            self.ball_dy = -self.ball_dy
        
        # Bounce off paddles
        if self.ball_x <= 2:
            if self.paddle1_y <= self.ball_y <= self.paddle1_y + self.paddle_height:
                self.ball_dx = -self.ball_dx
                # Add some randomness
                self.ball_dy += random.choice([-1, 0, 1])
            else:
                # Player 2 scores
                self.score2 += 1
                self.reset_ball()
                
        elif self.ball_x >= self.width - 2:
            if self.paddle2_y <= self.ball_y <= self.paddle2_y + self.paddle_height:
                self.ball_dx = -self.ball_dx
                # Add some randomness
                self.ball_dy += random.choice([-1, 0, 1])
            else:
                # Player 1 scores
                self.score1 += 1
                self.reset_ball()
        
        # Check win condition
        if self.score1 >= self.win_score or self.score2 >= self.win_score:
            self.running = False
    
    def reset_ball(self):
        """Reset ball to center"""
        self.ball_x = self.width // 2
        self.ball_y = self.height // 2
        self.ball_dx = random.choice([-1, 1])
        self.ball_dy = random.choice([-1, 1])
    
    def render(self):
        """Render the game"""
        if not self.stdscr:
            return
        
        # Clear screen
        self.stdscr.clear()
        
        # Draw borders
        for y in range(1, self.height + 1):
            self.stdscr.addch(y, 1, '|')
            self.stdscr.addch(y, self.width, '|')
        
        for x in range(1, self.width + 1):
            self.stdscr.addch(1, x, '-')
            self.stdscr.addch(self.height, x, '-')
        
        # Draw center line
        center_x = self.width // 2
        for y in range(2, self.height):
            if y % 2 == 0:
                self.stdscr.addch(y, center_x, '|')
        
        # Draw paddles
        for i in range(self.paddle_height):
            self.stdscr.addch(self.paddle1_y + i, 2, '█')
            self.stdscr.addch(self.paddle2_y + i, self.width - 1, '█')
        
        # Draw ball
        if 1 <= self.ball_y <= self.height and 1 <= self.ball_x <= self.width:
            self.stdscr.addch(self.ball_y, self.ball_x, '●')
        
        # Draw scores
        self.stdscr.addstr(0, 5, f"Player 1: {self.score1}")
        self.stdscr.addstr(0, self.width - 15, f"Player 2: {self.score2}")
        
        # Draw win message
        if self.score1 >= self.win_score:
            self.stdscr.addstr(self.height + 1, 2, "*** PLAYER 1 WINS! ***")
        elif self.score2 >= self.win_score:
            self.stdscr.addstr(self.height + 1, 2, "*** PLAYER 2 WINS! ***")
        
        # Draw controls
        self.stdscr.addstr(self.height + 2, 2, "Controls: W/S (P1) | O/L (P2) | Q (quit)")
        self.stdscr.addstr(self.height + 3, 2, f"First to {self.win_score} wins")
        
        self.stdscr.refresh()
    
    def run(self):
        """Main game loop"""
        self.init_curses()
        
        try:
            while self.running:
                self.handle_input()
                self.update_game()
                self.render()
                time.sleep(0.1)  # 10 FPS
        except KeyboardInterrupt:
            pass
        finally:
            self.cleanup()
            print(f"\nFinal Score: Player 1: {self.score1} - Player 2: {self.score2}")

if __name__ == "__main__":
    game = WorkingPong()
    game.run()
