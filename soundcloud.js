const browserAPI = typeof chrome !== 'undefined' ? chrome : browser;

let currentPath = window.location.pathname;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => startup());
} else {
  startup();
}

async function startup() {
  await init();
  setupPathChangeListener();
}

function setupPathChangeListener() {
  setInterval(() => {
    if (window.location.pathname !== currentPath) {
      currentPath = window.location.pathname;
      init();
    }
  }, 1000);
}

async function init() {
  const { soundcloudAccounts: accounts = [] } = await browserAPI.storage.local.get('soundcloudAccounts');

  const currentAccount = await detectCurrentAccount();
  if (!currentAccount) return;

  const currentCookieValues = new Set(currentAccount.cookies.map(({value}) => value));
  const existingIndex = accounts.findIndex(account =>
    account.username === currentAccount.username ||
    [account.cookie, ...(account.cookies || [])].some(cookie => currentCookieValues.has(cookie?.value))
  );

  let updated;
  if (existingIndex !== -1) {
    updated = accounts.map((account, index) =>
      index === existingIndex
        ? { ...account, ...currentAccount, isActive: true }
        : { ...account, isActive: false }
    );
  } else {
    updated = [
      ...accounts.map(a => ({ ...a, isActive: false })),
      { ...currentAccount, isActive: true },
    ];
  }

  await browserAPI.storage.local.set({ soundcloudAccounts: updated });
}

// ─── Account Identity Resolution ─────────────────────────────────────────────

async function detectCurrentAccount() {
  let identity;
  for (let attempt = 0; attempt < 10 && !identity; attempt++) {
    identity = detectFromDOM();
    if (!identity) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!identity) return null;

  const response = await browserAPI.runtime.sendMessage({ method: 'getCurrentCookies' });
  if (!response?.success) return null;

  return {
    ...identity,
    cookie: response.cookie,
    cookies: response.cookies || [response.cookie],
  };
}

function detectFromDOM() {
  const profileLink = document.querySelector(
    '.header__userNavUsernameButton[href], .header__userNavAvatar[href]'
  );
  const avatarSpan = document.querySelector([
    '.header__userNavAvatar span[aria-label*="avatar"]',
    '.header__userNavAvatar[aria-label*="avatar"]',
    '.header__userNavAvatar img',
    'header span[aria-label*="avatar"]',
  ].join(','));

  if (!avatarSpan && !profileLink) return null;

  const bgImage = avatarSpan?.style.backgroundImage || '';
  const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
  const profilePicUrl = avatarSpan?.src || (urlMatch ? urlMatch[1] : null);

  const ariaLabel = avatarSpan?.getAttribute('aria-label');
  const profilePath = profileLink && new URL(profileLink.href).pathname.split('/').filter(Boolean)[0];
  const displayName = ariaLabel?.replace(/[’']s avatar$/i, '').trim();
  const username = profilePath
    ? decodeURIComponent(profilePath)
    : displayName;

  if (!username) return null;

  return { username, displayName: displayName || username, profilePicUrl };
}
