interface UserPresence {
    userId: number;
    username: string;
    status: 'online' | 'offline' | 'away';
}

class PresenceService {
    private heartbeatTimer: number | null = null;
    private heartbeatInterval: number = 30000;
    private presenceCache: Map<number, UserPresence> = new Map();

    startHeartbeat(): void {
        this.stopHeartbeat();
        this.sendHeartbeat();
        this.heartbeatTimer = window.setInterval(() => {
            this.sendHeartbeat();
        }, this.heartbeatInterval);
    }

    stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private async sendHeartbeat(): Promise<void> {
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/auth/presence/heartbeat', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });
            
            if (!response.ok) {
                console.error('❌ [PRESENCE] Heartbeat failed:', response.status);
            }
        } catch (error) {
            console.error('❌ [PRESENCE] Heartbeat error:', error);
        }
    }

    async fetchUserPresence(userId: number): Promise<UserPresence | null> {
        try {
            const token = localStorage.getItem('authToken');
            
            const response = await fetch(`/api/auth/presence/user/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success && data.data) {
                this.presenceCache.set(userId, data.data);
                return data.data;
            }
            return null;
        } catch (error) {
            console.error('[PRESENCE] Fetch user presence error:', error);
            return null;
        }
    }

    async fetchBatchPresence(userIds: number[]): Promise<Map<number, UserPresence>> {
        try {
            const token = localStorage.getItem('authToken');
            
            const response = await fetch('/api/auth/presence/batch', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userIds })
            });
            const data = await response.json();
            
            const result = new Map<number, UserPresence>();
            if (data.success && data.data) {
                for (const [userId, presence] of Object.entries(data.data)) {
                    result.set(parseInt(userId), presence as UserPresence);
                    this.presenceCache.set(parseInt(userId), presence as UserPresence);
                }
            }
            return result;
        } catch (error) {
            console.error('❌ [PRESENCE] Fetch batch error:', error);
            return new Map();
        }
    }

    getUserPresence(userId: number): UserPresence | null {
        return this.presenceCache.get(userId) || null;
    }

    // Debug method to check status
    getStatus(): string {
        const isRunning = this.heartbeatTimer !== null;
        return isRunning ? '🟢 Heartbeat is running' : '🔴 Heartbeat is stopped';
    }
}

export const presenceService = new PresenceService();
