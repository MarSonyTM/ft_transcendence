import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';
import { verifyEmail, resendVerificationEmail, verify2FA, resend2FA } from '../_api/auth';
import { authService } from '../utils/auth';

export async function renderTwoFactorAuthPage(): Promise<void> {
    const root = document.getElementById('app-root');
    if (!root) return;

    // Check if we're doing 2FA verification or email verification
    const pending2FA = authService.getPending2FAVerification();
    const is2FA = pending2FA !== null;
    
    const user = await authService.getCurrentUser();
    const email = user ? user.email : null;
    const displayText = is2FA ? 'Verify Two-Factor Authentication' : 'Verify Your Email';
    const codeExpiry = is2FA ? '10 minutes' : '15 minutes';

    root.innerHTML = `
        <div class="verify-email-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; padding: 2em;">
            <div class="verify-email-card" style="background: #1f2937; border-radius: 12px; padding: 2em; max-width: 500px; width: 100%; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);">
                <div style="text-align: center; margin-bottom: 2em;">
                    <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1em;">
                        <svg width="40" height="40" fill="white" viewBox="0 0 24 24">
                            ${is2FA ? `
                                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                            ` : `
                                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                            `}
                        </svg>
                    </div>
                    <h2 style="color: #f9fafb; font-size: 1.8em; margin-bottom: 0.5em; font-weight: 600;">${displayText}</h2>
                    <p style="color: #9ca3af; font-size: 1em; line-height: 1.5;">
                        We've sent a 6-digit authentication code to your email
                    </p>
                </div>

                <form id="verifyEmailForm" style="display: flex; flex-direction: column; gap: 1.5em;">
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <label for="verificationCode" style="display: block; color: #f9fafb; font-weight: 500; margin-bottom: 0.5em; width: 100%; text-align: center;">Verification Code</label>
                        <input 
                            id="verificationCode" 
                            type="text" 
                            placeholder="Enter 6-digit code" 
                            maxlength="6"
                            required 
                            style="width: 100%; max-width: 300px; padding: 0.8em; font-size: 1.2em; text-align: center; letter-spacing: 0.2em; background: #374151; border: 2px solid #4b5563; border-radius: 8px; color: #f9fafb; outline: none; transition: border-color 0.2s; margin: 0 auto;"
                        />
                    </div>
                    
                    <button 
                        type="submit" 
                        id="verifyBtn"
                        style="width: 100%; padding: 0.8em; font-size: 1.1em; font-weight: 600; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s;"
                    >
                        ${is2FA ? 'Verify & Login' : 'Verify Email'}
                    </button>
                    
                    <div id="verifyError" style="color: #ef4444; min-height: 1.2em; font-size: 0.9em; text-align: center;"></div>
                    <div id="verifySuccess" style="color: #10b981; min-height: 1.2em; font-size: 0.9em; text-align: center;"></div>
                </form>

                <div style="margin-top: 2em; padding-top: 1.5em; border-top: 1px solid #374151;">
                    <p style="color: #9ca3af; font-size: 0.9em; text-align: center; margin-bottom: 1em;">
                        Didn't receive the ${is2FA ? 'code' : 'email'}?
                    </p>
                    <button 
                        id="resendBtn" 
                        style="width: 100%; padding: 0.6em; font-size: 1em; background: #374151; color: #f9fafb; border: 1px solid #4b5563; border-radius: 6px; cursor: pointer; transition: all 0.2s;"
                    >
                        ${is2FA ? 'Resend Code' : 'Resend Verification Email'}
                    </button>
                    <div id="resendMessage" style="color: #9ca3af; min-height: 1.2em; font-size: 0.8em; text-align: center; margin-top: 0.5em;"></div>
                </div>

                <div style="margin-top: 2em; display: flex; gap: 1em; justify-content: center;">
                    <button id="backToLoginBtn" style="padding: 0.6em 1.2em; background: #374151; color: #f9fafb; border: 1px solid #4b5563; border-radius: 6px; cursor: pointer; font-size: 0.9em;">
                        Back to Login
                    </button>
                </div>
            </div>
        </div>

        <style>
            #verificationCode:focus {
                border-color: #3b82f6 !important;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
            
            #verifyBtn:hover {
                background: linear-gradient(135deg, #2563eb, #1e40af) !important;
                transform: translateY(-1px);
            }
            
            #resendBtn:hover {
                background: #4b5563 !important;
                border-color: #6b7280 !important;
            }
            
            #backToLoginBtn:hover, #backToLandingBtn:hover {
                transform: translateY(-1px);
            }
        </style>
    `;

    const form = document.getElementById('verifyEmailForm') as HTMLFormElement | null;
    const verificationCodeInput = document.getElementById('verificationCode') as HTMLInputElement | null;
    const verifyBtn = document.getElementById('verifyBtn') as HTMLButtonElement | null;
    const resendBtn = document.getElementById('resendBtn') as HTMLButtonElement | null;
    const errorEl = document.getElementById('verifyError');
    const successEl = document.getElementById('verifySuccess');
    const resendMessageEl = document.getElementById('resendMessage');

    // Auto-focus on verification code input
    if (verificationCodeInput) {
        verificationCodeInput.focus();
    }

    // Only allow numbers in verification code input
    if (verificationCodeInput) {
        verificationCodeInput.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            target.value = target.value.replace(/[^0-9]/g, '');
        });
    }

    function setError(msg: string) {
        if (errorEl) errorEl.textContent = msg;
        if (successEl) successEl.textContent = '';
    }

    function setSuccess(msg: string) {
        if (successEl) successEl.textContent = msg;
        if (errorEl) errorEl.textContent = '';
    }

    function setResendMessage(msg: string, isError = false) {
        if (resendMessageEl) {
            resendMessageEl.textContent = msg;
            resendMessageEl.style.color = isError ? '#ef4444' : '#10b981';
        }
    }

    // Handle form submission
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            setError('');
            setSuccess('');

            const verificationCode = verificationCodeInput?.value.trim() || '';

            if (!verificationCode || verificationCode.length !== 6) {
                setError('Please enter a valid 6-digit verification code');
                return;
            }

            if (verifyBtn) {
                verifyBtn.disabled = true;
                verifyBtn.textContent = 'Verifying...';
            }

            let result;

            if (is2FA) {
                // 2FA verification
                const pending2FAData = authService.getPending2FAVerification();
                if (!pending2FAData || !pending2FAData.userId) {
                    setError('Session expired. Please try logging in again.');
                    if (verifyBtn) {
                        verifyBtn.disabled = false;
                        verifyBtn.textContent = 'Verify & Login';
                    }
                    return;
                }

                result = await verify2FA(verificationCode, pending2FAData.userId);
            } else {
                // Email verification
                const email = authService.getPendingEmailVerification();
                if (!email || email.length === 0) {
                    setError('Email address not found. Please try logging in again.');
                    if (verifyBtn) {
                        verifyBtn.disabled = false;
                        verifyBtn.textContent = 'Verify Email';
                    }
                    return;
                }

                result = await verifyEmail(verificationCode, email);
            }

            if (verifyBtn) {
                verifyBtn.disabled = false;
                verifyBtn.textContent = is2FA ? 'Verify & Login' : 'Verify Email';
            }

            if (result.success) {
                setSuccess(is2FA ? 'Authentication successful! Redirecting...' : 'Email verified successfully! Redirecting...');
                
                // Clear pending verification
                if (is2FA) {
                    authService.setPending2FAVerification(null);
                } else {
                    authService.setPendingEmailVerification(null);
                    authService.setNeededEmailVerification(false);
                }

                await authService.fetchUserProfile();
                
                // Redirect to landing page after successful verification
                setTimeout(() => {
                    history.pushState({ page: 'landing' }, '', '/');
                    setCurrentPage('landing');
                    renderApp();
                }, 1500);
            } else {
                setError(result.error || 'Verification failed');
            }
        });
    }

    // Handle resend verification email/code
    if (resendBtn) {
        resendBtn.addEventListener('click', async () => {
            let result;

            resendBtn.disabled = true;
            resendBtn.textContent = 'Sending...';

            if (is2FA) {
                // Resend 2FA code
                const pending2FAData = authService.getPending2FAVerification();
                if (!pending2FAData || !pending2FAData.userId) {
                    setResendMessage('Session expired. Please try logging in again.', true);
                    resendBtn.disabled = false;
                    resendBtn.textContent = 'Resend Code';
                    return;
                }

                result = await resend2FA(pending2FAData.userId);
            } else {
                // Resend email verification
                if (!email) {
                    setResendMessage('Email address not found. Please try logging in again.', true);
                    resendBtn.disabled = false;
                    resendBtn.textContent = 'Resend Verification Email';
                    return;
                }

                result = await resendVerificationEmail(email);
            }

            resendBtn.disabled = false;
            resendBtn.textContent = is2FA ? 'Resend Code' : 'Resend Verification Email';

            if (result.success) {
                setResendMessage(is2FA ? 'Code sent successfully!' : 'Verification email sent successfully!');
            } else {
                setResendMessage(result.error || 'Failed to resend', true);
            }
        });
    }

    // Navigation buttons
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', () => {
            // Clear pending states
            authService.setPending2FAVerification(null);
            authService.setPendingEmailVerification(null);
            
            history.pushState({ page: 'login' }, '', '/login');
            setCurrentPage('login');
            renderApp();
        });
    }

    const backToLandingBtn = document.getElementById('backToLandingBtn');
    if (backToLandingBtn) {
        backToLandingBtn.addEventListener('click', () => {
            history.pushState({ page: 'landing' }, '', '/');
            setCurrentPage('landing');
            renderApp();
        });
    }
}
