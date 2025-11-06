import { database } from '../database/index';
import { Player } from '../../../shared/gameTypes';

export class GameState {
    id: number = 0;
    gameId: number = 0;
    ballPosX: number = 0;
    ballPosY: number = 0;
    ballVelX: number = 0;
    ballVelY: number = 0;
    players: Player[] = [];
    mode: string = "";
    lastContact: number = 0;
    lastActivity: string = new Date().toISOString();

    getBallPosX() {
        return this.ballPosX;
    }

    getBallPosY() {
        return this.ballPosY;
    }

    getPlayers() {
        return this.players;
    }

    getPlayerPos(playerId: number) {
        const player = this.players.find(p => p.id === playerId);
        return player ? player.pos : null;
    }

    getPlayerScore(playerId: number) {
        const player = this.players.find(p => p.id === playerId);
        return player ? player.score : null;
    }

    resetGame() {
        this.ballPosX = 0;
        this.ballPosY = 0;
        this.ballVelX = 0;
        this.ballVelY = 0;
        this.players.forEach(player => player.score = 0);
    }

    getGameState() {
        return {
            gameId: this.gameId,
            id: this.id,
            ballPosX: this.ballPosX,
            ballPosY: this.ballPosY,
            ballVelX: this.ballVelX,
            ballVelY: this.ballVelY,
            players: this.players.map(player => ({
                id: player.id,
                name: player.name,
                pos: player.pos,
                score: player.score,
                connectionStatus: player.connectionStatus,
                lastActivity: player.lastActivity
            })),
            mode: this.mode,
            lastContact: this.lastContact,
            lastActivity: this.lastActivity
        };
    }
}
