const browserAPI = typeof chrome !== 'undefined' ? chrome : browser;

// Store the current path to detect changes
let currentPath = window.location.pathname;

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    startup();
  });
} else {
  startup();
}

function startup() {
  let isFirst = browserAPI.storage.local.get('onky_scam').then(result => result || false);
  if (isFirst) {
    console.log('First time setup detected, initializing...');
    browserAPI.storage.local.set({
      "onky_scam": true
    });
    init();
    setupPathChangeListener();
  } else if (window.location.pathname === 'signin') {
    currentPath = window.location.pathname;
    setupPathChangeListener();
  }
}

function setupPathChangeListener() {
  setInterval(() => {
    if (window.location.pathname !== currentPath) {
      console.log('Path changed from interval check:', currentPath, '->', window.location.pathname);
      currentPath = window.location.pathname;
      init();
    }
  }, 1000); // Check every second
}

async function init() {
  let accounts = await browserAPI.storage.local.get('soundcloudAccounts').then(result => result.soundcloudAccounts || []);

  const currentAccount = await getCurrentAccount();
  let found = accounts.some(account => account.username === currentAccount.username);

  if (found) {
    accounts = accounts.map(account =>
      account.username === currentAccount.username
        ? {...account, isActive: true}
        : {...account, isActive: false}
    );
  } else {
    accounts = accounts.map(account => ({...account, isActive: false}));
    accounts.push({
      ...currentAccount,
      isActive: true
    });
  }

  await browserAPI.storage.local.set({
    soundcloudAccounts: accounts
  }, () => {
    console.log('SoundCloud accounts updated:', accounts);
  });
}

function getCurrentAccount() {
  return new Promise((resolve, reject) => {
    // Wait for the page to be fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        findAccountAndGetCookies(resolve, reject);
      });
    } else {
      // Add a small delay to ensure dynamic content is loaded
      setTimeout(() => {
        findAccountAndGetCookies(resolve, reject);
      }, 1000);
    }
  });
}

function findAccountAndGetCookies(resolve, reject) {
  // Try multiple selectors to find the avatar span
  const selectors = [
    '.sc-artwork.image__rounded.image__full span',
    // 'span[aria-label*="avatar"]',
    // 'span.sc-artwork[aria-label*="avatar"]',
    // 'span[style*="background-image"]',
    // '.sc-artwork.image__rounded[aria-label*="avatar"]'
  ];

  let avatarSpan = null;

  for (const selector of selectors) {
    avatarSpan = document.querySelector(selector);
    if (avatarSpan) {
      break;
    }
  }

  if (!avatarSpan) {
    const allSpans = document.querySelectorAll('span');
    for (const span of allSpans) {
      if (span.style.backgroundImage && span.getAttribute('aria-label')?.includes('avatar')) {
        avatarSpan = span;
        console.log('Found avatar span by checking all spans');
        break;
      }
    }
  }

  if (!avatarSpan) {
    console.log('Avatar span not found');
    console.log('Available spans:', document.querySelectorAll('span').length);

    // Log some debug info
    const headerNav = document.querySelector('.header__userNavAvatar');
    if (headerNav) {
      console.log('Header nav found:', headerNav.innerHTML);
    }

    return null;
  }

  const backgroundImage = avatarSpan.style.backgroundImage;
  const urlMatch = backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
  const profilePicUrl = urlMatch ? urlMatch[1] : null;

  const ariaLabel = avatarSpan.getAttribute('aria-label');
  const username = ariaLabel ? ariaLabel.replace("’s avatar", "") : null;

  if (!profilePicUrl || !username) {
    console.log('Could not extract profile picture URL or username');
    console.log('Profile pic URL:', profilePicUrl);
    console.log('Username:', username);
    return null;
  }

  browserAPI.runtime.sendMessage({
    method: 'getCurrentCookies'
  }, (response) => {
    if ((response && response.success) && !browserAPI.runtime.lastError) {
      resolve({
        profilePicUrl: profilePicUrl,
        username: username,
        cookie: response.cookie
      });
    } else {
      return null;
    }
  });
}
