// src/frontend/src/pages/editProfilePage.ts
import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { updateUserProfile, deleteUserAccount } from '../_api/user';
import { CoreUser } from '../../../shared/gameTypes';

interface UserProfile extends CoreUser {
    email?: string;
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
                <button id="backToProfileBtn" class="btn btn-back">Back to Profile</button>
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
        <div class="profile-container">
            <div class="profile-card" style="max-width: 600px; margin: 0 auto;">
                <h2 style="text-align: center; margin-bottom: 2em;">Edit Profile</h2>
                
                <div style="margin-bottom: 2em;">
                    <h3 style="color: rgb(229 231 235); margin-bottom: 1em; border-bottom: 1px solid rgb(55 65 81); padding-bottom: 0.5em;">Account Information</h3>
                    
                    <div class="form-group" style="margin-bottom: 1.5em;">
                        <label style="display: block; margin-bottom: 0.5em; font-weight: 600; color: rgb(209 213 219);">Username</label>
                        <div style="display: flex; align-items: center; gap: 1em;">
                            <div style="flex: 1; padding: 0.75em; border: 2px solid rgb(55 65 81); border-radius: 8px; background: rgb(31 41 55); color: rgb(229 231 235);">
                                ${userData.username}
                            </div>
                            <button type="button" id="changeUsernameBtn" class="btn" style="background: #3b82f6; color: #fff; border: none; border-radius: 8px; padding: 0.75em 1.5em; cursor: pointer;">
                                Change Username
                            </button>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: block; margin-bottom: 0.5em; font-weight: 600; color: rgb(209 213 219);">Email</label>
                        <div style="display: flex; align-items: center; gap: 1em;">
                            <div style="flex: 1; padding: 0.75em; border: 2px solid rgb(55 65 81); border-radius: 8px; background: rgb(31 41 55); color: rgb(229 231 235);">
                                ${userData.email || 'Not set'}
                            </div>
                            <button type="button" id="changeEmailBtn" class="btn" style="background: #3b82f6; color: #fff; border: none; border-radius: 8px; padding: 0.75em 1.5em; cursor: pointer;">
                                Change Email
                            </button>
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom: 2em;">
                    <h3 style="color: rgb(229 231 235); margin-bottom: 1em; border-bottom: 1px solid rgb(55 65 81); padding-bottom: 0.5em;">Personal Information</h3>
                </div>
                
                <form id="editProfileForm" style="display: flex; flex-direction: column; gap: 1.5em;">
                    <div class="form-group">
                        <label for="firstName" style="display: block; margin-bottom: 0.5em; font-weight: 600; color: rgb(209 213 219);">First Name</label>
                        <input 
                            type="text" 
                            id="firstName" 
                            name="firstName" 
                            value="${userData.firstName || ''}" 
                            required
                            style="width: 100%; padding: 0.75em; border: 2px solid rgb(55 65 81); border-radius: 8px; background: rgb(31 41 55); color: rgb(229 231 235); font-size: 1em;"
                        >
                    </div>
                    
                    <div class="form-group">
                        <label for="lastName" style="display: block; margin-bottom: 0.5em; font-weight: 600; color: rgb(209 213 219);">Last Name</label>
                        <input 
                            type="text" 
                            id="lastName" 
                            name="lastName" 
                            value="${userData.lastName || ''}" 
                            required
                            style="width: 100%; padding: 0.75em; border: 2px solid rgb(55 65 81); border-radius: 8px; background: rgb(31 41 55); color: rgb(229 231 235); font-size: 1em;"
                        >
                    </div>
                    
                    <div class="form-group">
                        <label for="avatar" style="display: block; margin-bottom: 0.5em; font-weight: 600; color: rgb(209 213 219);">Avatar URL</label>
                        <input 
                            type="url" 
                            id="avatar" 
                            name="avatar" 
                            value="${userData.avatar || ''}"
                            style="width: 100%; padding: 0.75em; border: 2px solid rgb(55 65 81); border-radius: 8px; background: rgb(31 41 55); color: rgb(229 231 235); font-size: 1em;"
                        >
                    </div>
                    
                    <div id="errorMessage" style="color: #ef4444; font-size: 0.9em; text-align: center; display: none;"></div>
                    <div id="successMessage" style="color: #10b981; font-size: 0.9em; text-align: center; display: none;"></div>
                    
                    <div style="display: flex; gap: 1em; margin-top: 1em;">
                        <button type="submit" id="saveProfileBtn" class="btn" style="flex: 1; background: #10b981; color: #fff; border: none; border-radius: 8px; padding: 0.75em; font-size: 1em; cursor: pointer;">
                            Save Changes
                        </button>
                        <button type="button" id="cancelBtn" class="btn btn-back" style="flex: 1; background: #6b7280; color: #fff; border: none; border-radius: 8px; padding: 0.75em; font-size: 1em; cursor: pointer;">
                            Cancel
                        </button>
                    </div>
                </form>
                
                <div style="margin-top: 3em; padding-top: 2em; border-top: 1px solid rgb(55 65 81);">
                    <h3 style="color: #ef4444; margin-bottom: 1em; text-align: center;">Danger Zone</h3>
                    <p style="color: rgb(156 163 175); font-size: 0.9em; text-align: center; margin-bottom: 1.5em;">
                        Once you delete your account, there is no going back. Please be certain.
                    </p>
                    <button id="deleteAccountBtn" class="btn" style="width: 100%; background: #dc2626; color: #fff; border: none; border-radius: 8px; padding: 0.75em; font-size: 1em; cursor: pointer;">
                        Delete Account
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
            authService.logout();
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
