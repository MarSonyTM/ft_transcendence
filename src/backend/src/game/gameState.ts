export class GameState {
    id?: number;
    player1Id: number = 0;
    player2Id: number = 0;
    ballPosX: number = 0;
    ballPosY: number = 0;
    ballVelX: number = 0;
    ballVelY: number = 0;
    player1Pos?: number = 0;
    player2Pos?: number = 0;
    scorePlayer1: number = 0;
    scorePlayer2: number = 0;

    getBallPosX() {
        return this.ballPosX;
    }

    getBallPosY() {
        return this.ballPosY;
    }

    getPlayer1Pos() {
        return this.player1Pos;
    }

    getPlayer2Pos() {
        return this.player2Pos;
    }

    getScorePlayer1() {
        return this.scorePlayer1;
    }

    getScorePlayer2() {
        return this.scorePlayer2;
    }

    resetGame() {
        this.ballPosX = 0;
        this.ballPosY = 0;
        this.ballVelX = 0;
        this.ballVelY = 0;
        this.player1Pos = 0;
        this.player2Pos = 0;
        this.scorePlayer1 = 0;
        this.scorePlayer2 = 0;
    }

    getGameState() {
        return {
            ballPosX: this.ballPosX,
            ballPosY: this.ballPosY,
            player1Y: this.player1Pos,
            player2Y: this.player2Pos,
            scorePlayer1: this.scorePlayer1,
            scorePlayer2: this.scorePlayer2
        };
    }
}
