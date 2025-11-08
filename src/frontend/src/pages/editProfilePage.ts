// src/frontend/src/pages/editProfilePage.ts
import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { updateUserProfile, deleteUserAccount } from '../_api/user';

interface UserProfile {
    id: number;
    username: string;
    email?: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    gamesWon: number;
    gamesLost: number;
}

export async function renderEditProfilePage(): Promise<void> {
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
        <div class="neon-grid">
            <div class="grid-anim"></div>
            <div class="glass-card" style="text-align: center; max-width: 400px;">
                <div style="width: 40px; height: 40px; border: 4px solid rgba(255, 255, 255, 0.3); border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1em;"></div>
                <p style="color: #9ca3af;">Loading profile...</p>
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
            <div class="neon-grid">
                <div class="grid-anim"></div>
                <div class="glass-card" style="text-align: center; max-width: 400px;">
                    <h2 style="color: #ef4444; margin-bottom: 1em;">Error Loading Profile</h2>
                    <p style="color: #9ca3af; margin-bottom: 2em;">Failed to load user profile</p>
                    <button id="backToProfileBtn" class="btn btn-neon accent">Back to Profile</button>
                </div>
            </div>
        `;
        
        const backBtn = document.getElementById('backToProfileBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                history.pushState({ page: 'profile' }, '', '/profile');
                setCurrentPage('profile');
                renderApp();
            });
        }
        return;
    }

    const userData: UserProfile = {
        id: typeof user.id === 'string' ? parseInt(user.id) : user.id,
        username: user.username,
        email: user.email || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        avatar: user.avatar || '',
        gamesWon: user.gamesWon || 0,
        gamesLost: user.gamesLost || 0
    };

    root.innerHTML = `
        <div class="neon-grid">
            <div class="grid-anim"></div>
            <div class="glass-card" style="max-width: 600px; width: 100%;">

                <div style="text-align: center; margin-bottom: 2em;">
                    <h2 class="title-neon" style="font-size: 2.5rem; margin-bottom: 0.5rem;">Edit Profile</h2>
                    <p style="color: #9ca3af; font-size: 1rem;">Update your account information and personal details</p>
                </div>

                <!-- Account Information Section -->
                <div class="glass-card" style="margin-bottom: 2em; padding: 1.5em;">
                    <h3 style="color: white; margin-bottom: 1.5em; text-align: center; font-size: 1.3rem; font-weight: 600;">Account Information</h3>

                    <div style="display: flex; flex-direction: column; gap: 1.5em;">
                        <div style="display: flex; align-items: center; gap: 1em; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 250px;">
                                <label style="display: block; margin-bottom: 0.5em; font-weight: 600; color: #9ca3af; font-size: 0.9rem;">Username</label>
                                <div style="padding: 0.75em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.05); color: rgb(229 231 235); font-weight: 500;">
                                    ${userData.username}
                                </div>
                            </div>
                            <div style="display: flex; align-items: flex-end;">
                                <button type="button" id="changeUsernameBtn" class="btn btn-neon primary" style="padding: 0.75em 1.2em;">
                                    Change Username
                                </button>
                            </div>
                        </div>

                        <div style="display: flex; align-items: center; gap: 1em; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 250px;">
                                <label style="display: block; margin-bottom: 0.5em; font-weight: 600; color: #9ca3af; font-size: 0.9rem;">Email</label>
                                <div style="padding: 0.75em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.05); color: rgb(229 231 235); font-weight: 500;">
                                    ${userData.email || 'Not set'}
                                </div>
                            </div>
                            <div style="display: flex; align-items: flex-end;">
                                <button type="button" id="changeEmailBtn" class="btn btn-neon primary" style="padding: 0.75em 1.2em;">
                                    Change Email
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Personal Information Section -->
                <div class="glass-card" style="margin-bottom: 2em; padding: 1.5em;">
                    <h3 style="color: white; margin-bottom: 1.5em; text-align: center; font-size: 1.3rem; font-weight: 600;">Personal Information</h3>
                
                    <form id="editProfileForm" style="display: flex; flex-direction: column; gap: 1.5em;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5em;">
                            <div class="form-group">
                                <label for="firstName" style="display: block; margin-bottom: 0.5em; font-weight: 600; color: #9ca3af; font-size: 0.9rem;">First Name</label>
                                <input
                                    type="text"
                                    id="firstName"
                                    name="firstName"
                                    value="${userData.firstName || ''}"
                                    required
                                    style="width: 100%; padding: 0.75em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 1em; transition: border-color 0.2s;"
                                    onfocus="this.style.borderColor='rgba(0, 255, 255, 0.5)'; this.style.boxShadow='0 0 10px rgba(0, 255, 255, 0.1)';"
                                    onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='none';"
                                >
                            </div>

                            <div class="form-group">
                                <label for="lastName" style="display: block; margin-bottom: 0.5em; font-weight: 600; color: #9ca3af; font-size: 0.9rem;">Last Name</label>
                                <input
                                    type="text"
                                    id="lastName"
                                    name="lastName"
                                    value="${userData.lastName || ''}"
                                    required
                                    style="width: 100%; padding: 0.75em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 1em; transition: border-color 0.2s;"
                                    onfocus="this.style.borderColor='rgba(0, 255, 255, 0.5)'; this.style.boxShadow='0 0 10px rgba(0, 255, 255, 0.1)';"
                                    onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='none';"
                                >
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="avatar" style="display: block; margin-bottom: 0.5em; font-weight: 600; color: #9ca3af; font-size: 0.9rem;">Avatar URL (optional)</label>
                            <input
                                type="url"
                                id="avatar"
                                name="avatar"
                                value="${userData.avatar || ''}"
                                placeholder="https://example.com/avatar.jpg"
                                style="width: 100%; padding: 0.75em; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 1em; transition: border-color 0.2s;"
                                onfocus="this.style.borderColor='rgba(0, 255, 255, 0.5)'; this.style.boxShadow='0 0 10px rgba(0, 255, 255, 0.1)';"
                                onblur="this.style.borderColor='rgba(255, 255, 255, 0.2)'; this.style.boxShadow='none';"
                            >
                        </div>

                        <div id="errorMessage" style="color: #ef4444; font-size: 0.9em; text-align: center; display: none; padding: 0.5em; background: rgba(239, 68, 68, 0.1); border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2);"></div>
                        <div id="successMessage" style="color: #10b981; font-size: 0.9em; text-align: center; display: none; padding: 0.5em; background: rgba(16, 185, 129, 0.1); border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2);"></div>

                        <div style="display: flex; gap: 1em; margin-top: 1em;">
                            <button type="submit" id="saveProfileBtn" class="btn btn-neon primary" style="flex: 1;">
                                Save Changes
                            </button>
                            <button type="button" id="cancelBtn" class="btn btn-neon accent" style="flex: 1;">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
                
                <!-- Danger Zone Section -->
                <div class="glass-card" style="margin-top: 2em; padding: 1.5em; border: 1px solid rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.05);">
                    <h3 style="color: #ef4444; margin-bottom: 1em; text-align: center; font-size: 1.3rem; font-weight: 600;">⚠️ Danger Zone</h3>
                    <p style="color: rgb(156 163 175); font-size: 0.9em; text-align: center; margin-bottom: 1.5em; line-height: 1.5;">
                        Deleting your account is permanent and cannot be undone. All your data, including game statistics and friendships, will be lost forever.
                    </p>
                    <button id="deleteAccountBtn" class="btn btn-neon danger" style="width: 100%; font-weight: 600;">
                        🗑️ Delete Account Permanently
                    </button>
                </div>
            </div>
        </div>
    `;

    // Form submission handler
    const form = document.getElementById('editProfileForm') as HTMLFormElement;
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const saveBtn = document.getElementById('saveProfileBtn') as HTMLButtonElement;
            const errorDiv = document.getElementById('errorMessage') as HTMLElement;
            const successDiv = document.getElementById('successMessage') as HTMLElement;
            
            // Clear previous messages
            errorDiv.style.display = 'none';
            successDiv.style.display = 'none';
            
            // Disable button and show loading
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            
            try {
                const formData = new FormData(form);
                const updateData = {
                    firstName: formData.get('firstName') as string,
                    lastName: formData.get('lastName') as string,
                    email: formData.get('email') as string || undefined,
                    avatar: formData.get('avatar') as string || undefined
                };
                
                const result = await updateUserProfile(updateData);
                
                if (result.success) {
                    successDiv.textContent = 'Profile updated successfully!';
                    successDiv.style.display = 'block';
                    
                    // Redirect to profile page after 2 seconds
                    setTimeout(() => {
                        history.pushState({ page: 'profile' }, '', '/profile');
                        setCurrentPage('profile');
                        renderApp();
                    }, 2000);
                } else {
                    errorDiv.textContent = result.error || 'Failed to update profile';
                    errorDiv.style.display = 'block';
                }
            } catch (error: any) {
                errorDiv.textContent = error.message || 'An error occurred while updating your profile';
                errorDiv.style.display = 'block';
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Changes';
            }
        });
    }

    // Cancel button handler
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            history.pushState({ page: 'profile' }, '', '/profile');
            setCurrentPage('profile');
            renderApp();
        });
    }

    // Change username button handler
    const changeUsernameBtn = document.getElementById('changeUsernameBtn');
    if (changeUsernameBtn) {
        changeUsernameBtn.addEventListener('click', () => {
            history.pushState({ page: 'changeUsername' }, '', '/change-username');
            setCurrentPage('changeUsername');
            renderApp();
        });
    }

    // Change email button handler
    const changeEmailBtn = document.getElementById('changeEmailBtn');
    if (changeEmailBtn) {
        changeEmailBtn.addEventListener('click', () => {
            history.pushState({ page: 'changeEmail' }, '', '/change-email');
            setCurrentPage('changeEmail');
            renderApp();
        });
    }

    // Delete account button handler
    const deleteBtn = document.getElementById('deleteAccountBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
                if (confirm('This will permanently delete your account and all associated data. Type "DELETE" to confirm.')) {
                    const confirmation = prompt('Type "DELETE" to confirm account deletion:');
                    if (confirmation === 'DELETE') {
                        handleAccountDeletion();
                    }
                }
            }
        });
    }
}

async function handleAccountDeletion(): Promise<void> {
    const deleteBtn = document.getElementById('deleteAccountBtn') as HTMLButtonElement;
    const errorDiv = document.getElementById('errorMessage') as HTMLElement;
    
    if (!deleteBtn || !errorDiv) return;
    
    // Disable button and show loading
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Deleting Account...';
    
    try {
        const result = await deleteUserAccount();
        
        if (result.success) {
            // Logout and redirect to landing page
            await authService.logout();
            history.pushState({ page: 'landing' }, '', '/');
            setCurrentPage('landing');
            renderApp();
        } else {
            errorDiv.textContent = result.error || 'Failed to delete account';
            errorDiv.style.display = 'block';
        }
    } catch (error: any) {
        errorDiv.textContent = error.message || 'An error occurred while deleting your account';
        errorDiv.style.display = 'block';
    } finally {
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete Account';
    }
}
