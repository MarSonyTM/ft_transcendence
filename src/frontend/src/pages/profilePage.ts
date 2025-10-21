// src/frontend/src/pages/profilePage.ts
import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';

export async function renderProfilePage(): Promise<void> {
    const root = document.getElementById('app-root');
    if (!root) return;

    // Check if user is authenticated
    if (!authService.isAuthenticated()) {
        history.pushState({ page: 'login' }, '', '/login');
        setCurrentPage('login');
        renderApp();
        return;
    }

    // Show loading state
    root.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; height: 80vh;">
            <div style="text-align: center;">
                <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1em;"></div>
                <p style="color: #666;">Loading profile...</p>
            </div>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;

    // Fetch user profile
    const user = await authService.fetchUserProfile();
    const guestStr = localStorage.getItem('currentUser');
    let guest = null;

    // Try to parse guest user from localStorage
    if (guestStr) {
        try {
            guest = JSON.parse(guestStr);
        } catch (e) {
            console.error('Failed to parse guest user:', e);
            localStorage.removeItem('currentUser');
        }
    }

    if (!guest && !user) {
        root.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
            <h2 style="color: #f87171; margin-bottom: 1em;">Error Loading Profile</h2>
            <p style="color: #666; margin-bottom: 2em;">Failed to load user profile</p>
            <button id="backToLandingBtn" class="btn btn-back">Back to Home</button>
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

    const userData = guest ? {
        username: guest.username || 'Guest',
        email: guest.email || undefined,
        firstName: guest.firstName || 'Guest',
        lastName: guest.lastName || 'User',
        avatar: guest.avatar || undefined,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0
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
        <div class="profile-container">
            <div class="profile-card">
                <h2 style="text-align: center">Profile</h2>
                
                ${userData.avatar ? `
                    <div style="text-align: center; margin-bottom: 1.5em;">
                        <img src="${userData.avatar}" alt="Avatar" style="width: 100px; height: 100px; border-radius: 50%; border: 3px solid #3b82f6;">
                    </div>
                ` : ''}
                
                <div class="username-section">
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
                <button id="friendListBtn" class="btn btn-friends" style="font-size: 1.1em; background: #38bdf8; color: #fff; border: none; border-radius: 8px; padding: 0.7em 2em; cursor: pointer;">
                    Friend List
                </button>
                ${!localStorage.getItem('isGuest') ? '<button id="editProfileBtn" class="btn" style="font-size: 1.1em; background: #10b981; color: #fff; border: none; border-radius: 8px; padding: 0.7em 2em; cursor: pointer;"> Edit Profile </button>' : ''}
                <button id="logoutBtn" class="btn" style="font-size: 1.1em; background: #ef4444; color: #fff; border: none; border-radius: 8px; padding: 0.7em 2em; cursor: pointer;">
                    Logout
                </button>
            </div>
            
            <button id="backToLandingBtn" class="btn btn-back">Back to Home</button>
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

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            authService.logout();
            history.pushState({ page: 'landing' }, '', '/');
            setCurrentPage('landing');
            renderApp();
        });
    }
}