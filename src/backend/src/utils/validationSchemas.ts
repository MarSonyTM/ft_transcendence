/**
 * Comprehensive JSON Schema validation for ft_transcendence
 * Implements subject requirement IV.4: Form Validation
 */

// ===== USER SCHEMAS =====

export const userIdSchema = {
    type: 'object',
    properties: {
        id: { 
            type: 'string', 
            pattern: '^[0-9]+$',
            minLength: 1,
            maxLength: 20
        }
    },
    required: ['id'],
    additionalProperties: false
};

export const usernameSchema = {
    type: 'object',
    properties: {
        username: { 
            type: 'string', 
            minLength: 3, 
            maxLength: 50,
            pattern: '^[a-zA-Z0-9_-]+$'
        }
    },
    required: ['username'],
    additionalProperties: false
};

export const createUserSchema = {
    type: 'object',
    properties: {
        firstName: { 
            type: 'string', 
            minLength: 1, 
            maxLength: 100 
        },
        lastName: { 
            type: 'string', 
            minLength: 1, 
            maxLength: 100 
        },
        email: { 
            type: 'string', 
            format: 'email',
            maxLength: 255
        },
        username: { 
            type: 'string', 
            minLength: 3, 
            maxLength: 50,
            pattern: '^[a-zA-Z0-9_-]+$'
        },
        password: { 
            type: 'string', 
            minLength: 8, 
            maxLength: 128
        },
        avatar: { 
            type: 'string', 
            maxLength: 500 
        },
        twoFactorEnabled: { 
            type: 'boolean' 
        }
    },
    required: ['firstName', 'lastName', 'email', 'username', 'password'],
    additionalProperties: false
};

export const updateUserSchema = {
    type: 'object',
    properties: {
        firstName: { 
            type: 'string', 
            minLength: 1, 
            maxLength: 100 
        },
        lastName: { 
            type: 'string', 
            minLength: 1, 
            maxLength: 100 
        },
        email: { 
            type: 'string', 
            format: 'email',
            maxLength: 255
        },
        username: { 
            type: 'string', 
            minLength: 3, 
            maxLength: 50,
            pattern: '^[a-zA-Z0-9_-]+$'
        },
        avatar: { 
            type: 'string', 
            maxLength: 500 
        },
        twoFactorEnabled: { 
            type: 'boolean' 
        }
    },
    additionalProperties: false
};

export const loginSchema = {
    type: 'object',
    properties: {
        username: { 
            type: 'string', 
            minLength: 3, 
            maxLength: 255 
        },
        password: { 
            type: 'string', 
            minLength: 1, 
            maxLength: 128 
        },
        email: { 
            type: 'string', 
            format: 'email',
            maxLength: 255
        }
    },
    required: ['username', 'password'],
    additionalProperties: false
};

export const emailChangeSchema = {
    type: 'object',
    properties: {
        email: { 
            type: 'string', 
            format: 'email',
            maxLength: 255
        }
    },
    required: ['email'],
    additionalProperties: false
};

export const verifyEmailSchema = {
    type: 'object',
    properties: {
        verificationCode: { 
            type: 'string', 
            pattern: '^[0-9]{6}$'
        }
    },
    required: ['verificationCode'],
    additionalProperties: false
};

export const changeUsernameSchema = {
    type: 'object',
    properties: {
        newUsername: { 
            type: 'string', 
            minLength: 3, 
            maxLength: 50,
            pattern: '^[a-zA-Z0-9_-]+$'
        }
    },
    required: ['newUsername'],
    additionalProperties: false
};

export const updateStatsSchema = {
    type: 'object',
    properties: {
        won: { 
            type: 'boolean' 
        }
    },
    required: ['won'],
    additionalProperties: false
};

export const twoFactorSchema = {
    type: 'object',
    properties: {
        userId: { 
            type: 'number',
            minimum: 1
        },
        code: { 
            type: 'string', 
            pattern: '^[0-9]{6}$'
        }
    },
    required: ['userId', 'code'],
    additionalProperties: false
};

// ===== GAME SCHEMAS =====

export const createGameSchema = {
    type: 'object',
    properties: {
        mode: { 
            type: 'string', 
            enum: ['2P', '4P']
        },
        hostId: { 
            type: 'number',
            minimum: 1
        }
    },
    required: ['mode'],
    additionalProperties: false
};

export const gameIdSchema = {
    type: 'object',
    properties: {
        id: { 
            type: 'string', 
            pattern: '^[0-9]+$',
            minLength: 1,
            maxLength: 20
        }
    },
    required: ['id'],
    additionalProperties: false
};

export const joinGameSchema = {
    type: 'object',
    properties: {
        gameId: { 
            type: 'number',
            minimum: 1
        },
        userId: { 
            type: 'number',
            minimum: 1
        }
    },
    required: ['gameId', 'userId'],
    additionalProperties: false
};

// ===== PLAYER SCHEMAS =====

export const createPlayerSchema = {
    type: 'object',
    properties: {
        gameId: { 
            type: 'number',
            minimum: 1
        },
        playerId: { 
            type: 'number',
            minimum: 1
        },
        playerPosition: { 
            type: 'string',
            enum: ['left', 'right', 'top', 'bottom', 'player1', 'player2', 'player3', 'player4']
        },
        name: {
            type: 'string',
            minLength: 1,
            maxLength: 50
        }
    },
    required: ['gameId', 'playerId', 'playerPosition'],
    additionalProperties: false
};

export const updatePlayerSchema = {
    type: 'object',
    properties: {
        pos: { 
            type: 'number'
        },
        score: { 
            type: 'number',
            minimum: 0
        },
        connectionStatus: {
            type: 'string',
            enum: ['connected', 'disconnected', 'idle']
        }
    },
    additionalProperties: false
};

// ===== ROOM SCHEMAS =====

export const createRoomSchema = {
    type: 'object',
    properties: {
        hostId: { 
            type: 'string',
            minLength: 1,
            maxLength: 100
        },
        maxPlayers: { 
            type: 'number',
            minimum: 2,
            maximum: 4
        },
        mode: { 
            type: 'string',
            enum: ['2P', '4P']
        }
    },
    required: ['hostId', 'maxPlayers', 'mode'],
    additionalProperties: false
};

export const joinRoomSchema = {
    type: 'object',
    properties: {
        roomId: { 
            type: 'string',
            minLength: 1,
            maxLength: 100
        },
        playerId: { 
            type: 'string',
            minLength: 1,
            maxLength: 100
        },
        username: { 
            type: 'string',
            minLength: 1,
            maxLength: 50
        }
    },
    required: ['roomId', 'playerId', 'username'],
    additionalProperties: false
};

export const roomIdSchema = {
    type: 'object',
    properties: {
        roomId: { 
            type: 'string',
            minLength: 1,
            maxLength: 100
        }
    },
    required: ['roomId'],
    additionalProperties: false
};

// ===== TOURNAMENT SCHEMAS =====

export const createTournamentSchema = {
    type: 'object',
    properties: {
        name: { 
            type: 'string',
            minLength: 3,
            maxLength: 100
        },
        playerAliases: {
            type: 'array',
            items: {
                type: 'string',
                minLength: 1,
                maxLength: 50
            },
            minItems: 2,
            maxItems: 16
        }
    },
    required: ['playerAliases'],
    additionalProperties: false
};

export const tournamentIdSchema = {
    type: 'object',
    properties: {
        id: { 
            type: 'string', 
            pattern: '^[0-9]+$',
            minLength: 1,
            maxLength: 20
        }
    },
    required: ['id'],
    additionalProperties: false
};

// ===== FRIEND SCHEMAS =====

export const addFriendSchema = {
    type: 'object',
    properties: {
        friendId: { 
            type: 'number',
            minimum: 1
        }
    },
    required: ['friendId'],
    additionalProperties: false
};

export const removeFriendSchema = {
    type: 'object',
    properties: {
        friendId: { 
            type: 'number',
            minimum: 1
        }
    },
    required: ['friendId'],
    additionalProperties: false
};

// ===== GAME STATE SCHEMAS =====

export const updateGameStateSchema = {
    type: 'object',
    properties: {
        ballPosX: { 
            type: 'number'
        },
        ballPosY: { 
            type: 'number'
        },
        ballVelX: { 
            type: 'number'
        },
        ballVelY: { 
            type: 'number'
        },
        lastContact: {
            type: 'number',
            minimum: 0
        }
    },
    additionalProperties: false
};

