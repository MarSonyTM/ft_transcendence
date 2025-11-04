import { CorePlayer as Player, GameRoom } from '../../../shared/gameTypes';

// Shared state
let currentRoom: GameRoom | null = null;

// Getters and setters
export function getCurrentRoom(): GameRoom | null {
    return currentRoom;
}

export function setCurrentRoom(room: GameRoom | null): void {
    currentRoom = room;
}

export function getLobbyPlayers(): Player[] {
    return currentRoom ? currentRoom.players : [];
}

export function clearRoomState(): void {
    currentRoom = null;
}