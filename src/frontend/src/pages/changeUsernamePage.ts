// src/frontend/src/pages/changeUsernamePage.ts
import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { checkUsernameAvailability, changeUsername } from '../_api/user';

export async function renderChangeUsernamePage(): Promise<void> {
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
    
    if (!user) {
        root.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80vh;">
                <h2 style="color: #f87171; margin-bottom: 1em;">Error Loading Profile</h2>
                <p style="color: #666; margin-bottom: 2em;">Failed to load user profile</p>
                <button id="backToEditProfileBtn" class="btn btn-back">Back to Edit Profile</button>
            </div>
        `;
        
        const backBtn = document.getElementById('backToEditProfileBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                history.pushState({ page: 'editProfile' }, '', '/edit-profile');
                setCurrentPage('editProfile');
                renderApp();
            });
        }
        return;
    }

    root.innerHTML = `
        <div class="profile-container">
            <div class="profile-card" style="max-width: 500px; margin: 0 auto;">
                <h2 style="text-align: center; margin-bottom: 2em;">Change Username</h2>
                
                <div style="background: rgb(31 41 55); padding: 1.5em; border-radius: 8px; margin-bottom: 2em;">
                    <p style="color: rgb(209 213 219); margin-bottom: 1em;"><strong>Current Username:</strong></p>
                    <p style="color: rgb(229 231 235); font-size: 1.2em; font-weight: bold;">${user.username}</p>
                </div>
                
                <form id="changeUsernameForm" style="display: flex; flex-direction: column; gap: 1.5em;">
                    <div class="form-group">
                        <label for="newUsername" style="display: block; margin-bottom: 0.5em; font-weight: 600; color: rgb(209 213 219);">New Username</label>
                        <input 
                            type="text" 
                            id="newUsername" 
                            name="newUsername" 
                            required
                            minlength="3"
                            maxlength="20"
                            style="width: 100%; padding: 0.75em; border: 2px solid rgb(55 65 81); border-radius: 8px; background: rgb(31 41 55); color: rgb(229 231 235); font-size: 1em;"
                            placeholder="Enter new username"
                        >
                        <div id="usernameAvailability" style="margin-top: 0.5em; font-size: 0.9em;"></div>
                    </div>
                    
                    <div id="errorMessage" style="color: #ef4444; font-size: 0.9em; text-align: center; display: none;"></div>
                    <div id="successMessage" style="color: #10b981; font-size: 0.9em; text-align: center; display: none;"></div>
                    
                    <div style="display: flex; gap: 1em; margin-top: 1em;">
                        <button type="submit" id="changeUsernameBtn" class="btn" style="flex: 1; background: #10b981; color: #fff; border: none; border-radius: 8px; padding: 0.75em; font-size: 1em; cursor: pointer;">
                            Change Username
                        </button>
                        <button type="button" id="cancelBtn" class="btn btn-back" style="flex: 1; background: #6b7280; color: #fff; border: none; border-radius: 8px; padding: 0.75em; font-size: 1em; cursor: pointer;">
                            Cancel
                        </button>
                    </div>
                </form>
                
                <div style="margin-top: 2em; padding: 1em; background: rgb(55 65 81); border-radius: 8px; border-left: 4px solid #f59e0b;">
                    <h4 style="color: #f59e0b; margin-bottom: 0.5em;">⚠️ Important</h4>
                    <p style="color: rgb(209 213 219); font-size: 0.9em; margin: 0;">
                        Changing your username will update it across all your games and statistics. 
                        This action cannot be undone.
                    </p>
                </div>
            </div>
        </div>
    `;

    // Real-time username availability checking
    let availabilityCheckTimeout: NodeJS.Timeout;
    const usernameInput = document.getElementById('newUsername') as HTMLInputElement;
    const availabilityDiv = document.getElementById('usernameAvailability') as HTMLElement;

    if (usernameInput && availabilityDiv) {
        usernameInput.addEventListener('input', () => {
            const username = usernameInput.value.trim();
            
            // Clear previous timeout
            if (availabilityCheckTimeout) {
                clearTimeout(availabilityCheckTimeout);
            }
            
            // Clear availability message
            availabilityDiv.textContent = '';
            availabilityDiv.style.color = '';
            
            if (username.length < 3) {
                return;
            }
            
            // Debounce the API call
            availabilityCheckTimeout = setTimeout(async () => {
                if (username === user.username) {
                    availabilityDiv.textContent = 'This is your current username';
                    availabilityDiv.style.color = '#6b7280';
                    return;
                }
                
                availabilityDiv.textContent = 'Checking availability...';
                availabilityDiv.style.color = '#6b7280';
                
                const result = await checkUsernameAvailability(username);
                
                if (result.success && result.data) {
                    if (result.data.available) {
                        availabilityDiv.textContent = '✓ Username is available';
                        availabilityDiv.style.color = '#10b981';
                    } else {
                        availabilityDiv.textContent = '✗ Username is already taken';
                        availabilityDiv.style.color = '#ef4444';
                    }
                } else {
                    availabilityDiv.textContent = 'Error checking availability';
                    availabilityDiv.style.color = '#ef4444';
                }
            }, 500);
        });
    }

    // Form submission handler
    const form = document.getElementById('changeUsernameForm') as HTMLFormElement;
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const changeBtn = document.getElementById('changeUsernameBtn') as HTMLButtonElement;
            const errorDiv = document.getElementById('errorMessage') as HTMLElement;
            const successDiv = document.getElementById('successMessage') as HTMLElement;
            
            // Clear previous messages
            errorDiv.style.display = 'none';
            successDiv.style.display = 'none';
            
            const newUsername = usernameInput.value.trim();
            
            if (newUsername === user.username) {
                errorDiv.textContent = 'Please enter a different username';
                errorDiv.style.display = 'block';
                return;
            }
            
            // Disable button and show loading
            changeBtn.disabled = true;
            changeBtn.textContent = 'Changing...';
            
            try {
                const result = await changeUsername(newUsername);
                
                if (result.success) {
                    successDiv.textContent = 'Username changed successfully!';
                    successDiv.style.display = 'block';
                    
                    // Redirect to profile page after 2 seconds
                    setTimeout(() => {
                        history.pushState({ page: 'profile' }, '', '/profile');
                        setCurrentPage('profile');
                        renderApp();
                    }, 2000);
                } else {
                    errorDiv.textContent = result.error || 'Failed to change username';
                    errorDiv.style.display = 'block';
                }
            } catch (error: any) {
                errorDiv.textContent = error.message || 'An error occurred while changing your username';
                errorDiv.style.display = 'block';
            } finally {
                changeBtn.disabled = false;
                changeBtn.textContent = 'Change Username';
            }
        });
    }

    // Cancel button handler
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            history.pushState({ page: 'editProfile' }, '', '/edit-profile');
            setCurrentPage('editProfile');
            renderApp();
        });
    }
}
