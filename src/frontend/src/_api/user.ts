import { authService } from '../utils/auth';
import { API_BASE } from '../config';

export interface UpdateUserProfileData {
    firstName?: string;
    lastName?: string;
    email?: string;
    avatar?: string;
    twoFactorEnabled?: boolean;
    gamesWon?: number;
    gamesLost?: number;
}

export interface UpdateUserProfileResult {
    success: boolean;
    data?: any;
    error?: string;
}

export interface DeleteAccountResult {
    success: boolean;
    error?: string;
}

export interface EmailChangeResult {
    success: boolean;
    data?: any;
    error?: string;
}

export interface UsernameChangeResult {
    success: boolean;
    data?: any;
    error?: string;
}

export interface UsernameAvailabilityResult {
    success: boolean;
    data?: {
        username: string;
        available: boolean;
    };
    error?: string;
}

// Update user profile
export async function updateUserProfile(updateData: UpdateUserProfileData): Promise<UpdateUserProfileResult> {
    try {
        const user = await authService.getCurrentUser();
        if (!user) {
            return {
                success: false,
                error: 'No authenticated user found'
            };
        }

        const response = await fetch(`${API_BASE}/api/users/me`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData)
        });

        const data = await response.json();

        if (response.ok) {
            return {
                success: true,
                data: data.data
            };
        } else {
            return {
                success: false,
                error: data.message || data.error || 'Failed to update profile'
            };
        }
    } catch (error: any) {
        console.error('Error updating user profile:', error);
        return {
            success: false,
            error: error.message || 'Network error occurred'
        };
    }
}

// Delete user account
export async function deleteUserAccount(): Promise<DeleteAccountResult> {
    try {
        const user = await authService.getCurrentUser();
        if (!user) {
            return {
                success: false,
                error: 'No authenticated user found'
            };
        }

        const response = await fetch(`${API_BASE}/api/users/me`, {
            method: 'DELETE',
            credentials: 'include',
        });

        const data = await response.json();

        if (response.ok) {
            return {
                success: true
            };
        } else {
            return {
                success: false,
                error: data.message || data.error || 'Failed to delete account'
            };
        }
    } catch (error: any) {
        console.error('Error deleting user account:', error);
        return {
            success: false,
            error: error.message || 'Network error occurred'
        };
    }
}

// Request email change
export async function requestEmailChange(email: string): Promise<EmailChangeResult> {
    try {
        const user = await authService.getCurrentUser();
        if (!user) {
            return {
                success: false,
                error: 'No authenticated user found'
            };
        }

        const response = await fetch(`${API_BASE}/api/users/request-email-change`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (response.ok) {
            return {
                success: true,
                data: data.data
            };
        } else {
            return {
                success: false,
                error: data.message || data.error || 'Failed to request email change'
            };
        }
    } catch (error: any) {
        console.error('Error requesting email change:', error);
        return {
            success: false,
            error: error.message || 'Network error occurred'
        };
    }
}

// Verify email change
export async function verifyEmailChange(verificationCode: string): Promise<EmailChangeResult> {
    try {
        const user = await authService.getCurrentUser();
        if (!user) {
            return {
                success: false,
                error: 'No authenticated user found'
            };
        }

        const response = await fetch(`${API_BASE}/api/users/verify-email-change`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ verificationCode })
        });

        const data = await response.json();

        if (response.ok) {
            return {
                success: true,
                data: data.data
            };
        } else {
            return {
                success: false,
                error: data.message || data.error || 'Failed to verify email change'
            };
        }
    } catch (error: any) {
        console.error('Error verifying email change:', error);
        return {
            success: false,
            error: error.message || 'Network error occurred'
        };
    }
}

// Check username availability
export async function checkUsernameAvailability(username: string): Promise<UsernameAvailabilityResult> {
    try {
		const user = await authService.getCurrentUser();
		if (!user) {
			return {
				success: false,
				error: 'No authenticated user found'
			};
		}
        const response = await fetch(`${API_BASE}/api/users/check-username/${encodeURIComponent(username)}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok) {
            return {
                success: true,
                data: data.data
            };
        } else {
            return {
                success: false,
                error: data.message || data.error || 'Failed to check username availability'
            };
        }
    } catch (error: any) {
        console.error('Error checking username availability:', error);
        return {
            success: false,
            error: error.message || 'Network error occurred'
        };
    }
}

// Change username
export async function changeUsername(newUsername: string): Promise<UsernameChangeResult> {
    try {
        const user = await authService.getCurrentUser();
        if (!user) {
            return {
                success: false,
                error: 'No authenticated user found'
            };
        }

        const response = await fetch(`${API_BASE}/api/users/change-username`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ newUsername })
        });

        const data = await response.json();

        if (response.ok) {
            return {
                success: true,
                data: data.data
            };
        } else {
            return {
                success: false,
                error: data.message || data.error || 'Failed to change username'
            };
        }
    } catch (error: any) {
        console.error('Error changing username:', error);
        return {
            success: false,
            error: error.message || 'Network error occurred'
        };
    }
}
