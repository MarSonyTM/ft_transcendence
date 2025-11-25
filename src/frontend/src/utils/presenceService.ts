interface UserPresence {
    userId: number;
    username: string;
    status: 'online' | 'offline' | 'in game';
}

class PresenceService {
    private heartbeatTimer: number | null = null;
    private heartbeatInterval: number = 30000;
    private presenceCache: Map<number, UserPresence> = new Map();

    // Helper to get API endpoint
    private getApiUrl(): string {
        return window.__INITIAL_STATE__?.apiEndpoint || 'http://localhost:3000';
    }

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
            const apiUrl = this.getApiUrl();
            const response = await fetch(`${apiUrl}/api/auth/presence/heartbeat`, {
                method: 'POST',
                credentials: 'include',
                headers: {
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

    /**
     * Set user status to "in game"
     */
    async setInGame(): Promise<boolean> {
        try {
            const apiUrl = this.getApiUrl();
            const response = await fetch(`${apiUrl}/api/auth/presence/status`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: 'in game' })
            });

            if (response.ok) {
                return true;
            } else {
                console.error('❌ [PRESENCE] Failed to set in game status:', response.status);
                return false;
            }
        } catch (error) {
            console.error('❌ [PRESENCE] Error setting in game status:', error);
            return false;
        }
    }

    /**
     * Set user status to "online"
     */
    async setOnline(): Promise<boolean> {
        try {
            const apiUrl = this.getApiUrl();
            const response = await fetch(`${apiUrl}/api/auth/presence/status`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: 'online' })
            });

            if (response.ok) {
                return true;
            } else {
                console.error('❌ [PRESENCE] Failed to set online status:', response.status);
                return false;
            }
        } catch (error) {
            console.error('❌ [PRESENCE] Error setting online status:', error);
            return false;
        }
    }

    async fetchUserPresence(userId: number): Promise<UserPresence | null> {
        try {
            const apiUrl = this.getApiUrl();
            const response = await fetch(`${apiUrl}/api/auth/presence/user/${userId}`, {
                credentials: 'include',
                headers: { 
                    'Content-Type': 'application/json'
                }
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
            const apiUrl = this.getApiUrl();
            const response = await fetch(`${apiUrl}/api/auth/presence/batch`, {
                method: 'POST',
                credentials: 'include',
                headers: {
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

    getStatus(): string {
        const isRunning = this.heartbeatTimer !== null;
        return isRunning ? '🟢 Heartbeat is running' : '🔴 Heartbeat is stopped';
    }

}

export const presenceService = new PresenceService();