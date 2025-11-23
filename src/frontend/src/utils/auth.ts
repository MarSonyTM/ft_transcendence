import { setCurrentPage, getCurrentUser as getGlobalCurrentUser, setCurrentUser } from './globalState';
import { renderApp } from '../main';
import { presenceService } from './presenceService';

export interface UserProfile {
  id: number;
  username: string;
  email?: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  gamesWon: number;
  gamesLost: number;
}

interface DecodedToken {
  id: number;
  email: string;
  username: string;
  exp: number;
}

const API_URL = window.__INITIAL_STATE__?.apiEndpoint || "http://localhost:3000";

// Public pages that don't require authentication
const publicPages = [
  '/',
  '/ping-pong',
  '/login',
  '/register',
  '/temp-login',
  '/auth/callback',
  '/verify-email',
  '/landing'
];

class AuthService {
  private static instance: AuthService;
  private currentUser: UserProfile | null = null;
  private neededEmailVerification: boolean = false;
  private pendingEmailVerification: string | null = null;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    this.initPromise = this.initializeAuth();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Wait for authentication initialization to complete
   */
  async whenReady(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * Initialize authentication by checking for stored token
   */
  private async initializeAuth(): Promise<void> {
    const path = window.location.pathname;
    if (path.includes('/auth/callback')) {
      return;
    }
    await this.fetchUserProfile();
    this.initPromise = null; // Clear the promise once initialization is complete
  }

  /**
   * Decode JWT token (simple base64 decode, no verification)
   */
  private decodeToken(token: string): DecodedToken | null {
    try {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error("Failed to decode token:", error);
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
    console.log('🔍 fetchUserProfile called from:', window.location.pathname);
    
    const path = window.location.pathname;
    // Don't auto-fetch profile on public pages, except when explicitly called from auth callback
    const hasSession = this.currentUser !== null || localStorage.getItem('isGuest') === 'true';

    if (publicPages.includes(path) && !hasSession) {
      return null;  // Only skip if no session exists
    }

    console.log('📡 Fetching user profile from backend...');
    try {
      const response = await fetch(`${API_URL}/api/users/profile`, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.log('❌ 401 Unauthorized - clearing auth state');
          this.currentUser = null;
          localStorage.removeItem("isGuest");
          localStorage.removeItem("currentUser");
          
          // Only redirect if not on a public page
          if (!publicPages.includes(path)) {
            history.pushState({ page: 'login' }, '', '/login');
            setCurrentPage('login');
            await renderApp();
          }
        } else if (response.status === 403) {
          this.neededEmailVerification = true;
          const data1 = await response.json();
          console.log('Redirecting to verify email:', data1.redirectUrl);
          window.location.href = data1.redirectUrl;
        }
        throw new Error("Failed to fetch user profile");
      }

      const data = await response.json();
      this.currentUser = data.data;
      
      // For guest users, also store in localStorage for quick access
      if (this.currentUser && localStorage.getItem('isGuest') === 'true') {
        localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
      }
      
      return this.currentUser;
    } catch (error) {
      console.error('❌ Error fetching user profile:', error);
      return null;
    }
  }

  // Get current user (from memory or fetch from backend)
  async getCurrentUser(): Promise<UserProfile | null> {
    if (this.currentUser) {
      return this.currentUser;
    }
    return await this.fetchUserProfile();
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  // Logout user
  async logout(): Promise<void> {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Error during logout:", error);
    }
    
    // Clear all state
    this.currentUser = null;
    localStorage.removeItem("isGuest");
    localStorage.removeItem("currentUser");
    presenceService.stopHeartbeat();
    
    // Redirect to login
    history.pushState({ page: 'login' }, '', '/login');
    setCurrentPage('login');
    await renderApp();
  }

  // Update user stats after game
  async updateGameStats(won: boolean): Promise<void> {
    try {
      await fetch(`${API_URL}/api/users/stats`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ won }),
      });

      // Refresh user profile to get updated stats
      await this.fetchUserProfile();
    } catch (error) {
      console.error("Error updating game stats:", error);
    }
  }

  setNeededEmailVerification(needed: boolean): void {
    this.neededEmailVerification = needed;
  }

  isEmailVerificationNeeded(): boolean {
    return this.neededEmailVerification;
  }

  setPendingEmailVerification(email: string | null): void {
    this.pendingEmailVerification = email;
  }

  getPendingEmailVerification(): string | null {
    return this.pendingEmailVerification;
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();
