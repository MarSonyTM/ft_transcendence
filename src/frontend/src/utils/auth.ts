const API_URL = '';

interface DecodedToken {
  id: string;
  email: string;
  username: string;
  exp: number;
}

interface UserProfile {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  googleId?: string;
  gamesWon: number;
  gamesLost: number;
}

export class AuthService {
  private static instance: AuthService;
  private currentUser: UserProfile | null = null;

  private constructor() {
    this.initializeAuth();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Initialize authentication by checking for stored token
   */
  private async initializeAuth(): Promise<void> {
    const token = this.getToken();
    if (token && !this.isTokenExpired(token)) {
      await this.fetchUserProfile();
    } else if (token) {
      // Token expired, clear it
      this.logout();
    }
  }

  /**
   * Get the stored auth token
   */
  getToken(): string | null {
    return localStorage.getItem('authToken');
  }

  /**
   * Store auth token
   */
  setToken(token: string): void {
    localStorage.setItem('authToken', token);
  }

  /**
   * Decode JWT token (simple base64 decode, no verification)
   */
  private decodeToken(token: string): DecodedToken | null {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Failed to decode token:', error);
      return null;
    }
  }

  // Check if token is expired
  isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded) return true;
    
    const currentTime = Date.now() / 1000;
    return decoded.exp < currentTime;
  }

  
  // Fetch user profile from backend
  async fetchUserProfile(): Promise<UserProfile | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      const response = await fetch(`${API_URL}/api/users/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.logout();
        }
        throw new Error('Failed to fetch user profile');
      }

      const data = await response.json();
      this.currentUser = data.data;
      
      // Store in localStorage for quick access
      localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
      
      return this.currentUser;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }

  // Get current user (from memory or localStorage)
  getCurrentUser(): UserProfile | null {
    if (this.currentUser) {
      return this.currentUser;
    }

    // Try to get from localStorage
    const stored = localStorage.getItem('currentUser');
    if (stored) {
      try {
        this.currentUser = JSON.parse(stored);
        return this.currentUser;
      } catch {
        return null;
      }
    }

    return null;
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    const token = this.getToken();
    return token !== null && !this.isTokenExpired(token);
  }

  // Logout user
  logout(): void {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    this.currentUser = null;
  }

  // Helper: authorization header for authenticated requests
  getAuthHeader(): Record<string, string> | null {
    const token = this.getToken();
    if (!token) return null;
    return { 'Authorization': `Bearer ${token}` };
  }

  // Update user stats after game
  async updateGameStats(won: boolean): Promise<void> {
    const token = this.getToken();
    if (!token) return;

    try {
      await fetch(`${API_URL}/api/users/stats`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ won })
      });

      // Refresh user profile to get updated stats
      await this.fetchUserProfile();
    } catch (error) {
      console.error('Error updating game stats:', error);
    }
  }

}

// Export singleton instance
export const authService = AuthService.getInstance();