import { API_BASE } from '../config';
import { authService } from '../utils/auth';
import { createUserNav, attachUserNavListeners } from '../utils/navigation';

interface UserStats {
  username: string;
  gamesWon: number;
  gamesLost: number;
  totalGames: number;
  winRate: number;
}

interface GameHistory {
  id: number;
  date: string;
  winner: string;
  loser: string;
  score: string;
}

async function fetchUserStats(): Promise<UserStats | null> {
  try {
    const user = await authService.getCurrentUser();
    if (!user) return null;

    const response = await fetch(`${API_BASE}/api/users/${user.id}`, {
      credentials: 'include',
    });

    if (!response.ok) return null;

    const data = await response.json();
    const userData = data.data;

    return {
      username: userData.username,
      gamesWon: userData.gamesWon || 0,
      gamesLost: userData.gamesLost || 0,
      totalGames: (userData.gamesWon || 0) + (userData.gamesLost || 0),
      winRate: userData.gamesWon + userData.gamesLost > 0 
        ? (userData.gamesWon / (userData.gamesWon + userData.gamesLost)) * 100 
        : 0,
    };
  } catch (error) {
    console.error('Error fetching user stats:', error);
    return null;
  }
}

async function fetchGameHistory(): Promise<GameHistory[]> {
  try {
    const user = await authService.getCurrentUser();
    if (!user) return [];

    const response = await fetch(`${API_BASE}/api/game/history`, {
      credentials: 'include',
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching game history:', error);
    return [];
  }
}

function createWinLossPieChart(stats: UserStats): string {
  const total = stats.totalGames;
  if (total === 0) {
    return `
      <div style="width: 300px; height: 300px; margin: 0 auto; display: flex; align-items: center; justify-content: center; border: 2px dashed rgba(255,255,255,0.2); border-radius: 50%;">
        <p style="color: #9ca3af;">No games played yet</p>
      </div>
    `;
  }

  const winPercentage = (stats.gamesWon / total) * 100;
  const lossPercentage = (stats.gamesLost / total) * 100;

  // SVG Pie Chart
  const radius = 100;
  const circumference = 2 * Math.PI * radius;
  const winStroke = (winPercentage / 100) * circumference;
  const lossStroke = (lossPercentage / 100) * circumference;

  return `
    <div style="position: relative; width: 300px; height: 300px; margin: 0 auto;">
      <svg width="300" height="300" viewBox="0 0 300 300" style="transform: rotate(-90deg);">
        <!-- Background circle -->
        <circle cx="150" cy="150" r="${radius}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="60"/>
        
        <!-- Wins (green) -->
        <circle 
          cx="150" 
          cy="150" 
          r="${radius}" 
          fill="none" 
          stroke="#10b981" 
          stroke-width="60"
          stroke-dasharray="${winStroke} ${circumference}"
          stroke-dashoffset="0"
          style="transition: stroke-dasharray 1s ease;"
        />
        
        <!-- Losses (red) -->
        <circle 
          cx="150" 
          cy="150" 
          r="${radius}" 
          fill="none" 
          stroke="#ef4444" 
          stroke-width="60"
          stroke-dasharray="${lossStroke} ${circumference}"
          stroke-dashoffset="${-winStroke}"
          style="transition: stroke-dasharray 1s ease;"
        />
      </svg>
      
      <!-- Center text -->
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
        <div style="font-size: 2.5rem; font-weight: bold; color: #fff;">${total}</div>
        <div style="font-size: 0.9rem; color: #9ca3af;">Total Games</div>
      </div>
    </div>
    
    <!-- Legend -->
    <div style="display: flex; justify-content: center; gap: 2em; margin-top: 1.5em;">
      <div style="display: flex; align-items: center; gap: 0.5em;">
        <div style="width: 20px; height: 20px; background: #10b981; border-radius: 4px;"></div>
        <span style="color: #9ca3af;">Wins: ${stats.gamesWon} (${winPercentage.toFixed(1)}%)</span>
      </div>
      <div style="display: flex; align-items: center; gap: 0.5em;">
        <div style="width: 20px; height: 20px; background: #ef4444; border-radius: 4px;"></div>
        <span style="color: #9ca3af;">Losses: ${stats.gamesLost} (${lossPercentage.toFixed(1)}%)</span>
      </div>
    </div>
  `;
}

function createPerformanceBarChart(stats: UserStats): string {
  const maxValue = Math.max(stats.gamesWon, stats.gamesLost, 1);
  const winHeight = (stats.gamesWon / maxValue) * 200;
  const lossHeight = (stats.gamesLost / maxValue) * 200;

  return `
    <div style="display: flex; align-items: flex-end; justify-content: center; gap: 4em; height: 250px; padding: 1em;">
      <!-- Wins Bar -->
      <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5em;">
        <div style="font-size: 1.5rem; font-weight: bold; color: #10b981;">${stats.gamesWon}</div>
        <div style="position: relative; width: 80px; height: 200px; background: rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden;">
          <div style="
            position: absolute;
            bottom: 0;
            width: 100%;
            height: ${winHeight}px;
            background: linear-gradient(to top, #10b981, #34d399);
            border-radius: 8px 8px 0 0;
            transition: height 1s ease;
          "></div>
        </div>
        <div style="color: #9ca3af; font-weight: 600;">Wins</div>
      </div>
      
      <!-- Losses Bar -->
      <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5em;">
        <div style="font-size: 1.5rem; font-weight: bold; color: #ef4444;">${stats.gamesLost}</div>
        <div style="position: relative; width: 80px; height: 200px; background: rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden;">
          <div style="
            position: absolute;
            bottom: 0;
            width: 100%;
            height: ${lossHeight}px;
            background: linear-gradient(to top, #ef4444, #f87171);
            border-radius: 8px 8px 0 0;
            transition: height 1s ease;
          "></div>
        </div>
        <div style="color: #9ca3af; font-weight: 600;">Losses</div>
      </div>
    </div>
  `;
}

function createWinRateGauge(winRate: number): string {
  const rotation = (winRate / 100) * 180 - 90;
  
  let color = '#ef4444'; // Red
  if (winRate >= 70) color = '#10b981'; // Green
  else if (winRate >= 40) color = '#f59e0b'; // Orange

  return `
    <div style="position: relative; width: 300px; height: 180px; margin: 0 auto;">
      <!-- Gauge background -->
      <svg width="300" height="180" viewBox="0 0 300 180">
        <!-- Background arc -->
        <path
          d="M 30 150 A 120 120 0 0 1 270 150"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          stroke-width="30"
          stroke-linecap="round"
        />
        
        <!-- Colored arc -->
        <path
          d="M 30 150 A 120 120 0 0 1 270 150"
          fill="none"
          stroke="${color}"
          stroke-width="30"
          stroke-linecap="round"
          stroke-dasharray="${(winRate / 100) * 377} 377"
          style="transition: stroke-dasharray 1s ease;"
        />
        
        <!-- Center circle -->
        <circle cx="150" cy="150" r="10" fill="#fff"/>
        
        <!-- Needle -->
        <line
          x1="150"
          y1="150"
          x2="150"
          y2="50"
          stroke="#fff"
          stroke-width="3"
          stroke-linecap="round"
          transform="rotate(${rotation} 150 150)"
          style="transition: transform 1s ease;"
        />
      </svg>
      
      <!-- Center text -->
      <div style="position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); text-align: center;">
        <div style="font-size: 2.5rem; font-weight: bold; color: ${color};">${winRate.toFixed(1)}%</div>
        <div style="font-size: 0.9rem; color: #9ca3af;">Win Rate</div>
      </div>
    </div>
  `;
}

export async function renderStatsPage(): Promise<void> {
  const root = document.getElementById('app-root');
  if (!root) return;

  const userNavHTML = await createUserNav();

  root.innerHTML = `
    ${userNavHTML}
    <div class="neon-grid profile-container" style="width:100%; max-width:1400px; padding: 2em;">
      <div class="grid-anim"></div>
      
      <div style="margin-bottom: 2em;">
        <h1 class="title-neon" style="text-align: center; margin-bottom: 0.5em;">📊 Statistics Dashboard</h1>
        <p style="text-align: center; color: #9ca3af;">Visualize your gaming performance</p>
      </div>

      <div id="statsContent" style="min-height: 400px;">
        <div style="text-align: center; padding: 4em; color: #9ca3af;">
          <div style="font-size: 2em; margin-bottom: 0.5em;">⏳</div>
          Loading statistics...
        </div>
      </div>

      <div style="text-align: center; margin-top: 2em;">
        <button id="backBtn" class="btn-neon accent" style="padding: 0.75em 2em;">
          ← Back to Home
        </button>
      </div>
    </div>
  `;

  attachUserNavListeners();

  // Load stats
  const stats = await fetchUserStats();
  const statsContent = document.getElementById('statsContent');

  if (!statsContent) return;

  if (!stats || stats.totalGames === 0) {
    statsContent.innerHTML = `
      <div class="glass-card" style="padding: 3em; text-align: center;">
        <div style="font-size: 3em; margin-bottom: 0.5em;">🎮</div>
        <h2 style="color: #fff; margin-bottom: 0.5em;">No Statistics Yet</h2>
        <p style="color: #9ca3af;">Play some games to see your statistics visualized here!</p>
      </div>
    `;
  } else {
    statsContent.innerHTML = `
      <!-- Overview Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5em; margin-bottom: 2em;">
        <div class="glass-card" style="padding: 1.5em; text-align: center;">
          <div style="font-size: 0.9rem; color: #9ca3af; margin-bottom: 0.5em;">Total Games</div>
          <div style="font-size: 2.5rem; font-weight: bold; color: #fff;">${stats.totalGames}</div>
        </div>
        
        <div class="glass-card" style="padding: 1.5em; text-align: center;">
          <div style="font-size: 0.9rem; color: #9ca3af; margin-bottom: 0.5em;">Wins</div>
          <div style="font-size: 2.5rem; font-weight: bold; color: #10b981;">${stats.gamesWon}</div>
        </div>
        
        <div class="glass-card" style="padding: 1.5em; text-align: center;">
          <div style="font-size: 0.9rem; color: #9ca3af; margin-bottom: 0.5em;">Losses</div>
          <div style="font-size: 2.5rem; font-weight: bold; color: #ef4444;">${stats.gamesLost}</div>
        </div>
        
        <div class="glass-card" style="padding: 1.5em; text-align: center;">
          <div style="font-size: 0.9rem; color: #9ca3af; margin-bottom: 0.5em;">Win Rate</div>
          <div style="font-size: 2.5rem; font-weight: bold; color: ${stats.winRate >= 50 ? '#10b981' : '#ef4444'};">${stats.winRate.toFixed(1)}%</div>
        </div>
      </div>

      <!-- Charts Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 2em;">
        <!-- Pie Chart -->
        <div class="glass-card" style="padding: 2em;">
          <h3 style="text-align: center; color: #fff; margin-bottom: 1.5em;">Win/Loss Distribution</h3>
          ${createWinLossPieChart(stats)}
        </div>

        <!-- Bar Chart -->
        <div class="glass-card" style="padding: 2em;">
          <h3 style="text-align: center; color: #fff; margin-bottom: 1.5em;">Performance Comparison</h3>
          ${createPerformanceBarChart(stats)}
        </div>
      </div>

      <!-- Win Rate Gauge -->
      <div class="glass-card" style="padding: 2em; margin-top: 2em;">
        <h3 style="text-align: center; color: #fff; margin-bottom: 1.5em;">Win Rate Gauge</h3>
        ${createWinRateGauge(stats.winRate)}
      </div>
    `;
  }

  // Back button
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      history.pushState({ page: 'landing' }, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  }
}

