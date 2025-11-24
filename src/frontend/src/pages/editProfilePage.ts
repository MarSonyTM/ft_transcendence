// src/frontend/src/pages/editProfilePage.ts
import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { updateUserProfile, deleteUserAccount } from '../_api/user';
import { createUserNav, attachUserNavListeners } from '../utils/navigation';

interface UserProfile {
    id: number;
    username: string;
    email?: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    twoFactorEnabled?: boolean;
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
        id: typeof user.id === 'string' ? parseInt(user.id) : (user.id || 0),
        username: user.username,
        email: user.email || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        avatar: user.avatar || '',
        twoFactorEnabled: user.twoFactorEnabled || false,
        gamesWon: user.gamesWon || 0,
        gamesLost: user.gamesLost || 0
    };

    const userNavHTML = await createUserNav();
    root.innerHTML = `
        <div class="neon-grid profile-container" style="width:100%; max-width:1200px; margin: 0 auto;">
            ${userNavHTML}
            <div class="grid-anim"></div>
            <div class="glass-card" style="padding: 2em; width:100%;">

                <h2 class="title-neon" style="text-align: center; margin-bottom: 1.2em;">Edit Profile</h2>

                <!-- Desktop Layout: Three Columns -->
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2em; align-items: start;">
                    
                    <!-- Left Column: Account Information + Avatar Preview -->
                    <div>
                        <h3 style="color: rgb(156 163 175); font-size: 0.9em; margin: 0 0 0.8em 0; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5em;">Account Information</h3>

                        <!-- Avatar Preview at Top -->
                        ${userData.avatar ? `
                            <div style="text-align: center; margin-bottom: 1.2em;">
                                <img 
                                    src="${userData.avatar.trim()}" 
                                    alt="Current Avatar" 
                                    referrerpolicy="no-referrer"
                                    style="width: 100px; height: 100px; border-radius: 50%; border: 3px solid rgba(59, 130, 246, 0.5); object-fit: cover;"
                                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                                >
                                <div style="width: 100px; height: 100px; border-radius: 50%; border: 3px solid rgba(59, 130, 246, 0.3); background: rgba(59, 130, 246, 0.1); display: none; align-items: center; justify-content: center; margin: 0 auto; color: #9ca3af; font-size: 2em;">
                                    👤
                                </div>
                            </div>
                        ` : `
                            <div style="text-align: center; margin-bottom: 1.2em;">
                                <div style="width: 100px; height: 100px; border-radius: 50%; border: 3px solid rgba(59, 130, 246, 0.3); background: rgba(59, 130, 246, 0.1); display: flex; align-items: center; justify-content: center; margin: 0 auto; color: #9ca3af; font-size: 2em;">
                                    👤
                                </div>
                            </div>
                        `}

                        <div style="display: flex; flex-direction: column; gap: 1em;">
                            <div>
                                <label style="display: block; margin-bottom: 0.5em; font-weight: 500; color: #9ca3af; font-size: 0.85em;">Username</label>
                                <div style="padding: 0.65em; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; background: rgba(255, 255, 255, 0.05); color: rgb(229 231 235); font-weight: 500; margin-bottom: 0.5em; font-size: 0.95em;">
                                    ${userData.username}
                                </div>
                                <button type="button" id="changeUsernameBtn" class="btn-neon accent" style="font-size: 0.85em; padding: 0.5em 1em; border-radius: 8px; font-weight: 500; width: 100%;">
                                    Change Username
                                </button>
                            </div>

                            <div>
                                <label style="display: block; margin-bottom: 0.5em; font-weight: 500; color: #9ca3af; font-size: 0.85em;">Email</label>
                                <div style="padding: 0.65em; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; background: rgba(255, 255, 255, 0.05); color: rgb(229 231 235); font-weight: 500; margin-bottom: 0.5em; font-size: 0.95em; word-break: break-all;">
                                    ${userData.email || 'Not set'}
                                </div>
                                <button type="button" id="changeEmailBtn" class="btn-neon accent" style="font-size: 0.85em; padding: 0.5em 1em; border-radius: 8px; font-weight: 500; width: 100%;">
                                    Change Email
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Middle Column: Personal Information Form -->
                    <div>
                        <h3 style="color: rgb(156 163 175); font-size: 0.9em; margin: 0 0 0.8em 0; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5em;">Personal Information</h3>
                    
                        <form id="editProfileForm" style="display: flex; flex-direction: column; gap: 1em;">
                            <div class="form-group">
                                <label for="firstName" style="display: block; margin-bottom: 0.5em; font-weight: 500; color: #9ca3af; font-size: 0.85em;">First Name</label>
                                <input
                                    type="text"
                                    id="firstName"
                                    name="firstName"
                                    value="${userData.firstName || ''}"
                                    required
                                    style="width: 100%; padding: 0.65em; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 0.95em; transition: border-color 0.2s;"
                                    onfocus="this.style.borderColor='rgba(59, 130, 246, 0.5)'; this.style.boxShadow='0 0 10px rgba(59, 130, 246, 0.1)';"
                                    onblur="this.style.borderColor='rgba(255, 255, 255, 0.15)'; this.style.boxShadow='none';"
                                >
                            </div>

                            <div class="form-group">
                                <label for="lastName" style="display: block; margin-bottom: 0.5em; font-weight: 500; color: #9ca3af; font-size: 0.85em;">Last Name</label>
                                <input
                                    type="text"
                                    id="lastName"
                                    name="lastName"
                                    value="${userData.lastName || ''}"
                                    required
                                    style="width: 100%; padding: 0.65em; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 0.95em; transition: border-color 0.2s;"
                                    onfocus="this.style.borderColor='rgba(59, 130, 246, 0.5)'; this.style.boxShadow='0 0 10px rgba(59, 130, 246, 0.1)';"
                                    onblur="this.style.borderColor='rgba(255, 255, 255, 0.15)'; this.style.boxShadow='none';"
                                >
                            </div>

                            <div class="form-group">
                                <label for="avatar" style="display: block; margin-bottom: 0.5em; font-weight: 500; color: #9ca3af; font-size: 0.85em;">Avatar URL</label>
                                <input
                                    type="text"
                                    id="avatar"
                                    name="avatar"
                                    value="${userData.avatar || ''}"
                                    placeholder="https://example.com/avatar.jpg"
                                    style="width: 100%; padding: 0.65em; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 0.95em; transition: border-color 0.2s;"
                                    onfocus="this.style.borderColor='rgba(59, 130, 246, 0.5)'; this.style.boxShadow='0 0 10px rgba(59, 130, 246, 0.1)';"
                                    onblur="this.style.borderColor='rgba(255, 255, 255, 0.15)'; this.style.boxShadow='none';"
                                >
                            </div>

                            <div class="form-group">
                                <label for="twoFactorEnabled" style="display: block; margin-bottom: 0.5em; font-weight: 500; color: #9ca3af; font-size: 0.85em;">Two-Factor Authentication</label>
                                <div style="padding: 0.65em; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px);">
                                    <label style="display: flex; align-items: center; gap: 0.8em; cursor: pointer;">
                                        <input 
                                            type="checkbox" 
                                            id="twoFactorEnabled" 
                                            name="twoFactorEnabled" 
                                            ${userData.twoFactorEnabled ? 'checked' : ''}
                                            style="width: 18px; height: 18px; cursor: pointer; accent-color: #3b82f6;"
                                        >
                                        <span style="color: rgb(229 231 235); font-weight: 500; font-size: 0.95em;">
                                            Enable Two-Factor Authentication
                                        </span>
                                    </label>
                                </div>
                                <p style="color: rgb(156 163 175); font-size: 0.75em; margin-top: 0.5em; line-height: 1.4;">
                                    Two-factor authentication adds an extra layer of security to your account.
                                </p>
                            </div>

                            <div id="errorMessage" style="color: #ef4444; font-size: 0.8em; text-align: center; display: none; padding: 0.5em; background: rgba(239, 68, 68, 0.1); border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2);"></div>
                            <div id="successMessage" style="color: #10b981; font-size: 0.8em; text-align: center; display: none; padding: 0.5em; background: rgba(16, 185, 129, 0.1); border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2);"></div>

                            <div style="display: flex; gap: 1em; margin-top: 0.5em;">
                                <button type="submit" id="saveProfileBtn" style="flex: 1; font-size: 0.85em; padding: 0.55em 1.2em; border-radius: 8px; font-weight: 500; background: rgba(59, 130, 246, 0.2); color: rgb(229 231 235); border: 1px solid rgba(59, 130, 246, 0.5); cursor: pointer;">
                                    ✓ Save Changes
                                </button>
                                <button type="button" id="cancelBtn" style="flex: 1; font-size: 0.85em; padding: 0.55em 1.2em; border-radius: 8px; font-weight: 500; background: rgba(255, 255, 255, 0.03); color: rgb(156 163 175); border: 1px solid rgba(255, 255, 255, 0.15); cursor: pointer;">
                                    ✕ Cancel
                                </button>
                            </div>
                        </form>
                    </div>

                    <!-- Right Column: Danger Zone -->
                    <div>
                        <h3 style="color: #ef4444; font-size: 0.9em; margin: 0 0 0.8em 0; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(239, 68, 68, 0.3); padding-bottom: 0.5em;">⚠️ Danger Zone</h3>
                        <p style="color: rgb(156 163 175); font-size: 0.85em; margin-bottom: 1em; line-height: 1.5;">
                            Deleting your account is permanent. All data will be lost forever.
                        </p>
                        <button id="deleteAccountBtn" class="btn-neon danger" style="width: 100%; font-size: 0.85em; padding: 0.55em 1.2em; border-radius: 8px; font-weight: 500;">
                            🗑️ Delete Account
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;    // Form submission handler
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
                const avatarValue = (formData.get('avatar') as string)?.trim();
                const twoFactorCheckbox = document.getElementById('twoFactorEnabled') as HTMLInputElement;
                const updateData = {
                    firstName: formData.get('firstName') as string,
                    lastName: formData.get('lastName') as string,
                    email: formData.get('email') as string || undefined,
                    // Only update avatar if a new value is provided, otherwise keep existing
                    avatar: avatarValue,
                    twoFactorEnabled: twoFactorCheckbox?.checked || false
                };
                
                const result = await updateUserProfile(updateData);
                
                if (result.success) {
                    // Refresh user profile in auth service to get updated avatar
                    await authService.fetchUserProfile();
                    
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

    // Avatar preview handler
    const avatarInput = document.getElementById('avatar') as HTMLInputElement;
    if (avatarInput) {
        const previewContainer = avatarInput.parentElement?.querySelector('.avatar-preview-container') as HTMLElement;
        const previewImg = previewContainer?.querySelector('img') as HTMLImageElement;
        const errorMsg = previewContainer?.querySelector('.avatar-error') as HTMLElement;
        
        avatarInput.addEventListener('input', () => {
            const url = avatarInput.value.trim();
            if (previewContainer && previewImg && errorMsg) {
                if (url.length > 0) {
                    previewContainer.style.display = 'block';
                    previewImg.src = url;
                    previewImg.style.display = 'block';
                    errorMsg.style.display = 'none';
                } else {
                    previewContainer.style.display = 'none';
                }
            }
        });
        
        // Handle image load/error
        if (previewImg) {
            previewImg.addEventListener('error', () => {
                if (previewImg && errorMsg) {
                    previewImg.style.display = 'none';
                    errorMsg.style.display = 'block';
                }
            });
            
            previewImg.addEventListener('load', () => {
                if (previewImg && errorMsg) {
                    previewImg.style.display = 'block';
                    errorMsg.style.display = 'none';
                }
            });
        }
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

    // Attach user nav dropdown listeners
    attachUserNavListeners();
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
