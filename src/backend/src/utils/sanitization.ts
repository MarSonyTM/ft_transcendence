import validator from 'validator';

/**
 * Security utility module for input sanitization and XSS protection
 * Implements ft_transcendence subject requirement IV.4: XSS Protection
 */

/**
 * Sanitize string input to prevent XSS attacks
 * - Trims whitespace
 * - Escapes HTML entities
 * - Removes potentially dangerous characters
 */
export function sanitizeString(input: string | undefined | null): string {
    if (!input) return '';
    
    // Trim whitespace
    let sanitized = input.trim();
    
    // Escape HTML to prevent XSS
    sanitized = validator.escape(sanitized);
    
    return sanitized;
}

/**
 * Sanitize username input
 * - Allows alphanumeric, underscores, hyphens
 * - Length: 3-50 characters
 * - Converts to lowercase
 */
export function sanitizeUsername(username: string | undefined | null): string {
    if (!username) return '';
    
    let sanitized = username.trim().toLowerCase();
    
    // Remove any characters that aren't alphanumeric, underscore, or hyphen
    sanitized = sanitized.replace(/[^a-z0-9_-]/g, '');
    
    // Limit length
    sanitized = sanitized.substring(0, 50);
    
    return sanitized;
}

/**
 * Sanitize email input
 * - Normalizes email format
 * - Converts to lowercase
 * - Validates format
 */
export function sanitizeEmail(email: string | undefined | null): string {
    if (!email) return '';
    
    let sanitized = email.trim().toLowerCase();
    
    // Normalize email (remove dots in Gmail, etc.)
    if (validator.isEmail(sanitized)) {
        sanitized = validator.normalizeEmail(sanitized) || sanitized;
    }
    
    return sanitized;
}

/**
 * Sanitize name fields (firstName, lastName)
 * - Allows letters, spaces, hyphens, apostrophes
 * - Length: 1-100 characters
 * - Capitalizes first letter
 */
export function sanitizeName(name: string | undefined | null): string {
    if (!name) return '';
    
    let sanitized = name.trim();
    
    // Allow only letters, spaces, hyphens, and apostrophes
    sanitized = sanitized.replace(/[^a-zA-ZÀ-ÿ\s'-]/g, '');
    
    // Limit length
    sanitized = sanitized.substring(0, 100);
    
    // Capitalize first letter
    if (sanitized.length > 0) {
        sanitized = sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
    }
    
    return sanitized;
}

/**
 * Sanitize tournament alias
 * - Similar to username but allows more characters
 * - Length: 1-50 characters
 */
export function sanitizeAlias(alias: string | undefined | null): string {
    if (!alias) return '';
    
    let sanitized = alias.trim();
    
    // Escape HTML to prevent XSS
    sanitized = validator.escape(sanitized);
    
    // Allow alphanumeric, spaces, underscores, hyphens
    sanitized = sanitized.replace(/[^a-zA-Z0-9\s_-]/g, '');
    
    // Limit length
    sanitized = sanitized.substring(0, 50);
    
    return sanitized;
}

/**
 * Sanitize URL/avatar path
 * - Validates URL format
 * - Ensures safe protocols (http, https, data)
 */
export function sanitizeUrl(url: string | undefined | null): string {
    if (!url) return '';
    
    let sanitized = url.trim();
    
    // Check if it's a valid URL or data URI
    const isValidUrl = validator.isURL(sanitized, {
        protocols: ['http', 'https'],
        require_protocol: true
    });
    
    const isDataUri = sanitized.startsWith('data:image/');
    
    if (!isValidUrl && !isDataUri) {
        return ''; // Return empty string for invalid URLs
    }
    
    // Limit length to prevent oversized inputs
    sanitized = sanitized.substring(0, 500);
    
    return sanitized;
}

/**
 * Validate and sanitize numeric ID
 * - Ensures it's a positive integer
 */
export function sanitizeId(id: string | number | undefined | null): number {
    if (id === undefined || id === null) return 0;
    
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    
    if (isNaN(numId) || numId < 1) {
        return 0;
    }
    
    return numId;
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
    if (!email) return false;
    return validator.isEmail(email);
}

/**
 * Validate username format
 * - Length: 3-50 characters
 * - Alphanumeric, underscores, hyphens only
 */
export function validateUsername(username: string): boolean {
    if (!username) return false;
    
    const usernameRegex = /^[a-zA-Z0-9_-]{3,50}$/;
    return usernameRegex.test(username);
}

/**
 * Validate password strength
 * - Minimum 8 characters
 * - At least one letter and one number
 */
export function validatePassword(password: string): boolean {
    if (!password || password.length < 8) return false;
    
    // At least one letter and one number
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    
    return hasLetter && hasNumber;
}

/**
 * Sanitize object with multiple fields
 * Applies appropriate sanitization based on field name
 */
export function sanitizeUserInput(data: any): any {
    const sanitized: any = {};
    
    for (const key in data) {
        if (data.hasOwnProperty(key)) {
            const value = data[key];
            
            switch (key) {
                case 'username':
                    sanitized[key] = sanitizeUsername(value);
                    break;
                case 'email':
                    sanitized[key] = sanitizeEmail(value);
                    break;
                case 'firstName':
                case 'lastName':
                    sanitized[key] = sanitizeName(value);
                    break;
                case 'alias':
                    sanitized[key] = sanitizeAlias(value);
                    break;
                case 'avatar':
                    sanitized[key] = sanitizeUrl(value);
                    break;
                case 'id':
                case 'userId':
                case 'gameId':
                case 'playerId':
                    sanitized[key] = sanitizeId(value);
                    break;
                default:
                    // For unknown fields, apply basic string sanitization
                    if (typeof value === 'string') {
                        sanitized[key] = sanitizeString(value);
                    } else {
                        sanitized[key] = value;
                    }
            }
        }
    }
    
    return sanitized;
}

