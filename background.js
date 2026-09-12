const browserAPI = typeof chrome !== 'undefined' ? chrome : browser;

const AUTH_COOKIE_NAMES = new Set(['oauth_token', '_soundcloud_session', '_session_auth_key']);
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.method) {
        case 'getCurrentCookies': {
          const cookies = await getAuthCookies();
          const cookie = cookies.find(({name}) => name === 'oauth_token') || cookies[0];

          sendResponse(cookie
            ? {success: true, cookie, cookies}
            : {success: false, error: 'Authentication cookie not found'});
          break;
        }

        case 'switchAccount': {
          const cookies = getSavedAuthCookies(request.account);
          if (cookies.length === 0) {
            sendResponse({success: false, error: 'Invalid account data'});
            break;
          }

          const cookieDetails = cookies.map(toCookieSetDetails);
          const previousCookies = await getAuthCookies();
          await removeAllCookies();
          try {
            await setCookies(cookieDetails);
            if (!cookies.some(({name}) => name === 'oauth_token')) {
              await restoreOAuthToken();
            }
          } catch (error) {
            await removeAllCookies();
            await setCookies(previousCookies.map(toCookieSetDetails));
            throw error;
          }

          await markAccountActive(cookies);

          const soundcloudTabs = await browserAPI.tabs.query({url: 'https://soundcloud.com/*'});
          await Promise.all(soundcloudTabs.map(({id}) => browserAPI.tabs.reload(id)));

          const [activeTab] = await browserAPI.tabs.query({active: true, lastFocusedWindow: true});
          if (!isSoundCloudUrl(activeTab?.url)) {
            await browserAPI.tabs.create({url: 'https://soundcloud.com/'});
          }

          sendResponse({
            success: true,
            message: `Switched to account: ${request.account.username}`,
          });
          break;
        }

        case 'getActiveAccount': {
          const currentCookies = await getAuthCookies();
          const {soundcloudAccounts: accounts = []} = await browserAPI.storage.local.get('soundcloudAccounts');
          const activeAccount = accounts.find(account =>
            getSavedAuthCookies(account).some(saved =>
              currentCookies.some(current => current.name === saved.name && current.value === saved.value)
            )
          );

          sendResponse({success: true, activeAccount: activeAccount || null});
          break;
        }

        case 'clearAllCookies':
          await removeAllCookies();
          await browserAPI.storage.local.clear();
          sendResponse({success: true, message: 'All cookies and storage cleared'});
          break;

        case 'clearCurrentCookies':
          await removeAllCookies();
          sendResponse({success: true, message: 'Authentication cookies cleared'});
          break;

        default:
          sendResponse({success: false, error: 'Unknown method'});
      }
    } catch (error) {
      console.error('Message handling error:', error);
      sendResponse({success: false, error: error.message});
    }
  })();

  return true;
});

async function getAuthCookies() {
  const cookies = await browserAPI.cookies.getAll({domain: 'soundcloud.com'});
  return cookies.filter(({name}) => AUTH_COOKIE_NAMES.has(name));
}

function getSavedAuthCookies(account) {
  const cookies = account?.cookies?.length ? account.cookies : [account?.cookie];
  return cookies.filter(cookie =>
    cookie && AUTH_COOKIE_NAMES.has(cookie.name) && typeof cookie.value === 'string' && cookie.value.length > 0
  );
}

function toCookieSetDetails(cookie) {
  const details = {
    url: getCookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    path: cookie.path || '/',
    secure: cookie.sameSite === 'no_restriction' ? true : cookie.secure !== false,
    httpOnly: Boolean(cookie.httpOnly),
    expirationDate: Math.max(
      cookie.expirationDate || 0,
      Math.floor(Date.now() / 1000) + ONE_YEAR_IN_SECONDS
    ),
  };

  if (!cookie.hostOnly && cookie.domain) details.domain = cookie.domain;
  if (cookie.sameSite) details.sameSite = cookie.sameSite;
  if (cookie.storeId) details.storeId = cookie.storeId;
  if (cookie.partitionKey) details.partitionKey = cookie.partitionKey;

  return details;
}

async function setCookies(cookieDetails) {
  for (const details of cookieDetails) {
    const restored = await browserAPI.cookies.set(details);
    if (!restored) throw new Error(`Could not restore ${details.name}`);
  }
}

async function restoreOAuthToken() {
  const response = await fetch('https://api-auth.soundcloud.com/connect/session/token', {
    method: 'POST',
    credentials: 'include',
    headers: {'Content-Type': 'application/json'},
    body: 'null',
  });
  const accessToken = response.ok && (await response.json())?.session?.access_token;
  if (!accessToken) throw new Error('Saved session expired; add this account again');

  await setCookies([{
    url: 'https://soundcloud.com/',
    name: 'oauth_token',
    value: accessToken,
    secure: true,
    expirationDate: Math.floor(Date.now() / 1000) + ONE_YEAR_IN_SECONDS,
  }]);
}

function getCookieUrl(cookie) {
  const domain = (cookie.domain || (
    cookie.name === '_soundcloud_session' ? 'api-auth.soundcloud.com' : 'soundcloud.com'
  )).replace(/^\./, '');
  if (domain !== 'soundcloud.com' && domain !== 'api-auth.soundcloud.com') {
    throw new Error(`Unsupported cookie domain: ${domain}`);
  }
  return `https://${domain}${cookie.path || '/'}`;
}

function isSoundCloudUrl(url) {
  if (!url) return false;

  try {
    const {protocol, hostname} = new URL(url);
    return protocol === 'https:' && (hostname === 'soundcloud.com' || hostname.endsWith('.soundcloud.com'));
  } catch {
    return false;
  }
}

async function markAccountActive(selectedCookies) {
  const {soundcloudAccounts: accounts = []} = await browserAPI.storage.local.get('soundcloudAccounts');
  const updatedAccounts = accounts.map(account => ({
    ...account,
    isActive: getSavedAuthCookies(account).some(saved =>
      selectedCookies.some(selected => selected.name === saved.name && selected.value === saved.value)
    ),
  }));

  await browserAPI.storage.local.set({soundcloudAccounts: updatedAccounts});
}

async function removeAllCookies() {
  const cookies = await getAuthCookies();

  await Promise.all(cookies.map(cookie => {
    const details = {
      url: getCookieUrl(cookie),
      name: cookie.name,
    };
    if (cookie.storeId) details.storeId = cookie.storeId;
    if (cookie.partitionKey) details.partitionKey = cookie.partitionKey;
    return browserAPI.cookies.remove(details);
  }));
}
