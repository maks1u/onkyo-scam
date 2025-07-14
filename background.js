import {browserAPI} from './config.js';

browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.method) {
        case 'getCurrentCookies': {
          try {
            const cookies = await browserAPI.cookies.getAll({
              url: 'https://api-auth.soundcloud.com'
            });

            const sessionCookie = cookies.find(cookie => cookie.name === '_soundcloud_session');

            if (sessionCookie) {
              return sendResponse({
                success: true,
                cookie: sessionCookie
              });
            } else {
              return sendResponse({
                success: false,
                error: 'Session cookie not found'
              });
            }
          } catch (error) {
            console.error('Error getting cookies:', error);
            return sendResponse({
              success: false,
              error: error.message
            });
          }
        }

        case 'switchAccount': {
          try {
            const { account } = request;

            if (!account || !account.cookie) {
              return sendResponse({
                success: false,
                error: 'Invalid account data'
              });
            }

            // Set the session cookie for the account
            const cookieDetails = {
              url: 'https://api-auth.soundcloud.com',
              name: '_soundcloud_session',
              value: account.cookie.value,
              expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
            };

            await removeAllCookies()
              .then(async () => {
                await browserAPI.cookies.set(cookieDetails);
              })

            const tabs = await browserAPI.tabs.query({
              url: '*://*.soundcloud.com/*'
            });

            for (const tab of tabs) {
              browserAPI.tabs.reload(tab.id);
            }

            console.log('Account switched successfully:', account.username);
            return sendResponse({
              success: true,
              message: `Switched to account: ${account.username}`
            });

          } catch (error) {
            console.error('Error switching account:', error);
            return sendResponse({
              success: false,
              error: error.message
            });
          }
        }

        case 'removeAccount': {
          try {
            const {account, index} = request;

            if (!account) {
              return sendResponse({
                success: false,
                error: 'Invalid account data'
              });
            }

            const result = await browserAPI.storage.local.get('soundcloudAccounts');
            const accounts = result.soundcloudAccounts || [];

            if (index >= 0 && index < accounts.length) {
              accounts.splice(index, 1);

              await browserAPI.storage.local.set({soundcloudAccounts: accounts});

              // Get current cookies
              const cookies = await browserAPI.cookies.getAll({
                url: 'https://api-auth.soundcloud.com'
              });

              const sessionCookie = cookies.find(cookie => cookie.name === '_soundcloud_session');

              // Check if the removed account is the active one
              if (sessionCookie && account.cookie && account.cookie.value === sessionCookie.value) {
                await removeAllCookies();
              }

              console.log('Account removed successfully:', account.username);
              return sendResponse({
                success: true,
                message: `Removed account: ${account.username}`
              });
            } else {
              return sendResponse({
                success: false,
                error: 'Invalid account index'
              });
            }

          } catch (error) {
            console.error('Error removing account:', error);
            return sendResponse({
              success: false,
              error: error.message
            });
          }
        }

        case 'getActiveAccount': {
          try {
            // Get current cookies
            const cookies = await browserAPI.cookies.getAll({
              url: 'https://api-auth.soundcloud.com'
            });

            const sessionCookie = cookies.find(cookie => cookie.name === '_soundcloud_session');

            if (!sessionCookie) {
              return sendResponse({
                success: true,
                activeAccount: null
              });
            }

            // Get all accounts
            const result = await browserAPI.storage.local.get('soundcloudAccounts');
            const accounts = result.soundcloudAccounts || [];

            // Find account with matching cookie
            const activeAccount = accounts.find(account => 
              account.cookie && account.cookie.value === sessionCookie.value
            );

            return sendResponse({
              success: true,
              activeAccount: activeAccount || null
            });
          } catch (error) {
            console.error('Error getting active account:', error);
            return sendResponse({
              success: false,
              error: error.message
            });
          }
        }

        case 'clearAllCookies': {
          try {
            // Remove all SoundCloud cookies
            await removeAllCookies();

            // Clear storage
            await browserAPI.storage.local.clear();

            console.log('All cookies and storage cleared');
            return sendResponse({
              success: true,
              message: 'All cookies and storage cleared'
            });

          } catch (error) {
            console.error('Error clearing cookies:', error);
            return sendResponse({
              success: false,
              error: error.message
            });
          }
        }

        case 'clearCurrentCookies': {
          try {
            await removeAllCookies();

            return sendResponse({
              success: true,
              message: 'All cookies and storage cleared'
            });

          } catch (error) {
            return sendResponse({
              success: false,
              error: error.message
            });
          }
        }

        default:
          console.warn('Unknown method:', request.method);
          sendResponse({
            success: false,
            error: 'Unknown method'
          });
      }
    } catch (err) {
      console.error('Message handling error:', err);
      sendResponse({
        success: false,
        error: err.message
      });
    }
  })();

  return true; // Keep the message channel open for async response
});

async function removeAllCookies() {
  const cookies = await browserAPI.cookies.getAll({
    url: 'https://api-auth.soundcloud.com'
  });

  for (const cookie of cookies) {
    if (cookie.name.includes('session') || cookie.name.includes('oauth')) {
      await browserAPI.cookies.remove({
        url: 'https://api-auth.soundcloud.com',
        name: cookie.name
      });
    }
  }

  const soundCloudCookies = await browserAPI.cookies.getAll({
    url: 'https://soundcloud.com'
  });

  for (const cookie of soundCloudCookies) {
    if (cookie.name.includes('session') || cookie.name.includes('oauth')) {
      await browserAPI.cookies.remove({
        url: 'https://soundcloud.com',
        name: cookie.name
      });
    }
  }
}
