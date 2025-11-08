// src/frontend/src/pages/profilePage.ts
import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';

export async function renderProfilePage(): Promise<void> {
    const root = document.getElementById('app-root');
    if (!root) return;

    const isGuest = localStorage.getItem('isGuest') === 'true';

    root.innerHTML = `
        <div class="neon-grid profile-container" style="width:100%; max-width:980px;">
            <div class="grid-anim"></div>
            <div class="glass-card" style="padding: 2em; width:100%;">
                <h2 class="title-neon" style="text-align: center">Profile</h2>
                <p style="text-align: center; color: rgb(156 163 175);">Loading...</p>
            </div>
        </div>
    `;

    console.log('🔄 Fetching fresh profile data...');
    const user = await authService.fetchUserProfile();

    if (!user) {
        root.innerHTML = `
            <div class="neon-grid profile-container" style="width:100%; max-width:980px;">
                <div class="grid-anim"></div>
                <div class="glass-card" style="padding: 2em; width:100%;">
                    <h2 class="title-neon" style="text-align: center">Profile</h2>
                    <p style="text-align: center; color: rgb(239 68 68);">Failed to load profile. Please try logging in again.</p>
                    <button id="backToLandingBtn" class="btn btn-back" style="margin-top: 2em;">Back to Home</button>
                </div>
            </div>
        `;
        
        const backBtn = document.getElementById('backToLandingBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                history.pushState({ page: 'pingPong' }, '', '/ping-pong');
                setCurrentPage('landing');
                renderApp();
            });
        }
        return;
    }
    
    const userData = isGuest ? {
        username: user.username || 'Guest',
        email: user.email || undefined,
        firstName: user.firstName || 'Guest',
        lastName: user.lastName || 'User',
        avatar: user.avatar || undefined,
        gamesPlayed: (user.gamesWon || 0) + (user.gamesLost || 0),
        gamesWon: user.gamesWon || 0,
        gamesLost: user.gamesLost || 0
    } : {
        username: user!.username,
        email: user!.email,
        firstName: user!.firstName,
        lastName: user!.lastName,
        avatar: user!.avatar,
        gamesPlayed: (user!.gamesWon || 0) + (user!.gamesLost || 0),
        gamesWon: user!.gamesWon || 0,
        gamesLost: user!.gamesLost || 0
    };
    
    const winRate = userData.gamesPlayed > 0 
        ? ((userData.gamesWon / userData.gamesPlayed) * 100).toFixed(1) : 0;
  
    root.innerHTML = `
        <div class="neon-grid profile-container" style="width:100%; max-width:980px;">
            <div class="grid-anim"></div>
            <div class="glass-card" style="padding: 2em; width:100%;">
                <h2 class="title-neon" style="text-align: center">Profile</h2>
                
                ${userData.avatar ? `
                    <div style="text-align: center; margin-bottom: 1.5em;">
                        <img 
                            src="${(userData.avatar || '').trim()}" 
                            alt="Avatar" 
                            referrerpolicy="no-referrer" 
                            loading="lazy"
                            style="width: 100px; height: 100px; border-radius: 50%; border: 3px solid #3b82f6;"
                            onerror="this.style.display='none';"
                        >
                    </div>
                ` : ''}
                
                <div class="username-section" style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <h3>Username</h3>
                    <p style="font-size: 1.8em; font-weight: bold; color: rgb(229 231 235); margin: 0;">${userData.username}</p>
                    ${userData.email ? `<p style="color: rgb(156 163 175); font-size: 0.9em; margin-top: 0.5em;">${userData.email}</p>` : ''}
                    ${userData.firstName || userData.lastName ? `
                        <p style="color: rgb(156 163 175); font-size: 1em; margin-top: 0.5em;">
                            ${userData.firstName || ''} ${userData.lastName || ''}
                        </p>
                    ` : ''}
                </div>
                
                <div class="stats-grid">
                    <div class="stat-box">
                        <h3>Games Played</h3>
                        <p style="font-size: 2em; font-weight: bold; color: rgb(209 213 219); margin: 0;">${userData.gamesPlayed}</p>
                    </div>
                    <div class="stat-box">
                        <h3>Win Rate</h3>
                        <p style="font-size: 2em; font-weight: bold; color: rgb(209 213 219); margin: 0;">${winRate}%</p>
                    </div>
                    <div class="stat-box">
                        <h3>Games Won</h3>
                        <p style="font-size: 2em; font-weight: bold; color: rgb(34 197 94); margin: 0;">${userData.gamesWon}</p>
                    </div>
                    <div class="stat-box">
                        <h3>Games Lost</h3>
                        <p style="font-size: 2em; font-weight: bold; color: rgb(239 68 68); margin: 0;">${userData.gamesLost}</p>
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: 1em; margin-top: 2em; justify-content: center;">
                <button id="friendListBtn" class="btn-neon accent" style="font-size: 1.05em;">
                    Friend List
                </button>
                ${!localStorage.getItem('isGuest') ? '<button id="editProfileBtn" class="btn-neon accent" style="font-size: 1.05em;"> Edit Profile </button>' : ''}
                <button id="logoutBtn" class="btn" style="font-size: 1.05em; background: #ef4444; color: #fff; border: none; border-radius: 8px; padding: 0.7em 2em; cursor: pointer;">
                    Logout
                </button>
            </div>
            
            <button id="backToLandingBtn" class="btn btn-back">Back to Home</button>
        </div>
    `;
  
    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.pushState({ page: 'gameSelect' }, '', '/gameSelect');
            setCurrentPage('gameSelect');
            renderApp();
        });
    }

    const friendBtn = document.getElementById('friendListBtn');
    if (friendBtn) {
        friendBtn.addEventListener('click', () => {
            history.pushState({ page: 'friends' }, '', '/friends');
            setCurrentPage('friends');
            renderApp();
        });
    }

    const editProfileBtn = document.getElementById('editProfileBtn');
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', () => {
            history.pushState({ page: 'editProfile' }, '', '/edit-profile');
            setCurrentPage('editProfile');
            renderApp();
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await authService.logout();
            history.pushState({ page: 'landing' }, '', '/');
            setCurrentPage('landing');
            renderApp();
        }); 
    }    
}
