import { authService } from "./auth";  

export async function getGuestUsername(): Promise<string | null> {

    const user = await authService.getCurrentUser();
    return user ? user.username : null;
}

export async function showGuestBanner(): Promise<HTMLElement | null> {
  
    const banner = document.createElement('div');
    banner.id = 'guest-banner';
    banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 0.8em;
        text-align: center;
        z-index: 1000;
        font-size: 0.9em;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
  
    const username = await getGuestUsername() || 'Guest';
    banner.innerHTML = `
        <span>👋 Playing as <strong>${username}</strong> (Guest)</span>
        <button 
            id="register-guest-btn" 
            style="
                margin-left: 1em;
                padding: 0.4em 1em;
                background: white;
                color: #667eea;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-weight: bold;
        ">
            Create Account
        </button>
        <button 
            id="dismiss-guest-banner" 
            style="
                margin-left: 0.5em;
                padding: 0.4em 0.8em;
                background: rgba(255,255,255,0.2);
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
        ">
            ×
        </button>
    `;
  
    document.body.prepend(banner);
  
    // Add event listeners
    const registerBtn = document.getElementById('register-guest-btn');
    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            // Navigate to registration page
            history.pushState({ page: 'register' }, '', '/register');
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
    }
  
    const dismissBtn = document.getElementById('dismiss-guest-banner');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            banner.remove();
            // Remember dismissal for this session
            sessionStorage.setItem('guestBannerDismissed', 'true');
        });
    }
  
    return banner;
}

export function initGuestBanner(): void {
    // Only show if not dismissed in this session
    if (sessionStorage.getItem('guestBannerDismissed') !== 'true') {
        showGuestBanner();
    }
}

export async function clearGuestSession(): Promise<void> {
    await authService.logout();
    sessionStorage.removeItem('guestBannerDismissed');
}

//TODO: improve expiration check for guest users
export function isGuestSessionExpired(): boolean {

    const user = authService.getCurrentUser();
    if (!user) return true;
  
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));//TODO MERGE -> no token?
        const exp = payload.exp * 1000; // Convert to milliseconds
        return Date.now() > exp;
    } catch {
        return true;
    }
}
