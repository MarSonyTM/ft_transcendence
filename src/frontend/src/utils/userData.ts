import { getCurrentUser } from './globalState';
import { authService } from './auth';

export interface UserData {
    username: string;
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
}

export async function getUserData(): Promise<UserData> {
    const username = getCurrentUser();
    
    try {
        const response = await fetch('/api/users/profile', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user data');
        }

        const data = await response.json();
        
        return { 
            username: username,
            gamesPlayed: data.gamesPlayed || 0,
            gamesWon: data.gamesWon || 0,
            gamesLost: data.gamesLost || 0 
        };
    } catch (error) {
        console.error('Error fetching user data:', error);
        return {
            username: username,
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0
        };
    }
}

export async function updateUserStats(won: boolean): Promise<void> {
    const userData = await getUserData();
    userData.gamesPlayed++;
    
    if (won) {
        userData.gamesWon++;
    } else {
        userData.gamesLost++;
    }
}
