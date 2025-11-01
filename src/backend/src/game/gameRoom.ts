import { get } from 'http';
import { CorePlayer as Player, GameRoom } from '../../../shared/gameTypes';

class GameRoomManager {
  private rooms: Map<string, GameRoom> = new Map();

  // Generate a unique room ID
  generateRoomId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Create a new game room
  createRoom(hostId: string, hostUsername: string, maxPlayers: number = 2, opts?: { hostIsAI?: boolean; hostIsLocal?: boolean; difficulty?: string }): GameRoom {
    const roomId = this.generateRoomId();

    const room: GameRoom = {
      roomId,
      hostId,
      players: [{
        id: 0,
        playerId: hostId,
        alias: hostUsername,
        avatar: undefined,
        isReady: false,
        isAI: !!opts?.hostIsAI,
        isLocal: opts?.hostIsLocal === undefined ? !opts?.hostIsAI : !!opts?.hostIsLocal,
        difficulty: opts?.difficulty,
        user: undefined,
        pos: 0,
        score: 0,
        connectionStatus: 'connected',
        lastActivity: new Date().toISOString()
      }],
      maxPlayers,
      status: 'waiting',
      createdAt: new Date()
    };

    this.rooms.set(roomId, room);
    console.log(`✅ Room created: ${roomId} by ${hostUsername}`);
    return room;
  }

  // Get room by ID
  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  // Join an existing room
  joinRoom(roomId: string, playerId: string, username: string, isAI: boolean, isReady: 
            boolean, isLocal: boolean, difficulty?: string): { success: boolean; message: string; room?: GameRoom } {

    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    if (room.status !== 'waiting') {
      return { success: false, message: 'Game already in progress' };
    }

    if (room.players.length >= room.maxPlayers) {
      return { success: false, message: 'Room is full' };
    }

    // Check if player already in room
    if (room.players.some(p => p.playerId === playerId)) {
      return { success: false, message: 'Already in this room' };
    }

    room.players.push({
      id: room.players.length,
      playerId: playerId,
      alias: username,
      isReady: isReady,
      isAI: isAI,
      isLocal: isLocal,
      avatar: undefined,
      user: undefined,
      pos: 0,
      score: 0,
      connectionStatus: 'connected',
      lastActivity: new Date().toISOString()
    });

    console.log(`✅ ${username} ${isAI ? `(${difficulty || 'normal'}) (AI)` : ''} joined room ${roomId}`);
    return { success: true, message: 'Joined successfully', room };
  }

  // Leave a room
  leaveRoom(roomId: string, playerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const playerIndex = room.players.findIndex(p => p.playerId === playerId);
    if (playerIndex === -1) return false;

    room.players.splice(playerIndex, 1);

    // If host left or room empty, delete room
    if (room.players.length === 0 || playerId === room.hostId) {
      this.rooms.delete(roomId);
      console.log(`🗑️ Room ${roomId} deleted`);
      return true;
    }

    // Assign new host if needed
    if (playerId === room.hostId && room.players.length > 0) {
      room.hostId = room.players[0].playerId;
    }

    return true;
  }

  // Toggle player ready status
  toggleReady(roomId: string, playerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const player = room.players.find(p => p.playerId === playerId);
    if (!player) return false;

    player.isReady = !player.isReady;
    return true;
  }

  // Check if all players are ready
  allPlayersReady(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || room.players.length < 2) return false;

    return room.players.every(p => p.isReady);
  }

  // Start the game
  startGame(roomId: string, gameId: number): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    if (!this.allPlayersReady(roomId)) return false;

    room.status = 'playing';
    room.gameId = gameId;
    console.log(` Game started in room ${roomId}`);
    return true;
  }

  // End the game
  endGame(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    room.status = 'finished';
    console.log(`🏁 Game ended in room ${roomId}`);
    
    // Clean up room after 30 seconds
    setTimeout(() => {
      this.rooms.delete(roomId);
      console.log(`🗑️ Room ${roomId} cleaned up`);
    }, 30000);

    return true;
  }

  // Get all active rooms
  getAllRooms(): GameRoom[] {
    return Array.from(this.rooms.values());
  }

  // Associate socket with player
  setPlayerSocket(roomId: string, playerId: string, socketId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const player = room.players.find(p => p.playerId === playerId);
    if (!player) return false;

    player.socketId = socketId;
    return true;
  }
}

// Export singleton instance
export const gameRoomManager = new GameRoomManager();
export type { GameRoom, Player };