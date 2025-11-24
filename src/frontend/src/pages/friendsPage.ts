import { setCurrentPage } from '../utils/globalState';
import { presenceService } from '../utils/presenceService';
import { renderApp } from '../main';

let refreshInterval: number | null = null;
let isRefreshing = false;
let previousCounts = {
    friends: 0,
    requests: 0,
    invitations: 0
};
import { authService } from '../utils/auth';

interface User {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
    avatar: string;
    friendshipStatus?: string | null;
}

export function renderFriendsPage(): void {
  const root = document.getElementById('app-root');
  if (!root) return;
  presenceService.startHeartbeat();

  root.innerHTML = `
    <div class="neon-grid">
      <div class="grid-anim"></div>
      <div class="glass-card" style="max-width: 1200px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <h1 class="title-neon" style="font-size: 2rem;">Friends</h1>
          <button id="backBtn" class="btn btn-neon accent">
            ← Back
          </button>
        </div>

        <!-- Search Users -->
        <div class="glass-card" style="margin-bottom: 20px; padding: 20px;">
          <h2 style="color: white; margin-bottom: 15px;">Add Friends</h2>
          <div style="display: flex; gap: 10px;">
            <input
              type="text"
              id="friendSearch"
              placeholder="Search by username..."
              style="flex: 1; padding: 10px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 5px; color: white;"
            >
            <button
              id="searchBtn"
              class="btn btn-neon primary"
            >
              Search
            </button>
          </div>
          <div id="searchResults" style="margin-top: 15px;"></div>
        </div>

        <!-- Pending Requests -->
        <div class="glass-card" style="margin-bottom: 20px; padding: 20px;">
          <h2 style="color: white; margin-bottom: 15px;">Friend Requests (<span id="requestCount">0</span>)
            <span id="requestBadge" style="display: none; color: #10b981; font-size: 0.8rem; margin-left: 10px;">
                🔔 New!
            </span>
        </h2>
          <div id="pendingRequests"></div>
        </div>

        <!-- Friends List -->
        <div class="glass-card" style="margin-bottom: 20px; padding: 20px;">
          <h2 style="color: white; margin-bottom: 15px;">Your Friends (<span id="friendCount">0</span>)</h2>
          <div id="friendsList"></div>
        </div>
        
      </div>
    </div>
  `;

  initFriendsPage();
}

function initFriendsPage(): void {
  // Initial load
  refreshAllData();
  
  // Start auto-refresh (every 10 seconds)
  startAutoRefresh();
  
  // Back button with cleanup
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      stopAutoRefresh();
      history.pushState({ page: 'profile' }, '', '/profile');
      setCurrentPage('profile');
      renderApp();
    });
  }

  // Search functionality (keep your existing code)
  const searchBtn = document.getElementById('searchBtn');
  const searchInput = document.getElementById('friendSearch') as HTMLInputElement;
  
  if (searchBtn && searchInput) {
    searchBtn.addEventListener('click', () => {
      searchUsers(searchInput.value);
    });

    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchUsers(searchInput.value);
      }
    });
  }
}

function startAutoRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  
  refreshInterval = window.setInterval(() => {
    refreshAllData();
  }, 10000); // 10 seconds
  
}

function stopAutoRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

async function refreshAllData(): Promise<void> {
  if (isRefreshing) return; 
  
  isRefreshing = true;
  
  try {
    // Load all data in parallel
    await Promise.all([
      loadFriends(),
      loadPendingRequests(),
    ]);
    
  } catch (error) {
    console.error('[FRIENDS] Refresh error:', error);
  } finally {
    isRefreshing = false;
  }
}

function showNewBadge(type: 'request' | 'invitation'): void {
  const badgeId = type === 'request' ? 'requestBadge' : 'invitationBadge';
  const badge = document.getElementById(badgeId);
  
  if (badge) {
    badge.style.display = 'inline';
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      badge.style.display = 'none';
    }, 3000);
  }
}

async function loadFriends() {
  try {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
    const response = await fetch(`${apiEndpoint}/api/friends/list`, {
      credentials: 'include',
    });

        const data = await response.json();
    
        if (data.success) {
            const newCount = data.data.length;

            if (newCount !== previousCounts.friends && previousCounts.friends !== 0) {
                console.log(`🔔 Friend count changed: ${previousCounts.friends} → ${newCount}`);
            }
            previousCounts.requests = newCount;

            displayFriends(data.data);
            const countEl = document.getElementById('friendCount');
            if (countEl) 
                countEl.textContent = data.data.length.toString();
        }
    } catch (error) {
        console.error('Failed to load friends:', error);
        const container = document.getElementById('friendsList');
        if (container) {
            container.innerHTML = '<p style="color: #ef4444;">Failed to load friends. Please try again.</p>';
        }
    }
}

async function loadPendingRequests() {
  try {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
    const response = await fetch(`${apiEndpoint}/api/friends/requests/pending`, {
      credentials: 'include',
    });

        const data = await response.json();
    
        if (data.success) {
            const newCount = data.data.length;

            if (newCount > previousCounts.requests && previousCounts.requests !== 0) {
                console.log(`🔔 New friend request! (${newCount - previousCounts.requests} new)`);
            }
            displayPendingRequests(data.data);
            const countEl = document.getElementById('requestCount');
            if (countEl) 
                countEl.textContent = data.data.length.toString();
        }
    } catch (error) {
        console.error('Failed to load requests:', error);
    }
}

async function searchUsers(query: string) {
  const resultsContainer = document.getElementById('searchResults');
  if (!resultsContainer) return;

  if (query.length < 2) {
    resultsContainer.innerHTML = '<p style="color: #9ca3af;">Enter at least 2 characters to search</p>';
    return;
  }

  resultsContainer.innerHTML = '<p style="color: #9ca3af;">Searching...</p>';

  try {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
    const response = await fetch(`${apiEndpoint}/api/friends/search?q=${encodeURIComponent(query)}`, {
      credentials: 'include',
    });

    const data = await response.json();
    
    if (data.success) {
      displaySearchResults(data.data);
    } else {
      resultsContainer.innerHTML = `<p style="color: #ef4444;">${data.message}</p>`;
    }
  } catch (error) {
    console.error('Search failed:', error);
    resultsContainer.innerHTML = '<p style="color: #ef4444;">Search failed. Please try again.</p>';
  }
}

async function sendFriendRequest(friendId: number) {
  try {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
    const response = await fetch(`${apiEndpoint}/api/friends/request`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ friendId })
    });

    const data = await response.json();
    
    if (data.success) {
      alert('Friend request sent! ✅');
      const searchInput = document.getElementById('friendSearch') as HTMLInputElement;
      if (searchInput && searchInput.value) {
        searchUsers(searchInput.value);
      }
    } else {
      alert(data.message);
    }
  } catch (error) {
    console.error('Failed to send request:', error);
    alert('Failed to send friend request');
  }
}

async function acceptFriendRequest(friendId: number) {
  try {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
    const response = await fetch(`${apiEndpoint}/api/friends/accept/${friendId}`, {
      method: 'POST',
      credentials: 'include',
    });

    const data = await response.json();
    
    if (data.success) {
      loadFriends();
      loadPendingRequests();
    } else {
      alert(data.message);
    }
  } catch (error) {
    console.error('Failed to accept request:', error);
  }
}

async function rejectFriendRequest(friendId: number) {
  try {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
    const response = await fetch(`${apiEndpoint}/api/friends/reject/${friendId}`, {
      method: 'POST',
      credentials: 'include',
    });

    const data = await response.json();
    
    if (data.success) {
      loadPendingRequests();
    } else {
      alert(data.message);
    }
  } catch (error) {
    console.error('Failed to reject request:', error);
  }
}

async function removeFriend(friendId: number) {
  if (!confirm('Are you sure you want to remove this friend?')) {
    return;
  }

  try {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
    const response = await fetch(`${apiEndpoint}/api/friends/${friendId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    const data = await response.json();
    
    if (data.success) {
      loadFriends();
    } else {
      alert(data.message);
    }
  } catch (error) {
    console.error('Failed to remove friend:', error);
  }
}
 
async function displayFriends(friends: User[]) {
  const container = document.getElementById('friendsList');
  if (!container) return;

  if (friends.length === 0) {
    container.innerHTML = '<p style="color: #9ca3af;">No friends yet. Search and add some!</p>';
    return;
  }

  // Fetch presence for all friends
  const friendIds = friends.map(f => f.id);
  const presences = await presenceService.fetchBatchPresence(friendIds);

  container.innerHTML = friends.map(friend => {
    const presence = presences.get(friend.id);
    const status = presence?.status;
    let statusColor;
    let statusText;
    if (status == 'online') {
      statusColor = '#10b981';
      statusText = 'Online';
    } else if (status == 'in game') {
      statusColor = '#12d6f0ff';
      statusText = 'In Game';
    } else {
      statusColor = '#6b7280';
      statusText = 'Offline';
    }

    return `
    <div class="glass-card" style="display: flex; align-items: center; justify-content: space-between; padding: 15px; margin-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 15px;">
          ${friend.avatar ? 
            `<img 
              src="${friend.avatar}" 
              alt="${friend.username}"
              style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;"
            >` :
            `<div style="width: 50px; height: 50px; border-radius: 50%; background: #10b981; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.5rem;">
              ${friend.username[0].toUpperCase()}
            </div>`
          }
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="color: white;">${friend.username}</strong>
              <div style="display: flex; align-items: center; gap: 5px;">
                <div style="
                  width: 8px; 
                  height: 8px; 
                  border-radius: 50%; 
                  background: ${statusColor};
                  ${'box-shadow: 0 0 8px ' + statusColor + ';'}
                "></div>
                <span style="color: ${statusColor}; font-size: 0.75rem; font-weight: 500;">
                  ${statusText}
                </span>
              </div>
            </div>
            <span style="color: #9ca3af; font-size: 0.9rem;">${friend.firstName} ${friend.lastName}</span>
          </div>
        </div>
        <div style="display: flex; gap: 10px;">
          <button 
            onclick="window.removeFriend(${friend.id})"
            style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 5px; cursor: pointer;"
          >
            Remove
          </button>
        </div>
      </div>
    `;
  }).join('');

  (window as any).removeFriend = removeFriend;
}

function displayPendingRequests(requests: User[]) {
  const container = document.getElementById('pendingRequests');
  if (!container) return;

  if (requests.length === 0) {
    container.innerHTML = '<p style="color: #9ca3af;">No pending requests</p>';
    return;
  }

  container.innerHTML = requests.map(user => `
    <div class="glass-card" style="display: flex; align-items: center; justify-content: space-between; padding: 15px; margin-bottom: 10px;">
      <div style="display: flex; align-items: center; gap: 15px;">
        ${user.avatar ?
          `<img
            src="${user.avatar}"
            alt="${user.username}"
            style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;"
          >` :
          `<div style="width: 50px; height: 50px; border-radius: 50%; background: #f59e0b; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.5rem;">
            ${user.username[0].toUpperCase()}
          </div>`
        }
        <div>
          <strong style="color: white; display: block;">${user.username}</strong>
          <span style="color: #9ca3af; font-size: 0.9rem;">${user.firstName} ${user.lastName}</span>
        </div>
      </div>
      <div style="display: flex; gap: 10px;">
        <button
          onclick="window.acceptRequest(${user.id})"
          class="btn btn-neon primary"
        >
          ✓ Accept
        </button>
        <button
          onclick="window.rejectRequest(${user.id})"
          class="btn btn-neon accent"
        >
          ✗ Reject
        </button>
      </div>
    </div>
  `).join('');

  (window as any).acceptRequest = acceptFriendRequest;
  (window as any).rejectRequest = rejectFriendRequest;
}

function displaySearchResults(results: User[]) {
  const container = document.getElementById('searchResults');
  if (!container) return;

  if (results.length === 0) {
    container.innerHTML = '<p style="color: #9ca3af;">No users found</p>';
    return;
  }

  container.innerHTML = results.map(user => `
    <div class="glass-card" style="display: flex; align-items: center; justify-content: space-between; padding: 15px; margin-bottom: 10px;">
      <div style="display: flex; align-items: center; gap: 15px;">
        ${user.avatar ?
          `<img
            src="${user.avatar}"
            alt="${user.username}"
            style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;"
          >` :
          `<div style="width: 40px; height: 40px; border-radius: 50%; background: #3b82f6; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.2rem;">
            ${user.username[0].toUpperCase()}
          </div>`
        }
        <div>
          <strong style="color: white; display: block;">${user.username}</strong>
          <span style="color: #9ca3af; font-size: 0.9rem;">${user.firstName} ${user.lastName}</span>
        </div>
      </div>
      <div>
        ${user.friendshipStatus === 'accepted' ?
          '<span style="color: #10b981;">✓ Friends</span>' :
          user.friendshipStatus === 'pending' ?
          '<span style="color: #f59e0b;">⏳ Request Sent</span>' :
          `<button
            onclick="window.sendRequest(${user.id})"
            class="btn btn-neon primary"
          >
            + Add Friend
          </button>`
        }
      </div>
    </div>
  `).join('');

  (window as any).sendRequest = sendFriendRequest;
}
