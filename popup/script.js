const browserAPI = typeof chrome !== 'undefined' ? chrome : browser;

browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.soundcloudAccounts) {
    updateAccountList();
  }
});

async function updateAccountList() {
  const { soundcloudAccounts = [] } = await browserAPI.storage.local.get('soundcloudAccounts');

  // Get active account by comparing cookies
  const activeAccountResponse = await new Promise(resolve => {
    browserAPI.runtime.sendMessage({
      method: 'getActiveAccount'
    }, response => {
      resolve(response);
    });
  });

  const activeAccount = activeAccountResponse && activeAccountResponse.success ? 
    activeAccountResponse.activeAccount : null;

  const listContainer = document.getElementById('account-list');
  const emptyState = document.getElementById('empty-state');
  const accountCount = document.getElementById('account-count');

  // Update account count
  accountCount.textContent = `${soundcloudAccounts.length} account${soundcloudAccounts.length !== 1 ? 's' : ''}`;

  // Clear previous content
  listContainer.innerHTML = '';

  if (soundcloudAccounts.length === 0) {
    emptyState.classList.add('visible');
    return;
  }

  emptyState.classList.remove('visible');

  soundcloudAccounts.forEach((account, index) => {
    const accountDiv = document.createElement('div');
    accountDiv.className = 'account-item';
    accountDiv.dataset.index = index;
    accountDiv.dataset.username = account.username;


    const img = document.createElement('img');
    img.src = account.profilePicUrl;
    img.alt = account.username;
    img.className = 'account-avatar';
    img.onerror = () => {
      img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjQiIGZpbGw9IiNmMGYwZjAiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzk5OTk5OSIgeD0iMTIiIHk9IjEyIj4KICA8cGF0aCBkPSJNMTIgMTJjMi4yMSAwIDQtMS43OSA0LTRzLTEuNzktNC00LTQtNCAxLjc5LTQgNCAxLjc5IDQgNCA0em0wIDJjLTIuNjcgMC04IDEuMzQtOCA0djJoMTZ2LTJjMC0yLjY2LTUuMzMtNC04LTR6Ii8+Cjwvc3ZnPgo8L3N2Zz4K';
    };

    const infoDiv = document.createElement('div');
    infoDiv.className = 'account-info';

    const usernameSpan = document.createElement('div');
    usernameSpan.className = 'account-username';
    usernameSpan.textContent = account.username;


    infoDiv.appendChild(usernameSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'account-actions';

    const switchBtn = document.createElement('button');
    switchBtn.className = 'action-btn switch-btn';
    switchBtn.innerHTML = '↻';
    switchBtn.title = 'Switch to this account';
    switchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      switchAccount(account, index);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'action-btn remove-btn';
    removeBtn.innerHTML = '✕';
    removeBtn.title = 'Remove account';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeAccount(account, index);
    });

    actionsDiv.appendChild(switchBtn);
    actionsDiv.appendChild(removeBtn);

    accountDiv.appendChild(img);
    accountDiv.appendChild(infoDiv);
    accountDiv.appendChild(actionsDiv);

    // Add click event for the entire account item
    accountDiv.addEventListener('click', () => {
      switchAccount(account, index);
    });

    listContainer.appendChild(accountDiv);
  });
}

async function switchAccount(account, index) {
  try {
    const accountItem = document.querySelector(`[data-index="${index}"]`);
    if (accountItem) {
      accountItem.classList.add('loading');
    }

    const accounts = await browserAPI.storage.local.get('soundcloudAccounts').then(result => result.soundcloudAccounts || []);
    const currentAccount = accounts[index];

    let currentCookie = null;
    browserAPI.runtime.sendMessage({
      method: 'getCurrentCookies'
    }, (response) => {
      if ((response && response.success) && !browserAPI.runtime.lastError) {
        currentCookie = response.cookie.value;
        if (currentCookie === currentAccount.cookie.value) {
          console.log('Already on this account:', account.username);
          if (accountItem) {
            accountItem.classList.remove('loading');
          }

          return null;
        }
      }
    });

    browserAPI.runtime.sendMessage({
      method: 'switchAccount',
      account: account
    }, (response) => {
      if (accountItem) {
        accountItem.classList.remove('loading');
      }

      if (response && response.success) {
        console.log('Account switched successfully:', account.username);
      } else {
        console.error('Failed to switch account:', response?.error || 'Unknown error');
      }
    });
  } catch (error) {
    console.error('Error switching account:', error);
  }
}

async function removeAccount(account, index) {
  try {
    // Show confirmation (optional)
    if (!confirm(`Are you sure you want to remove ${account.username}?`)) {
      return;
    }

    // Send message to background script
    browserAPI.runtime.sendMessage({
      method: 'removeAccount',
      account: account,
      index: index
    }, async (response) => {
      if (response && response.success) {
        // Remove from local storage
        const { soundcloudAccounts = [] } = await browserAPI.storage.local.get('soundcloudAccounts');

        // Get active account by comparing cookies
        const activeAccountResponse = await new Promise(resolve => {
          browserAPI.runtime.sendMessage({
            method: 'getActiveAccount'
          }, response => {
            resolve(response);
          });
        });

        const activeAccount = activeAccountResponse && activeAccountResponse.success ? 
          activeAccountResponse.activeAccount : null;

        const updatedAccounts = soundcloudAccounts.filter((_, i) => i !== index);
        await browserAPI.storage.local.set({ soundcloudAccounts: updatedAccounts });

        console.log('Account removed successfully:', account.username);
      } else {
        console.error('Failed to remove account:', response?.error || 'Unknown error');
      }
    });
  } catch (error) {
    console.error('Error removing account:', error);
  }
}

async function addAccount() {
  try {
    // Send message to background script to clear all cookies
    browserAPI.runtime.sendMessage({
      method: 'clearCurrentCookies'
    }, (response) => {
      if (response && response.success) {
        console.log('All cookies cleared successfully');

        // Open SoundCloud signin page in a new tab
        browserAPI.tabs.create({ url: 'https://soundcloud.com/signin' });
      } else {
        console.error('Failed to clear cookies:', response?.error || 'Unknown error');
      }
    });
  } catch (error) {
    console.error('Error adding account:', error);
  }
}

// Add event listener to the "Add account" button
document.addEventListener('DOMContentLoaded', () => {
  const addAccountBtn = document.getElementById('add-account-btn');
  if (addAccountBtn) {
    addAccountBtn.addEventListener('click', addAccount);
  }
});

// Initialize the account list when the script loads
updateAccountList();
