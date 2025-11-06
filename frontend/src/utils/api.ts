// check later 

const API_BASE = 'http://localhost:3000';
let inMemoryAccessToken: string | null = null;

export function setAccessToken(token: string | null) {
    inMemoryAccessToken = token;
    if (token) 
        localStorage.setItem('authToken', token);
    else 
        localStorage.removeItem('authToken');
}

// please import this function to get the access token and use it this way whenever you make api requests
// import { getAccessToken } from '../utils/api';
// const token = getAccessToken();
// if (token) headers.set('Authorization', `Bearer ${token}`);

export function getAccessToken(): string | null {
    return inMemoryAccessToken || localStorage.getItem('authToken');
}
