import { setAccessToken, getAccessToken } from '../utils/api';
import { API_BASE } from '../config';

interface RegisterResult {
	success: boolean;
	username?: string;
	error?: string;
}

//export async function loginUser(username: string, password: string): Promise<{ success: boolean; username?: string; error?: string }> {
// 		const res = await fetch(`${API_BASE}/api/auth/login`, {
//		method: 'POST',
//		headers: { 'Content-Type': 'application/json' },
//		body: JSON.stringify({ username, password })
//	});
//	if (res.ok) {
//		const data = await res.json().catch(() => ({}));
//        if (data?.token) setAccessToken(data.token);
//		return data;
//	}
//    if (res.status === 404) {
//        return { success: false, error: 'API not available (404)' };
//    } else if ( res.status === 401 ) {
//        return { success: false, error: 'Invalid username/email or password' };
//    }
//	return { success: false, error: `Server error (${res.status})` };
//}

export async function loginUser(username: string, password: string): Promise<{ success: boolean; username?: string; token?: string; error?: string }> {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || 'http://localhost:3000';
    
    const res = await fetch(`${apiEndpoint}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    
    if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
            success: data.success || false,
            username: data.data?.username,
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
  error?: string;
}> {
  const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || 'http://localhost:3000';
  
  try {
    const res = await fetch(`${apiEndpoint}/api/auth/guest`, {
      method: 'POST',
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
        error: data.message
      };
    }
    
    if (res.status === 404) {
      return { success: false, error: 'API not available (404)' };
    }
    
    return { success: false, error: `Server error (${res.status})` };
  } catch (error) {
    console.error('Guest user creation error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Network error' 
    };
  }
}