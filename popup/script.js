const browserAPI = typeof chrome !== 'undefined' ? chrome : browser;

browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.soundcloudAccounts) {
    updateAccountList();
  }
});

async function updateAccountList() {
  const { soundcloudAccounts = [] } = await browserAPI.storage.local.get('soundcloudAccounts');

  const listContainer = document.getElementById('account-list');
  const emptyState = document.getElementById('empty-state');
  const accountCount = document.getElementById('account-count');

  accountCount.textContent = `${soundcloudAccounts.length} account${soundcloudAccounts.length !== 1 ? 's' : ''}`;
  listContainer.innerHTML = '';

  if (soundcloudAccounts.length === 0) {
    emptyState.classList.add('visible');
    return;
  }

  emptyState.classList.remove('visible');

  soundcloudAccounts.forEach((account, index) => {
    const username = account.username.replace(/[’']s avatar$/i, '');
    const displayName = (account.displayName || username).replace(/[’']s avatar$/i, '');
    const accountDiv = document.createElement('div');
    accountDiv.className = `account-item${account.isActive ? ' is-active' : ''}`;
    accountDiv.dataset.index = index;
    accountDiv.dataset.username = username;
    accountDiv.setAttribute('role', 'button');
    accountDiv.setAttribute('tabindex', '0');

    const img = document.createElement('img');
    img.src = account.profilePicUrl;
    img.alt = displayName;
    img.className = 'account-avatar';
    img.onerror = () => {
      img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiNmMGYwZjAiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzk5OTk5OSIgeD0iMTIiIHk9IjEyIj4KICA8cGF0aCBkPSJNMTIgMTJjMi4yMSAwIDQtMS43OSA0LTRzLTEuNzktNC00LTQtNCAxLjc5LTQgNCAxLjc5IDQgNCA0em0wIDJjLTIuNjcgMC04IDEuMzQtOCA0djJoMTZ2LTJjMC0yLjY2LTUuMzMtNC04LTR6Ii8+Cjwvc3ZnPgo8L3N2Zz4K';
    };

    const infoDiv = document.createElement('div');
    infoDiv.className = 'account-info';

    const usernameSpan = document.createElement('div');
    usernameSpan.className = 'account-username';
    usernameSpan.textContent = displayName;

    infoDiv.appendChild(usernameSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'account-actions';

    const switchBtn = document.createElement('button');
    switchBtn.className = 'action-btn switch-btn';
    switchBtn.textContent = '↻';
    switchBtn.title = 'Switch to this account';
    switchBtn.setAttribute('aria-label', `Switch to ${displayName}`);
    switchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      switchAccount(account, index);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'action-btn remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove account';
    removeBtn.setAttribute('aria-label', `Remove ${displayName}`);
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeAccount(account, index);
    });

    actionsDiv.appendChild(switchBtn);
    actionsDiv.appendChild(removeBtn);

    accountDiv.appendChild(img);
    accountDiv.appendChild(infoDiv);
    accountDiv.appendChild(actionsDiv);

    accountDiv.addEventListener('click', () => {
      switchAccount(account, index);
    });
    accountDiv.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        switchAccount(account, index);
      }
    });

    listContainer.appendChild(accountDiv);
  });
}

// ─── Account Actions ──────────────────────────────────────────────────────────

async function switchAccount(account, index) {
  const accountItem = document.querySelector(`[data-index="${index}"]`);

  try {
    if (accountItem) accountItem.classList.add('loading');

    const switchResponse = await browserAPI.runtime.sendMessage({ method: 'switchAccount', account });

    if (!switchResponse?.success) {
      throw new Error(switchResponse?.error ?? 'Unknown error');
    }
  } catch (error) {
    console.error('Error switching account:', error.message);
    alert(`Could not switch account: ${error.message}`);
  } finally {
    if (accountItem) accountItem.classList.remove('loading');
  }
}

async function removeAccount(account, index) {
  try {
    if (!confirm(`Are you sure you want to remove ${(account.displayName || account.username).replace(/[’']s avatar$/i, '')}?`)) {
      return;
    }

    const { soundcloudAccounts = [] } = await browserAPI.storage.local.get('soundcloudAccounts');

    if (account.isActive) {
      const response = await browserAPI.runtime.sendMessage({ method: 'clearCurrentCookies' });
      if (response?.success) {
        browserAPI.tabs.create({ url: 'https://soundcloud.com/signin' });
      }
    }

    const updatedAccounts = soundcloudAccounts.filter((_, accountIndex) => accountIndex !== index);
    await browserAPI.storage.local.set({ soundcloudAccounts: updatedAccounts });
  } catch (error) {
    console.error('Error removing account:', error.message);
  }
}

async function addAccount() {
  try {
    const response = await browserAPI.runtime.sendMessage({ method: 'clearCurrentCookies' });
    if (response?.success) {
      browserAPI.tabs.create({ url: 'https://soundcloud.com/signin' });
    } else {
      console.error('Failed to clear cookies:', response?.error ?? 'Unknown error');
    }
  } catch (error) {
    console.error('Error adding account:', error.message);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const addAccountBtn = document.getElementById('add-account-btn');
  if (addAccountBtn) {
    addAccountBtn.addEventListener('click', addAccount);
  }
});

updateAccountList();
