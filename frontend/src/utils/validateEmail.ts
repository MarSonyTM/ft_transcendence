export function validateEmail(email: string): boolean {
    if (!email) 
        return false;
    const validationEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return validationEmailRegex.test(email);
}
