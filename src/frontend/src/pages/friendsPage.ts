import { setCurrentPage } from '../utils/globalState';
import { renderApp } from '../main';

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

  root.innerHTML = `
    <div style="padding: 20px; max-width: 1200px; margin: 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
        <h1 style="color: white; font-size: 2rem;">Friends</h1>
        <button id="backBtn" style="padding: 10px 20px; background: #374151; color: white; border: none; border-radius: 5px; cursor: pointer;">
          ← Back
        </button>
      </div>

      <!-- Search Users -->
      <div style="background: #1f2937; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
        <h2 style="color: white; margin-bottom: 15px;">Add Friends</h2>
        <div style="display: flex; gap: 10px;">
          <input 
            type="text" 
            id="friendSearch" 
            placeholder="Search by username..." 
            style="flex: 1; padding: 10px; background: #374151; border: 1px solid #4b5563; border-radius: 5px; color: white;"
          >
          <button 
            id="searchBtn" 
            style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer;"
          >
            Search
          </button>
        </div>
        <div id="searchResults" style="margin-top: 15px;"></div>
      </div>

      <!-- Pending Requests -->
      <div style="background: #1f2937; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
        <h2 style="color: white; margin-bottom: 15px;">Friend Requests (<span id="requestCount">0</span>)</h2>
        <div id="pendingRequests"></div>
      </div>

      <!-- Friends List -->
      <div style="background: #1f2937; padding: 20px; border-radius: 10px;">
        <h2 style="color: white; margin-bottom: 15px;">Your Friends (<span id="friendCount">0</span>)</h2>
        <div id="friendsList"></div>
      </div>

      <!-- Game Invitations -->
      <div style="background: #1f2937; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
        <h2 style="color: white; margin-bottom: 15px;">Game Invitations (<span id="invitationCount">0</span>)</h2>
        <div id="gameInvitations"></div>
      </div>
    </div>
  `;

  initFriendsPage();
}

function initFriendsPage(): void {
  loadFriends();
  loadPendingRequests();
  loadInvitations();
  
  // Back button
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      history.pushState({ page: 'landing' }, '', '#landing');
      setCurrentPage('landing');
      renderApp();
    });
  }

  // Search functionality
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

async function loadFriends() {
  try {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
    const response = await fetch(`${apiEndpoint}/api/friends/list`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      }
    });

    const data = await response.json();
    
    if (data.success) {
      displayFriends(data.data);
      const countEl = document.getElementById('friendCount');
      if (countEl) countEl.textContent = data.data.length.toString();
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
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      }
    });

    const data = await response.json();
    
    if (data.success) {
      displayPendingRequests(data.data);
      const countEl = document.getElementById('requestCount');
      if (countEl) countEl.textContent = data.data.length.toString();
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
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      }
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
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
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      }
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
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      }
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
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      }
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

async function inviteToGame(friendId: number) {
  try {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
    const response = await fetch(`${apiEndpoint}/api/invitations/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      },
      body: JSON.stringify({ 
        friendId,
        gameMode: '2P' // or get from user selection
      })
    });

    const data = await response.json();
    
    if (data.success) {   
      // Navigate to the lobby/room
      window.location.href = `/join/${data.data.roomId}`;
    } else {
      alert(data.message || 'Failed to send invitation');
    }
  } catch (error) {
    console.error('Failed to send invitation:', error);
    alert('Failed to send game invitation');
  }
}

function displayFriends(friends: User[]) {
  const container = document.getElementById('friendsList');
  if (!container) return;

  if (friends.length === 0) {
    container.innerHTML = '<p style="color: #9ca3af;">No friends yet. Search and add some!</p>';
    return;
  }

  container.innerHTML = friends.map(friend => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 15px; background: #374151; border-radius: 8px; margin-bottom: 10px;">
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
          <strong style="color: white; display: block;">${friend.username}</strong>
          <span style="color: #9ca3af; font-size: 0.9rem;">${friend.firstName} ${friend.lastName}</span>
        </div>
      </div>
      <div style="display: flex; gap: 10px;">
        <button 
          onclick="window.inviteToGame(${friend.id})"
          style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 5px; cursor: pointer;"
        >
          🎮 Invite
        </button>
        <button 
          onclick="window.removeFriend(${friend.id})"
          style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 5px; cursor: pointer;"
        >
          Remove
        </button>
      </div>
    </div>
  `).join('');

  (window as any).inviteToGame = inviteToGame;
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
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 15px; background: #374151; border-radius: 8px; margin-bottom: 10px;">
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
          style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 5px; cursor: pointer;"
        >
          ✓ Accept
        </button>
        <button 
          onclick="window.rejectRequest(${user.id})"
          style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 5px; cursor: pointer;"
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
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 15px; background: #374151; border-radius: 8px; margin-bottom: 10px;">
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
            style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer;"
          >
            + Add Friend
          </button>`
        }
      </div>
    </div>
  `).join('');

  (window as any).sendRequest = sendFriendRequest;
}

async function loadInvitations() {
  try {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
    const response = await fetch(`${apiEndpoint}/api/invitations/pending`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      }
    });

    const data = await response.json();
    
    if (data.success) {
      displayInvitations(data.data);
      const countEl = document.getElementById('invitationCount');
      if (countEl) countEl.textContent = data.data.length.toString();
    }
  } catch (error) {
    console.error('Failed to load invitations:', error);
  }
}

function displayInvitations(invitations: any[]) {
  const container = document.getElementById('gameInvitations');
  if (!container) return;

  if (invitations.length === 0) {
    container.innerHTML = '<p style="color: #9ca3af;">No pending invitations</p>';
    return;
  }

  container.innerHTML = invitations.map(inv => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 15px; background: #374151; border-radius: 8px; margin-bottom: 10px;">
      <div style="display: flex; align-items: center; gap: 15px;">
        ${inv.from.avatar ? 
          `<img 
            src="${inv.from.avatar}" 
            alt="${inv.from.username}"
            style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;"
          >` :
          `<div style="width: 50px; height: 50px; border-radius: 50%; background: #8b5cf6; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.5rem;">
            ${inv.from.username[0].toUpperCase()}
          </div>`
        }
        <div>
          <strong style="color: white; display: block;">🎮 ${inv.from.username} invited you to play!</strong>
          <span style="color: #9ca3af; font-size: 0.9rem;">Expires: ${new Date(inv.expiresAt).toLocaleTimeString()}</span>
        </div>
      </div>
      <div style="display: flex; gap: 10px;">
        <button 
          onclick="window.acceptInvitation(${inv.id}, '${inv.roomId}')"
          style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;"
        >
          ✓ Join Game
        </button>
        <button 
          onclick="window.rejectInvitation(${inv.id})"
          style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 5px; cursor: pointer;"
        >
          ✗ Decline
        </button>
      </div>
    </div>
  `).join('');

  (window as any).acceptInvitation = acceptInvitation;
  (window as any).rejectInvitation = rejectInvitation;
}

async function acceptInvitation(invitationId: number, roomId: string) {
  try {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
    const response = await fetch(`${apiEndpoint}/api/invitations/accept/${invitationId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      }
    });

    const data = await response.json();
    
    if (data.success) {
      // Navigate to the game room
      window.location.href = `/join/${roomId}`;
    } else {
      alert(data.message);
      loadInvitations(); // Refresh list
    }
  } catch (error) {
    console.error('Failed to accept invitation:', error);
  }
}

async function rejectInvitation(invitationId: number) {
  try {
    const apiEndpoint = window.__INITIAL_STATE__?.apiEndpoint || '';
    const response = await fetch(`${apiEndpoint}/api/invitations/reject/${invitationId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      }
    });

    const data = await response.json();
    
    if (data.success) {
      loadInvitations(); // Refresh list
    }
  } catch (error) {
    console.error('Failed to reject invitation:', error);
  }
}
