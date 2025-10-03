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
    player3Pos?: number = 0;
    player4Pos?: number = 0;
    scorePlayer1: number = 0;
    scorePlayer2: number = 0;
    scorePlayer3: number = 0;
    scorePlayer4: number = 0;
    gameMode: string = "";

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

    getPlayer3Pos() {
        return this.player3Pos;
    }

    getPlayer4Pos() {
        return this.player4Pos;
    }

    getScorePlayer1() {
        return this.scorePlayer1;
    }

    getScorePlayer2() {
        return this.scorePlayer2;
    }

    getScorePlayer3() {
        return this.scorePlayer3;
    }

    getScorePlayer4() {
        return this.scorePlayer4;
    }

    resetGame() {
        this.ballPosX = 0;
        this.ballPosY = 0;
        this.ballVelX = 0;
        this.ballVelY = 0;
        this.player1Pos = 0;
        this.player2Pos = 0;
        this.player3Pos = 0;
        this.player4Pos = 0;
        this.scorePlayer1 = 0;
        this.scorePlayer2 = 0;
        this.scorePlayer3 = 0;
        this.scorePlayer4 = 0;
    }

    getGameState() {
        return {
            ballPosX: this.ballPosX,
            ballPosY: this.ballPosY,
            player1Y: this.player1Pos,
            player2Y: this.player2Pos,
            player3Y: this.player3Pos,
            player4Y: this.player4Pos,
            scorePlayer1: this.scorePlayer1,
            scorePlayer2: this.scorePlayer2,
            scorePlayer3: this.scorePlayer3,
            scorePlayer4: this.scorePlayer4
        };
    }
}
