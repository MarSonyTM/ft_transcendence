export interface Player {
    id: string;
    username: string;
    isReady: boolean;
    avatar?: string;
    isAI?: boolean;
    difficulty?: string;
    socketId?: string;
}

export interface GameRoom {
    roomId: string;
    hostId: string;
    players: Player[];
    maxPlayers: number;
    status: 'waiting' | 'playing' | 'finished';
    gameId?: number;
}

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
