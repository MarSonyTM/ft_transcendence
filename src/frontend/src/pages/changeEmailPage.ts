// src/frontend/src/pages/changeEmailPage.ts
import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { authService } from '../utils/auth';
import { requestEmailChange, verifyEmailChange } from '../_api/user';
import { createUserNav, attachUserNavListeners } from '../utils/navigation';

export async function renderChangeEmailPage(): Promise<void> {
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

    let verificationStep = 'email'; // 'email' or 'verification'
    let pendingEmail = '';

    const renderEmailStep = async () => {
        const userNavHTML = await createUserNav();
        root.innerHTML = `
            <div class="neon-grid profile-container" style="width:100%; max-width:1200px; margin: 0 auto;">
                ${userNavHTML}
                <div class="grid-anim"></div>
                <div class="glass-card" style="padding: 2em; width:100%;">
                    <h2 class="title-neon" style="text-align: center; margin-bottom: 1.5em;">Change Email Address</h2>
                    
                    <div style="max-width: 600px; margin: 0 auto;">
                        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); padding: 1.2em; border-radius: 8px; margin-bottom: 2em;">
                            <p style="color: rgb(156 163 175); margin-bottom: 0.5em; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em;">Current Email</p>
                            <p style="color: rgb(229 231 235); font-size: 1.2em; font-weight: bold; margin: 0; word-break: break-all;">${user.email || 'Not set'}</p>
                        </div>
                        
                        <form id="changeEmailForm" style="display: flex; flex-direction: column; gap: 1.2em;">
                            <div class="form-group">
                                <label for="newEmail" style="display: block; margin-bottom: 0.5em; font-weight: 500; color: #9ca3af; font-size: 0.85em;">New Email Address</label>
                                <input 
                                    type="email" 
                                    id="newEmail" 
                                    name="newEmail" 
                                    required
                                    style="width: 100%; padding: 0.7em; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 1em; transition: border-color 0.2s;"
                                    onfocus="this.style.borderColor='rgba(59, 130, 246, 0.5)'; this.style.boxShadow='0 0 10px rgba(59, 130, 246, 0.1)';"
                                    onblur="this.style.borderColor='rgba(255, 255, 255, 0.15)'; this.style.boxShadow='none';"
                                    placeholder="Enter new email address"
                                >
                            </div>
                            
                            <div id="errorMessage" style="color: #ef4444; font-size: 0.85em; text-align: center; display: none; padding: 0.5em; background: rgba(239, 68, 68, 0.1); border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2);"></div>
                            <div id="successMessage" style="color: #10b981; font-size: 0.85em; text-align: center; display: none; padding: 0.5em; background: rgba(16, 185, 129, 0.1); border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2);"></div>
                            
                            <div style="display: flex; gap: 1em; margin-top: 0.5em;">
                                <button type="submit" id="sendVerificationBtn" style="flex: 1; font-size: 0.85em; padding: 0.55em 1.2em; border-radius: 8px; font-weight: 500; background: rgba(59, 130, 246, 0.2); color: rgb(229 231 235); border: 1px solid rgba(59, 130, 246, 0.5); cursor: pointer;">
                                    ✉️ Send Verification Email
                                </button>
                                <button type="button" id="cancelBtn" style="flex: 1; font-size: 0.85em; padding: 0.55em 1.2em; border-radius: 8px; font-weight: 500; background: rgba(255, 255, 255, 0.03); color: rgb(156 163 175); border: 1px solid rgba(255, 255, 255, 0.15); cursor: pointer;">
                                    ✕ Cancel
                                </button>
                            </div>
                        </form>
                        
                        <div style="margin-top: 2em; padding: 1em; background: rgba(59, 130, 246, 0.1); border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.3);">
                            <h4 style="color: #3b82f6; margin-bottom: 0.5em; font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.05em;">ℹ️ How it works</h4>
                            <p style="color: rgb(156 163 175); font-size: 0.85em; margin: 0; line-height: 1.5;">
                                We'll send a verification code to your new email address. You'll need to enter this code to confirm the change.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Form submission handler for email step
        const form = document.getElementById('changeEmailForm') as HTMLFormElement;
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const sendBtn = document.getElementById('sendVerificationBtn') as HTMLButtonElement;
                const errorDiv = document.getElementById('errorMessage') as HTMLElement;
                const successDiv = document.getElementById('successMessage') as HTMLElement;
                const emailInput = document.getElementById('newEmail') as HTMLInputElement;
                
                // Clear previous messages
                errorDiv.style.display = 'none';
                successDiv.style.display = 'none';
                
                const newEmail = emailInput.value.trim();
                
                if (newEmail === user.email) {
                    errorDiv.textContent = 'Please enter a different email address';
                    errorDiv.style.display = 'block';
                    return;
                }
                
                // Disable button and show loading
                sendBtn.disabled = true;
                sendBtn.textContent = 'Sending...';
                
                try {
                    const result = await requestEmailChange(newEmail);
                    
                    if (result.success) {
                        pendingEmail = newEmail;
                        verificationStep = 'verification';
                        renderVerificationStep();
                    } else {
                        errorDiv.textContent = result.error || 'Failed to send verification email';
                        errorDiv.style.display = 'block';
                    }
                } catch (error: any) {
                    errorDiv.textContent = error.message || 'An error occurred while sending verification email';
                    errorDiv.style.display = 'block';
                } finally {
                    sendBtn.disabled = false;
                    sendBtn.textContent = 'Send Verification Email';
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

        // Attach user nav dropdown listeners
        attachUserNavListeners();
    };

    const renderVerificationStep = async () => {
        const userNavHTML = await createUserNav();
        root.innerHTML = `
            <div class="neon-grid profile-container" style="width:100%; max-width:1200px; margin: 0 auto;">
                ${userNavHTML}
                <div class="grid-anim"></div>
                <div class="glass-card" style="padding: 2em; width:100%;">
                    <h2 class="title-neon" style="text-align: center; margin-bottom: 1.5em;">Verify Email Address</h2>
                    
                    <div style="max-width: 600px; margin: 0 auto;">
                        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); padding: 1.2em; border-radius: 8px; margin-bottom: 2em; text-align: center;">
                            <p style="color: rgb(156 163 175); margin-bottom: 0.5em; font-size: 0.85em;">Verification email sent to:</p>
                            <p style="color: rgb(229 231 235); font-size: 1.2em; font-weight: bold; margin: 0; word-break: break-all;">${pendingEmail}</p>
                        </div>
                        
                        <form id="verificationForm" style="display: flex; flex-direction: column; gap: 1.2em;">
                            <div class="form-group">
                                <label for="verificationCode" style="display: block; margin-bottom: 0.5em; font-weight: 500; color: #9ca3af; font-size: 0.85em;">Verification Code</label>
                                <input 
                                    type="text" 
                                    id="verificationCode" 
                                    name="verificationCode" 
                                    required
                                    maxlength="6"
                                    style="width: 100%; padding: 0.7em; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); color: rgb(229 231 235); font-size: 1.2em; text-align: center; letter-spacing: 0.2em; transition: border-color 0.2s;"
                                    onfocus="this.style.borderColor='rgba(59, 130, 246, 0.5)'; this.style.boxShadow='0 0 10px rgba(59, 130, 246, 0.1)';"
                                    onblur="this.style.borderColor='rgba(255, 255, 255, 0.15)'; this.style.boxShadow='none';"
                                    placeholder="123456"
                                >
                                <p style="color: rgb(156 163 175); font-size: 0.8em; margin-top: 0.5em; text-align: center;">
                                    Enter the 6-digit code from your email
                                </p>
                            </div>
                            
                            <div id="errorMessage" style="color: #ef4444; font-size: 0.85em; text-align: center; display: none; padding: 0.5em; background: rgba(239, 68, 68, 0.1); border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2);"></div>
                            <div id="successMessage" style="color: #10b981; font-size: 0.85em; text-align: center; display: none; padding: 0.5em; background: rgba(16, 185, 129, 0.1); border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2);"></div>
                            
                            <div style="display: flex; gap: 1em; margin-top: 0.5em;">
                                <button type="submit" id="verifyEmailBtn" style="flex: 1; font-size: 0.85em; padding: 0.55em 1.2em; border-radius: 8px; font-weight: 500; background: rgba(59, 130, 246, 0.2); color: rgb(229 231 235); border: 1px solid rgba(59, 130, 246, 0.5); cursor: pointer;">
                                    ✓ Verify Email
                                </button>
                                <button type="button" id="backToEmailBtn" style="flex: 1; font-size: 0.85em; padding: 0.55em 1.2em; border-radius: 8px; font-weight: 500; background: rgba(255, 255, 255, 0.03); color: rgb(156 163 175); border: 1px solid rgba(255, 255, 255, 0.15); cursor: pointer;">
                                    ← Back
                                </button>
                            </div>
                        </form>
                        
                        <div style="margin-top: 2em; padding: 1em; background: rgba(245, 158, 11, 0.1); border-radius: 8px; border: 1px solid rgba(245, 158, 11, 0.3);">
                            <h4 style="color: #f59e0b; margin-bottom: 0.5em; font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.05em;">⏰ Time Limit</h4>
                            <p style="color: rgb(156 163 175); font-size: 0.85em; margin: 0; line-height: 1.5;">
                                The verification code will expire in 15 minutes. If you didn't receive the email, check your spam folder.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Form submission handler for verification step
        const form = document.getElementById('verificationForm') as HTMLFormElement;
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const verifyBtn = document.getElementById('verifyEmailBtn') as HTMLButtonElement;
                const errorDiv = document.getElementById('errorMessage') as HTMLElement;
                const successDiv = document.getElementById('successMessage') as HTMLElement;
                const codeInput = document.getElementById('verificationCode') as HTMLInputElement;
                
                // Clear previous messages
                errorDiv.style.display = 'none';
                successDiv.style.display = 'none';
                
                const verificationCode = codeInput.value.trim();
                
                if (verificationCode.length !== 6) {
                    errorDiv.textContent = 'Please enter the 6-digit verification code';
                    errorDiv.style.display = 'block';
                    return;
                }
                
                // Disable button and show loading
                verifyBtn.disabled = true;
                verifyBtn.textContent = 'Verifying...';
                
                try {
                    const result = await verifyEmailChange(verificationCode);
                    
                    if (result.success) {
                        successDiv.textContent = 'Email address updated successfully!';
                        successDiv.style.display = 'block';
                        authService.setCurrentUserProfile(null);
                        
                        // Redirect to profile page after 2 seconds
                        setTimeout(() => {
                            history.pushState({ page: 'profile' }, '', '/profile');
                            setCurrentPage('profile');
                            renderApp();
                        }, 2000);
                    } else {
                        errorDiv.textContent = result.error || 'Invalid or expired verification code';
                        errorDiv.style.display = 'block';
                    }
                } catch (error: any) {
                    errorDiv.textContent = error.message || 'An error occurred while verifying your email';
                    errorDiv.style.display = 'block';
                } finally {
                    verifyBtn.disabled = false;
                    verifyBtn.textContent = 'Verify Email';
                }
            });
        }

        // Back to email button handler
        const backBtn = document.getElementById('backToEmailBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                verificationStep = 'email';
                renderEmailStep();
            });
        }

        // Attach user nav dropdown listeners
        attachUserNavListeners();
    };

    // Initialize with email step
    renderEmailStep();
}
