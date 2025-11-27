import { publicPages, renderApp } from "../main";
import { setCurrentPage } from "./globalState";

const getApiUrl = () =>
  window.__INITIAL_STATE__?.apiEndpoint || "http://localhost:3000";
const API_URL = getApiUrl();

interface DecodedToken {
  id: string;
  email: string;
  username: string;
  exp: number;
}

interface UserProfile {
  id: string | null;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  twoFactorEnabled?: boolean;
  googleId?: string;
  gamesWon: number;
  gamesLost: number;
}

export class AuthService {
  private static instance: AuthService;
  private currentUser: UserProfile | null = null;
  private token: string | null = null;
  private neededEmailVerification: boolean = false;
  private pendingEmailVerification: string | null = null;
  private pending2FAVerification: { userId: number; username: string } | null = null;
  private initPromise: Promise<void>;

  private constructor() {
    // Kick off initialization and keep a handle so callers can await readiness
    this.initPromise = this.initializeAuth().catch(() => {});
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Expose a promise that resolves when initial auth check finishes.
   * Callers can await this to avoid rendering unauthenticated UI briefly
   * when a valid session exists.
   */
  public async whenReady(): Promise<void> {
    try {
      await this.initPromise;
    } catch {
      // Swallow to avoid bubbling init failures; consumers can still
      // read isAuthenticated() which will be false on failure.
    }
  }

  /**
   * Initialize authentication by checking for stored token
   */
  private async initializeAuth(): Promise<void> {
    const path = window.location.pathname;
    // Skip auto-fetch on auth callback page - it will handle auth explicitly
    if (path.includes('/auth/callback')) {
      return;
    }
    await this.fetchUserProfile();
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


    const path = window.location.pathname;
    // Don't auto-fetch profile on public pages, except when explicitly called from auth callback
    // (Auth callback will call this after setting the token cookie)
    if (publicPages.includes(path) && !path.includes('/auth/callback')) {

      return null;
    }

    try {
      const response = await fetch(`${API_URL}/api/users/profile`, {
      credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });


      if (!response.ok) {
        if (response.status === 401) {
          await this.logout();
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
      return this.currentUser;
    } catch (error) {
      return null;
    }
  }

  async setCurrentUserProfile(user: UserProfile | null): Promise<void> {
    this.currentUser = user;
  }

  // Get current user (from memory or localStorage)
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
    this.currentUser = null;
    setCurrentPage('pingPong');
    await renderApp();
    history.pushState({ page: 'pingPong' }, '', '/ping-pong');
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

  setPending2FAVerification(data: { userId: number; username: string } | null): void {
    this.pending2FAVerification = data;
  }

  getPending2FAVerification(): { userId: number; username: string } | null {
    return this.pending2FAVerification;
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();