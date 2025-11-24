// src/frontend/src/pages/profilePage.ts
import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { createUserNav, attachUserNavListeners } from '../utils/navigation';

export async function renderProfilePage(): Promise<void> {
    const root = document.getElementById('app-root');
    if (!root) return;

    // Show loading state
    root.innerHTML = `
        <div class="neon-grid profile-container" style="width:100%; max-width:980px;">
            <div class="grid-anim"></div>
            <div class="glass-card" style="padding: 2em; width:100%;">
                <h2 class="title-neon" style="text-align: center">Profile</h2>
                <p style="text-align: center; color: rgb(156 163 175);">Loading...</p>
            </div>
        </div>
    `;

    
    // Fetch fresh user data from server (not cached!)
    const userData = await authService.getCurrentUser();
    
    if (!userData) {
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
                history.pushState({ page: 'landing' }, '', '/');
                setCurrentPage('landing');
                renderApp();
            });
        }
        return;
    }

    const gamesPlayed = userData.gamesLost + userData.gamesWon;
    
    const winRate = gamesPlayed > 0 ? ((userData.gamesWon / gamesPlayed) * 100).toFixed(1) : 0;
    

    const userNavHTML = await createUserNav();
    root.innerHTML = `
        <div class="neon-grid profile-container" style="width:100%; max-width:1200px; margin: 0 auto;">
            ${userNavHTML}
            <div class="grid-anim"></div>
            <div class="glass-card" style="padding: 2.5em; width:100%;">
                <h2 class="title-neon" style="text-align: center; margin-bottom: 2em;">Profile</h2>
                
                <!-- Desktop Layout: Avatar + Info + Stats in one row -->
                <div style="display: grid; grid-template-columns: auto 1fr auto; gap: 3em; align-items: center; margin-bottom: 2.5em;">
                    
                    <!-- Avatar Column -->
                    <div style="text-align: center;">
                        ${userData.avatar ? `
                            <img 
                                id="profileAvatar"
                                src="${(userData.avatar || '').trim()}" 
                                alt="Avatar" 
                                referrerpolicy="no-referrer" 
                                loading="lazy"
                                style="width: 150px; height: 150px; border-radius: 50%; border: 3px solid #3b82f6; object-fit: cover;"
                                onerror="this.style.display='none'; document.getElementById('avatarError')?.style.display='block';"
                            >
                            <div id="avatarError" style="display: none; color: #ef4444; font-size: 0.85em; margin-top: 0.5em;">
                                ⚠️ Avatar failed to load
                            </div>
                        ` : `
                            <div style="width: 150px; height: 150px; border-radius: 50%; border: 3px solid #3b82f6; background: rgba(59, 130, 246, 0.2); display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 3em;">
                                👤
                            </div>
                            <p style="color: #9ca3af; font-size: 0.85em; margin-top: 0.5em;">No avatar</p>
                        `}
                    </div>
                    
                    <!-- User Info Column -->
                    <div style="padding: 0 1em;">
                        <h3 style="color: rgb(156 163 175); font-size: 0.9em; margin: 0 0 0.5em 0; text-transform: uppercase; letter-spacing: 0.05em;">Username</h3>
                        <p style="font-size: 2.2em; font-weight: bold; color: rgb(229 231 235); margin: 0 0 0.5em 0;">${userData.username}</p>
                        ${userData.email ? `<p style="color: rgb(156 163 175); font-size: 1em; margin: 0.3em 0;">📧 ${userData.email}</p>` : ''}
                        ${userData.firstName || userData.lastName ? `
                            <p style="color: rgb(156 163 175); font-size: 1.1em; margin: 0.3em 0;">
                                👤 ${userData.firstName || ''} ${userData.lastName || ''}
                            </p>
                        ` : ''}
                        <p style="color: rgb(156 163 175); font-size: 1em; margin: 0.3em 0;">
                            🔐 Two-Factor Auth: <span style="color: ${userData.twoFactorEnabled ? '#10b981' : '#ef4444'}; font-weight: 600;">${userData.twoFactorEnabled ? 'Enabled ✓' : 'Disabled ✗'}</span>
                        </p>
                    </div>
                    
                    <!-- Stats Column (Compact Grid) -->
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1em; min-width: 320px;">
                        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1em; text-align: center;">
                            <h3 style="color: rgb(156 163 175); font-size: 0.8em; margin: 0 0 0.5em 0; text-transform: uppercase;">Games Played</h3>
                            <p style="font-size: 2em; font-weight: bold; color: rgb(209 213 219); margin: 0;">${gamesPlayed}</p>
                        </div>
                        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 1em; text-align: center;">
                            <h3 style="color: rgb(156 163 175); font-size: 0.8em; margin: 0 0 0.5em 0; text-transform: uppercase;">Win Rate</h3>
                            <p style="font-size: 2em; font-weight: bold; color: rgb(209 213 219); margin: 0;">${winRate}%</p>
                        </div>
                        <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 8px; padding: 1em; text-align: center;">
                            <h3 style="color: rgb(156 163 175); font-size: 0.8em; margin: 0 0 0.5em 0; text-transform: uppercase;">Games Won</h3>
                            <p style="font-size: 2em; font-weight: bold; color: rgb(34 197 94); margin: 0;">${userData.gamesWon}</p>
                        </div>
                        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 1em; text-align: center;">
                            <h3 style="color: rgb(156 163 175); font-size: 0.8em; margin: 0 0 0.5em 0; text-transform: uppercase;">Games Lost</h3>
                            <p style="font-size: 2em; font-weight: bold; color: rgb(239 68 68); margin: 0;">${userData.gamesLost}</p>
                        </div>
                    </div>
                </div>
                
                <!-- Action Buttons -->
                <div style="display: flex; gap: 1.2em; justify-content: center; padding-top: 1.5em; border-top: 1px solid rgba(255,255,255,0.1);">
                    ${userData.firstName == "Guest" && userData.lastName== "User" ? "" :'<button id="editProfileBtn" class="btn-neon accent" style="font-size: 1.05em;"> Edit Profile </button>'}
                    <button id="friendListBtn" class="btn-neon accent" style="font-size: 1em; padding: 0.65em 1.8em; border-radius: 8px; font-weight: 500; transition: all 0.3s ease;">
                        👥 Friends
                    </button>
                    <button id="backToLandingBtn" class="btn btn-back" style="font-size: 1em; background: rgba(255, 255, 255, 0.03); color: rgb(156 163 175); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; padding: 0.65em 1.8em; cursor: pointer; font-weight: 500; transition: all 0.3s ease;">
                        ← Home
                    </button>
                </div>
            </div>
        </div>
    `;
  
    const backBtn = document.getElementById('backToLandingBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            history.pushState({ page: 'landing' }, '', '/');
            setCurrentPage('landing');
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

    // Attach user nav dropdown listeners
    attachUserNavListeners();
}