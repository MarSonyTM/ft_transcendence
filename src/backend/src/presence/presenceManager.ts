interface UserPresence {
    userId: number;
    username: string;
    status: 'online' | 'offline' | 'away';
    lastSeen: Date;
    lastHeartbeat: Date;
}

class PresenceManager {
    private userPresence: Map<number, UserPresence> = new Map();
    private heartbeatInterval = 30000;
    private timeoutThreshold = 60000;
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.startCleanupTask();
    }

    updateHeartbeat(userId: number, username: string): UserPresence {
        const now = new Date();
        const presence: UserPresence = {
            userId,
            username,
            status: 'online',
            lastSeen: now,
            lastHeartbeat: now
        };
        this.userPresence.set(userId, presence);
        return presence;
    }

    setUserOffline(userId: number): UserPresence | null {
        const presence = this.userPresence.get(userId);
        if (!presence) return null;
        presence.status = 'offline';
        presence.lastSeen = new Date();
        return presence;
    }

    getUserPresence(userId: number): UserPresence | null {
        return this.userPresence.get(userId) || null;
    }

    getOnlineUsers(): UserPresence[] {
        return Array.from(this.userPresence.values())
            .filter(p => p.status === 'online');
    }

    getMultiplePresences(userIds: number[]): Map<number, UserPresence> {
        const result = new Map<number, UserPresence>();
        for (const userId of userIds) {
            const presence = this.userPresence.get(userId);
            if (presence) {
                result.set(userId, presence);
            }
        }
        return result;
    }

    private checkStaleConnections(): void {
        const now = Date.now();
        for (const [userId, presence] of this.userPresence.entries()) {
            const timeSinceHeartbeat = now - presence.lastHeartbeat.getTime();
            if (timeSinceHeartbeat > this.timeoutThreshold && presence.status !== 'offline') {
                presence.status = 'offline';
                presence.lastSeen = new Date();
            }
        }
    }

    private startCleanupTask(): void {
        this.cleanupInterval = setInterval(() => {
            this.checkStaleConnections();
        }, 15000);
    }
}

export const presenceManager = new PresenceManager();
export type { UserPresence };
