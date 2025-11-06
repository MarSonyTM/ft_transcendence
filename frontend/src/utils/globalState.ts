import { AppPage } from '../types';

export let currentPage: AppPage = (window.__CURRENT_PAGE__ as AppPage) || 'landing';
export let currentUser: string = window.__USERNAME__ || '';
export let currentGameMode: string = '2P';

export function setCurrentPage(page: AppPage) {
    currentPage = page;
}

export function setCurrentUser(user: string) {
    currentUser = user;
}

export function setCurrentGameMode(mode: string) {
    currentGameMode = mode;
}

export function getCurrentPage(): AppPage {
    return currentPage;
}

export function getCurrentUser(): string {
    return currentUser;
}

export function getCurrentGameMode(): string {
    return currentGameMode;
}
