import { API_BASE } from '../config';
import { authService } from '../utils/auth';
import { presenceService } from '../utils/presenceService';

interface RegisterResult {
	success: boolean;
	username?: string;
	emailVerified?: boolean;
	token?: string;
	error?: string;
}
export async function loginUser(username: string, password: string): Promise<{ success: boolean; username?: string; token?: string; emailVerified?: boolean; requires2FA?: boolean; userId?: number; error?: string }> {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || 'http://localhost:3000';
    
    const res = await fetch(`${apiEndpoint}/api/auth/login`, {
		credentials: 'include',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    
    if (res.ok) {
        const data = await res.json().catch(() => ({}));
		
		// Check if 2FA is required
		if (data.requires2FA) {
			return {
				success: false,
				requires2FA: true,
				userId: data.data?.userId,
				username: data.data?.username,
				emailVerified: data.data?.emailVerified,
				error: data.message
			};
		}
		
		if (data?.data && !data.data.emailVerified) {
			authService.setPendingEmailVerification(data.data.email || '');
		}
        presenceService.startHeartbeat();
        return {
            success: data.success || false,
            username: data.data?.username,
			emailVerified: data.data?.emailVerified,
            token: data.token,
            error: data.message
        };
    }
    if (res.status === 404) {
        return { success: false, error: 'API not available (404)' };
    } else if ( res.status === 401 ) {
        return { success: false, error: 'Invalid username/email or password' };
    }
    return { success: false, error: `Server error (${res.status})` };
}


// Attempt a backend registration
export async function registerUser(
	username: string,
	password: string,
	firstName: string,
	lastName: string,
	email?: string,
	avatar?: string
): Promise<RegisterResult> {
	// Basic client-side validation
	if (!username || username.length < 3) {
		return { success: false, error: 'Username must be at least 3 characters' };
	}
	if (!password || password.length < 4) {
		return { success: false, error: 'Password must be at least 4 characters' };
	}
	if (!firstName?.trim()) {
		return { success: false, error: 'First name is required' };
	}
	if (!lastName?.trim()) {
		return { success: false, error: 'Last name is required' };
	}

	// Send to backend
	try {
		const resp = await fetch(`${API_BASE}/api/auth/create`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				username: username.trim(),
				password,
				firstName: firstName.trim(),
				lastName: lastName.trim(),
				email: email?.trim() || undefined,
				avatar: avatar?.trim() || undefined
			})
		});

		// Try to parse response body
		let data;
		try {
			data = await resp.json();
		} catch {
			data = {};
		}

		console.log('Register response data:', data);

		if (resp.ok) {
			// Explicitly check for success
			if (data.success === true || data.id || data.username) {
				return {
					success: true,
					username: data.username || username,
					...data
				};
			}
			return {
				success: false,
				error: data.error || data.message || 'Registration failed'
			};
		}

		// Handle specific error status codes
		if (resp.status === 404) {
			return { success: false, error: 'API endpoint not found (404)' };
		} else if (resp.status === 409) {
			return {
				success: false,
				error: data.error || data.message || 'Email or username already exists'
			};
		} else if (resp.status === 400) {
			return {
				success: false,
				error: data.error || data.message || 'Invalid email format'
			};
		}

		return {
			success: false,
			error: data.error || data.message || `Registration failed (${resp.status})`
		};
	} catch (error: any) {
		console.error('Registration error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Network error - please try again'
		};
	}
}

export async function createGuestUser(username?: string): Promise<{ 
    success: boolean; 
    username?: string; 
    token?: string; 
    isGuest?: boolean;
    emailVerified?: boolean;
    error?: string;
    }> {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || 'http://localhost:3000';
  
    try {
        const res = await fetch(`${apiEndpoint}/api/auth/guest`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username || undefined })
        });
    
        if (res.ok) {
            const data = await res.json();
            return {
                success: data.success || false,
                username: data.data?.username,
                token: data.token,
                isGuest: data.data?.isGuest || true,
		        emailVerified : true,
                error: data.message,
            };
        }
    
        if (res.status === 404) {
            return { success: false, error: 'API not available (404)' };
        }
    
        return { success: false, error: `Server error (${res.status})` };
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Network error' 
        };
    }
}

export async function verifyEmail(verificationCode: string, email: string): Promise<{ success: boolean; message?: string; error?: string }> {
	const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || 'http://localhost:3000';
	
	try {
		const res = await fetch(`${apiEndpoint}/api/auth/verify-email`, {
			method: 'POST',
			credentials: 'include',
			headers: { 
                'Content-Type': 'application/json',
			},
			body: JSON.stringify({ verificationCode, email })
		});
		
		const data = await res.json().catch(() => ({}));
		
		if (res.ok) {
			return {
				success: true,
				message: data.message || 'Email verified successfully'
			};
		}
		
		return {
			success: false,
			error: data.message || `Verification failed (${res.status})`
		};
	} catch (error) {
		return {
			success: false,
			error: 'Network error - please try again'
		};
	}
}

// Resend verification email
export async function resendVerificationEmail(email: string): Promise<{ success: boolean; message?: string; error?: string }> {
	const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || 'http://localhost:3000';
	
	try {
		const res = await fetch(`${apiEndpoint}/api/auth/resend-verification`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json',
			 },
			body: JSON.stringify({ email })
		});
		
		const data = await res.json().catch(() => ({}));
		
		if (res.ok) {
			return {
				success: true,
				message: data.message || 'Verification email sent successfully'
			};
		}
		
		return {
			success: false,
			error: data.message || `Failed to resend email (${res.status})`
		};
	} catch (error) {
		return {
			success: false,
			error: 'Network error - please try again'
		};
	}
}

// Verify 2FA code
export async function verify2FA(verificationCode: string, userId: number): Promise<{ success: boolean; token?: string; message?: string; error?: string }> {
	const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || 'http://localhost:3000';
	
	try {
		const res = await fetch(`${apiEndpoint}/api/auth/verify-2fa`, {
			method: 'POST',
			credentials: 'include',
			headers: { 
                'Content-Type': 'application/json',
			},
			body: JSON.stringify({ verificationCode, userId })
		});
		
		const data = await res.json().catch(() => ({}));
		
		if (res.ok) {
			presenceService.startHeartbeat();
			return {
				success: true,
				token: data.token,
				message: data.message || '2FA verification successful'
			};
		}
		
		return {
			success: false,
			error: data.message || `Verification failed (${res.status})`
		};
	} catch (error) {
		return {
			success: false,
			error: 'Network error - please try again'
		};
	}
}

// Resend 2FA code
export async function resend2FA(userId: number): Promise<{ success: boolean; message?: string; error?: string }> {
	const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || 'http://localhost:3000';
	
	try {
		const res = await fetch(`${apiEndpoint}/api/auth/resend-2fa`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId })
		});
		
		const data = await res.json().catch(() => ({}));
		
		if (res.ok) {
			return {
				success: true,
				message: data.message || '2FA code sent successfully'
			};
		}
		
		return {
			success: false,
			error: data.message || `Failed to resend 2FA code (${res.status})`
		};
	} catch (error) {
		return {
			success: false,
			error: 'Network error - please try again'
		};
	}
}

