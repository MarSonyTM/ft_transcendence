import { authService } from './auth';
import { setCurrentPage } from './globalState';
import { renderApp } from '../main';

/**
 * Creates a user navigation bar with a dropdown menu
 * Shows username and provides access to Profile, Settings, and Logout
 */
export async function createUserNav(): Promise<string> {
    const user = await authService.getCurrentUser();
    
    if (!user) {
        return ''; // No nav for unauthenticated users
    }

    const displayName = user.username || 'User';

    return `
        <nav class="user-nav" style="position: fixed; top: 0; right: 0; z-index: 1000; padding: 1em 2em;">
            <div class="user-menu-container" style="position: relative;">
                <button id="userMenuBtn" class="user-menu-btn" style="
                    display: flex;
                    align-items: center;
                    gap: 0.5em;
                    background: rgba(0, 0, 0, 0.7);
                    border: 1px solid rgba(0, 255, 255, 0.3);
                    border-radius: 8px;
                    padding: 0.6em 1em;
                    color: #00ffff;
                    cursor: pointer;
                    font-size: 1em;
                    transition: all 0.3s ease;
                    backdrop-filter: blur(10px);
                ">
                    <span style="font-weight: 500;">${displayName}</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2 4L6 8L10 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                
                <div id="userMenuDropdown" class="user-menu-dropdown" style="
                    display: none;
                    position: absolute;
                    top: calc(100% + 0.5em);
                    right: 0;
                    background: rgba(0, 0, 0, 0.95);
                    border: 1px solid rgba(0, 255, 255, 0.3);
                    border-radius: 8px;
                    min-width: 180px;
                    overflow: hidden;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 8px 32px rgba(0, 255, 255, 0.1);
                ">
                    <button id="navHomeBtn" class="user-menu-item" style="
                        width: 100%;
                        text-align: left;
                        padding: 0.8em 1.2em;
                        background: transparent;
                        border: none;
                        color: #00ffff;
                        cursor: pointer;
                        font-size: 0.95em;
                        transition: background 0.2s ease;
                        border-bottom: 1px solid rgba(0, 255, 255, 0.1);
                    ">
                        🏠 Home
                    </button>
                    <button id="navProfileBtn" class="user-menu-item" style="
                        width: 100%;
                        text-align: left;
                        padding: 0.8em 1.2em;
                        background: transparent;
                        border: none;
                        color: #00ffff;
                        cursor: pointer;
                        font-size: 0.95em;
                        transition: background 0.2s ease;
                        border-bottom: 1px solid rgba(0, 255, 255, 0.1);
                    ">
                        👤 Profile
                    </button>
                    <button id="navLeaderboardBtn" class="user-menu-item" style="
                        width: 100%;
                        text-align: left;
                        padding: 0.8em 1.2em;
                        background: transparent;
                        border: none;
                        color: #00ffff;
                        cursor: pointer;
                        font-size: 0.95em;
                        transition: background 0.2s ease;
                        border-bottom: 1px solid rgba(0, 255, 255, 0.1);
                    ">
                        🏆 Leaderboard
                    </button>
                    <button id="navStatsBtn" class="user-menu-item" style="
                        width: 100%;
                        text-align: left;
                        padding: 0.8em 1.2em;
                        background: transparent;
                        border: none;
                        color: #00ffff;
                        cursor: pointer;
                        font-size: 0.95em;
                        transition: background 0.2s ease;
                        border-bottom: 1px solid rgba(0, 255, 255, 0.1);
                    ">
                        📊 Statistics
                    </button>
                    <button id="navLogoutBtn" class="user-menu-item" style="
                        width: 100%;
                        text-align: left;
                        padding: 0.8em 1.2em;
                        background: transparent;
                        border: none;
                        color: #ef4444;
                        cursor: pointer;
                        font-size: 0.95em;
                        transition: background 0.2s ease;
                    ">
                        🚪 Logout
                    </button>
                </div>
            </div>
        </nav>
        
        <style>
            .user-menu-btn:hover {
                border-color: rgba(0, 255, 255, 0.6);
                box-shadow: 0 0 15px rgba(0, 255, 255, 0.3);
            }
            
            .user-menu-item:hover {
                background: rgba(0, 255, 255, 0.1);
            }
            
            .user-menu-dropdown.show {
                display: block !important;
            }
        </style>
    `;
}

/**
 * Attaches event listeners to the user navigation
 * Call this after rendering the nav HTML
 */
export function attachUserNavListeners(): void {
    const menuBtn = document.getElementById('userMenuBtn');
    const dropdown = document.getElementById('userMenuDropdown');
    const homeBtn = document.getElementById('navHomeBtn');
    const profileBtn = document.getElementById('navProfileBtn');
    const editProfileBtn = document.getElementById('navEditProfileBtn');
    const leaderboardBtn = document.getElementById('navLeaderboardBtn');
    const statsBtn = document.getElementById('navStatsBtn');
    const logoutBtn = document.getElementById('navLogoutBtn');

    if (!menuBtn || !dropdown) return;

    // Toggle dropdown
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.user-menu-container')) {
            dropdown.classList.remove('show');
        }
    });

    // Home button
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            dropdown.classList.remove('show');
            history.pushState({ page: 'landing' }, '', '/landing');
            setCurrentPage('landing');
            renderApp();
        });
    }

    // Profile button
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            dropdown.classList.remove('show');
            history.pushState({ page: 'profile' }, '', '/profile');
            setCurrentPage('profile');
            renderApp();
        });
    }

    // Edit Profile button
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', () => {
            dropdown.classList.remove('show');
            history.pushState({ page: 'editProfile' }, '', '/edit-profile');
            setCurrentPage('editProfile');
            renderApp();
        });
    }

    // Leaderboard button
    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', () => {
            dropdown.classList.remove('show');
            history.pushState({ page: 'leaderboard' }, '', '/leaderboard');
            setCurrentPage('leaderboard');
            renderApp();
        });
    }

    // Statistics button
    if (statsBtn) {
        statsBtn.addEventListener('click', () => {
            dropdown.classList.remove('show');
            history.pushState({ page: 'stats' }, '', '/stats');
            setCurrentPage('stats');
            renderApp();
        });
    }

    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            dropdown.classList.remove('show');
            await authService.logout();
            history.pushState({ page: 'landing' }, '', '/');
            setCurrentPage('landing');
            renderApp();
        });
    }
}

