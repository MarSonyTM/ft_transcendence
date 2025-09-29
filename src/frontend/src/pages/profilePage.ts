import { setCurrentPage, getCurrentUser } from '../utils/globalState';
import { getUserData } from '../utils/userData';
import { renderApp } from '../main';

export function renderProfilePage(): void {
  const root = document.getElementById('app-root');
  if (!root) return;
  
  const storedData = getUserData();
  const userData = {
    username: getCurrentUser() || storedData.username || 'Guest',
    gamesPlayed: storedData.gamesPlayed,
    gamesWon: storedData.gamesWon,
    gamesLost: storedData.gamesLost
  };
  
  const winRate = userData.gamesPlayed > 0 
    ? ((userData.gamesWon / userData.gamesPlayed) * 100).toFixed(1) 
    : '0';
  
  root.innerHTML = `
    <div class="profile-container">
      <div class="profile-card">
        <h2 style="text-align: center">Profile</h2>
        <div class="username-section">
          <h3>Username</h3>
          <p style="font-size: 1.8em; font-weight: bold; color: rgb(229 231 235); margin: 0;">${userData.username}</p>
        </div>
        <div class="stats-grid">
          <div class="stat-box">
            <h3>Games Played</h3>
            <p style="font-size: 2em; font-weight: bold; color: rgb(209 213 219); margin: 0;">${userData.gamesPlayed}</p>
          </div>
          <div class="stat-box">
            <h3>Win Rate</h3>
            <p style="font-size: 2em; font-weight: bold; color: rgb(209 213 219); margin: 0;">${winRate}%</p>
          </div>
          <div class="stat-box">
            <h3>Games Won</h3>
            <p style="font-size: 2em; font-weight: bold; color: rgb(34 197 94); margin: 0;">${userData.gamesWon}</p>
          </div>
          <div class="stat-box">
            <h3>Games Lost</h3>
            <p style="font-size: 2em; font-weight: bold; color: rgb(239 68 68); margin: 0;">${userData.gamesLost}</p>
          </div>
        </div>
      </div>
      <button id="backToLandingBtn" class="btn btn-back">Back to Home</button>
    </div>
  `;
  
  const backBtn = document.getElementById('backToLandingBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      history.pushState({ page: 'landing' }, '', '#');
      setCurrentPage('landing');
      renderApp();
    });
  }
}