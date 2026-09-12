const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function loadBackground(currentCookies = [], tokenResponse = {ok: true, token: 'migrated-oauth-token'}) {
  let listener;
  const setCalls = [];
  const removeCalls = [];
  const reloadCalls = [];
  const fetchCalls = [];
  const chrome = {
    runtime: {onMessage: {addListener: handler => { listener = handler; }}},
    cookies: {
      getAll: async () => currentCookies,
      set: async details => {
        setCalls.push(details);
        return details;
      },
      remove: async details => {
        removeCalls.push(details);
        return details;
      },
    },
    tabs: {
      query: async () => [{id: 7}],
      reload: async id => { reloadCalls.push(id); },
    },
    storage: {local: {get: async () => ({soundcloudAccounts: []}), clear: async () => {}}},
  };

  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  const fetch = async (...args) => {
    fetchCalls.push(args);
    return {
      ok: tokenResponse.ok,
      json: async () => ({session: {access_token: tokenResponse.token}}),
    };
  };
  new Function('chrome', 'fetch', source)(chrome, fetch);

  const dispatch = request => new Promise(resolve => listener(request, {}, resolve));
  return {dispatch, setCalls, removeCalls, reloadCalls, fetchCalls};
}

const oauthCookie = {
  name: 'oauth_token',
  value: 'oauth-account-b',
  domain: '.soundcloud.com',
  path: '/',
  hostOnly: false,
  secure: true,
  httpOnly: true,
  sameSite: 'no_restriction',
  storeId: '0',
};
const sessionCookie = {
  name: '_soundcloud_session',
  value: 'session-account-b',
  domain: 'api-auth.soundcloud.com',
  path: '/connect',
  hostOnly: true,
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
  storeId: '0',
};

test('captures every current SoundCloud authentication cookie', async () => {
  const sessionAuthCookie = {
    ...oauthCookie,
    name: '_session_auth_key',
    value: 'auth-key-account-b',
  };
  const {dispatch} = loadBackground([oauthCookie, sessionCookie, sessionAuthCookie, {name: 'Sclocale'}]);

  const response = await dispatch({method: 'getCurrentCookies'});

  assert.equal(response.success, true);
  assert.equal(response.cookie.name, 'oauth_token');
  assert.deepEqual(response.cookies.map(({name}) => name).sort(), [
    '_session_auth_key',
    '_soundcloud_session',
    'oauth_token',
  ]);
});

test('switching restores modern cookies with their original scope and attributes', async () => {
  const {dispatch, setCalls, removeCalls, reloadCalls} = loadBackground([
    {...oauthCookie, value: 'oauth-account-a'},
    {name: 'Sclocale', value: 'en', domain: '.soundcloud.com', path: '/'},
  ]);

  const response = await dispatch({
    method: 'switchAccount',
    account: {username: 'account-b', cookies: [oauthCookie, sessionCookie]},
  });

  assert.equal(response.success, true);
  assert.deepEqual(setCalls.map(({name}) => name), ['oauth_token', '_soundcloud_session']);
  assert.equal(setCalls[0].domain, '.soundcloud.com');
  assert.equal(setCalls[0].secure, true);
  assert.equal(setCalls[0].httpOnly, true);
  assert.equal(setCalls[0].sameSite, 'no_restriction');
  assert.equal(setCalls[1].domain, undefined);
  assert.equal(setCalls[1].url, 'https://api-auth.soundcloud.com/connect');
  assert.deepEqual(removeCalls.map(({name}) => name), ['oauth_token']);
  assert.deepEqual(reloadCalls, [7]);
});

test('legacy single-cookie accounts are migrated to the current OAuth cookie', async () => {
  const {dispatch, setCalls, fetchCalls} = loadBackground([]);

  const response = await dispatch({
    method: 'switchAccount',
    account: {username: 'legacy-account', cookie: sessionCookie},
  });

  assert.equal(response.success, true);
  assert.deepEqual(setCalls.map(({name}) => name), ['_soundcloud_session', 'oauth_token']);
  assert.equal(setCalls[1].value, 'migrated-oauth-token');
  assert.equal(fetchCalls.length, 1);
});

test('invalid stored cookies are rejected before the current login is removed', async () => {
  const {dispatch, removeCalls} = loadBackground([oauthCookie]);

  const response = await dispatch({
    method: 'switchAccount',
    account: {username: 'bad-account', cookie: {name: 'other_cookie', value: 'x'}},
  });

  assert.equal(response.success, false);
  assert.deepEqual(removeCalls, []);
});

test('failed legacy migration restores the login that was active before switching', async () => {
  const currentCookie = {...oauthCookie, value: 'oauth-account-a'};
  const {dispatch, setCalls, reloadCalls} = loadBackground([currentCookie], {ok: false});

  const originalConsoleError = console.error;
  console.error = () => {};
  let response;
  try {
    response = await dispatch({
      method: 'switchAccount',
      account: {username: 'expired-account', cookie: sessionCookie},
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.success, false);
  assert.match(response.error, /expired/);
  assert.deepEqual(setCalls.map(({value}) => value), ['session-account-b', 'oauth-account-a']);
  assert.deepEqual(reloadCalls, []);
});
