import { getCurrentUser } from './globalState';
import { authService } from './auth';

export interface UserData {
    username: string;
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
}

export function getUserData(): UserData {
    const username = getCurrentUser() || 'Guest';
    return {
        username: username,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0
    };
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
