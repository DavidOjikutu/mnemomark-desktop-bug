// Authentication and cloud sync using Firebase REST APIs (data-only).
// Desktop version uses localStorage instead of chrome.storage.

let currentUser = null;
let shareTags = false;
let tagSyncIntervalId = null;
let tokenRefreshTimeout = null;

const AUTH_STORAGE_KEY = 'mnemomark-auth-state';
const TAGS_STORAGE_KEY = 'mnemomark-tags';

function getAuthConfig() {
  const config = window.authConfig || {};
  if (!config.apiKey || !config.projectId) {
    console.warn('Auth not configured. Update auth-config.js with your Firebase project values.');
    return null;
  }
  return config;
}

function getIdToken() {
  return currentUser ? currentUser.idToken : null;
}

function setAuthState(user) {
  currentUser = user;
  shareTags = user ? !!user.shareTags : false;
  window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user, shareTags } }));
}

function clearRefreshTimer() {
  if (tokenRefreshTimeout) {
    clearTimeout(tokenRefreshTimeout);
    tokenRefreshTimeout = null;
  }
}

function scheduleTokenRefresh(expiresAtMs) {
  clearRefreshTimer();
  if (!expiresAtMs) return;
  const refreshInMs = Math.max(expiresAtMs - Date.now() - 60 * 1000, 5 * 1000);
  tokenRefreshTimeout = setTimeout(() => {
    refreshAuthToken().catch(() => {
      // If refresh fails, force sign out so UI reflects it.
      signOutUser();
    });
  }, refreshInMs);
}

function decodeJwtExp(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.exp ? decoded.exp * 1000 : null;
  } catch (error) {
    return null;
  }
}

function storeAuthState(user) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

function loadStoredAuthState() {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    return null;
  }
}

function readLocalTags() {
  try {
    return JSON.parse(localStorage.getItem(TAGS_STORAGE_KEY) || '[]');
  } catch (error) {
    return [];
  }
}

function writeLocalTags(tags) {
  localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags || []));
}

async function refreshAuthToken() {
  const config = getAuthConfig();
  if (!config || !currentUser || !currentUser.refreshToken) return false;

  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(currentUser.refreshToken)}`
  });

  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  const updatedUser = {
    ...currentUser,
    idToken: data.id_token,
    refreshToken: data.refresh_token || currentUser.refreshToken,
    expiresAt: Date.now() + Number(data.expires_in) * 1000
  };

  storeAuthState(updatedUser);
  setAuthState(updatedUser);
  scheduleTokenRefresh(updatedUser.expiresAt);
  return true;
}

async function ensureValidToken() {
  if (!currentUser || !currentUser.idToken) return false;
  const exp = currentUser.expiresAt || decodeJwtExp(currentUser.idToken);
  if (!exp || exp - Date.now() < 60 * 1000) {
    return refreshAuthToken();
  }
  return true;
}

function firestoreBaseUrl() {
  const config = getAuthConfig();
  if (!config) return null;
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents`;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === 'object') {
    const fields = {};
    Object.keys(value).forEach((key) => {
      if (value[key] !== undefined) {
        fields[key] = toFirestoreValue(value[key]);
      }
    });
    return { mapValue: { fields } };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    const values = value.arrayValue.values || [];
    return values.map(fromFirestoreValue);
  }
  if ('mapValue' in value) {
    const fields = value.mapValue.fields || {};
    const obj = {};
    Object.keys(fields).forEach((key) => {
      obj[key] = fromFirestoreValue(fields[key]);
    });
    return obj;
  }
  return null;
}

async function firestoreGetDocument(docPath) {
  const baseUrl = firestoreBaseUrl();
  if (!baseUrl) return null;
  const ok = await ensureValidToken();
  if (!ok) return null;

  const response = await fetch(`${baseUrl}/${docPath}`, {
    headers: { Authorization: `Bearer ${getIdToken()}` }
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function firestorePatchDocument(docPath, fields) {
  const baseUrl = firestoreBaseUrl();
  if (!baseUrl) return false;
  const ok = await ensureValidToken();
  if (!ok) return false;

  const updateMask = Object.keys(fields)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join('&');

  const response = await fetch(`${baseUrl}/${docPath}?${updateMask}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${getIdToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });

  return response.ok;
}

async function firestoreDeleteDocument(docPath) {
  const baseUrl = firestoreBaseUrl();
  if (!baseUrl) return false;
  const ok = await ensureValidToken();
  if (!ok) return false;

  const response = await fetch(`${baseUrl}/${docPath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getIdToken()}` }
  });

  return response.ok;
}

async function initAuth() {
  const stored = loadStoredAuthState();
  if (stored && stored.idToken) {
    setAuthState(stored);
    await ensureValidToken();
    scheduleTokenRefresh(currentUser ? currentUser.expiresAt : null);
    if (currentUser) {
      await loadUserSettings();
      if (!shareTags) {
        const tagsDoc = await firestoreGetDocument(`users/${encodeURIComponent(currentUser.uid)}/data/tags`);
        if (tagsDoc && tagsDoc.fields && tagsDoc.fields.tags) {
          shareTags = true;
          currentUser.shareTags = true;
          storeAuthState(currentUser);
          setAuthState(currentUser);
        }
      }
      if (shareTags) {
        setupTagSyncListener();
      }
    }
  } else {
    setAuthState(null);
  }
  return true;
}

async function signUp(email, password, shareTagsOption) {
  const config = getAuthConfig();
  if (!config) return { success: false, error: 'Auth is not configured.' };

  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error ? data.error.message : 'Sign up failed.',
        raw: JSON.stringify(data)
      };
    }

    const user = {
      uid: data.localId,
      email: data.email,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + Number(data.expiresIn) * 1000,
      shareTags: !!shareTagsOption
    };

    storeAuthState(user);
    setAuthState(user);
    scheduleTokenRefresh(user.expiresAt);

    await firestorePatchDocument(`users/${encodeURIComponent(user.uid)}`, {
      email: toFirestoreValue(user.email),
      shareTags: toFirestoreValue(!!shareTagsOption),
      createdAt: toFirestoreValue(new Date().toISOString())
    });

    if (shareTagsOption) {
      await syncTagsToCloud();
      setupTagSyncListener();
    }

    return { success: true, user };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Sign up failed.',
      raw: String(error)
    };
  }
}

async function signIn(email, password) {
  const config = getAuthConfig();
  if (!config) return { success: false, error: 'Auth is not configured.' };

  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error ? data.error.message : 'Sign in failed.',
        raw: JSON.stringify(data)
      };
    }

    const user = {
      uid: data.localId,
      email: data.email,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + Number(data.expiresIn) * 1000,
      shareTags: false
    };

    storeAuthState(user);
    setAuthState(user);
    scheduleTokenRefresh(user.expiresAt);

    await loadUserSettings();
    if (!shareTags) {
      const tagsDoc = await firestoreGetDocument(`users/${encodeURIComponent(user.uid)}/data/tags`);
      if (tagsDoc && tagsDoc.fields && tagsDoc.fields.tags) {
        shareTags = true;
        currentUser.shareTags = true;
        storeAuthState(currentUser);
        setAuthState(currentUser);
      }
    }
    if (shareTags) {
      await syncTagsFromCloud();
      setupTagSyncListener();
    }

    return { success: true, user };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Sign in failed.',
      raw: String(error)
    };
  }
}

async function signOutUser() {
  clearRefreshTimer();
  if (tagSyncIntervalId) {
    clearInterval(tagSyncIntervalId);
    tagSyncIntervalId = null;
  }
  localStorage.removeItem(AUTH_STORAGE_KEY);
  setAuthState(null);
  localStorage.setItem('mnemomark-auth-sync', String(Date.now()));
  return { success: true };
}

async function deleteAccount() {
  const config = getAuthConfig();
  if (!config || !currentUser || !currentUser.idToken) {
    return { success: false, error: 'Not signed in.' };
  }
  const ok = await ensureValidToken();
  if (!ok) {
    return { success: false, error: 'Session expired. Please sign in again.' };
  }

  // Best-effort cleanup of user data in Firestore.
  await firestoreDeleteDocument(`users/${encodeURIComponent(currentUser.uid)}/data/tags`);
  await firestoreDeleteDocument(`users/${encodeURIComponent(currentUser.uid)}`);

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: currentUser.idToken })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    return {
      success: false,
      error: data.error ? data.error.message : 'Delete account failed.'
    };
  }

  await signOutUser();
  return { success: true };
}

async function sendPasswordResetEmail(email) {
  const config = getAuthConfig();
  if (!config) return { success: false, error: 'Auth is not configured.' };

  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(config.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email })
    });
    const data = await response.json();
    if (!response.ok) {
      return {
        success: false,
        error: data.error ? data.error.message : 'Reset email failed.',
        raw: JSON.stringify(data)
      };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Reset email failed.',
      raw: String(error)
    };
  }
}

async function loadUserSettings() {
  if (!currentUser) return;

  const doc = await firestoreGetDocument(`users/${encodeURIComponent(currentUser.uid)}`);
  if (doc && doc.fields) {
    const settings = fromFirestoreValue({ mapValue: { fields: doc.fields } });
    shareTags = !!settings.shareTags;
    currentUser.shareTags = shareTags;
    storeAuthState(currentUser);
    setAuthState(currentUser);
  }
  if (!shareTags && tagSyncIntervalId) {
    clearInterval(tagSyncIntervalId);
    tagSyncIntervalId = null;
  }
}

async function syncTagsToCloud() {
  if (!currentUser || !shareTags) return;
  const tags = readLocalTags();

  await firestorePatchDocument(`users/${encodeURIComponent(currentUser.uid)}/data/tags`, {
    tags: toFirestoreValue(tags),
    updatedAt: toFirestoreValue(new Date().toISOString())
  });
}

async function syncTagsFromCloud() {
  if (!currentUser || !shareTags) return;
  const doc = await firestoreGetDocument(`users/${encodeURIComponent(currentUser.uid)}/data/tags`);
  if (doc && doc.fields && doc.fields.tags) {
    const tags = fromFirestoreValue(doc.fields.tags) || [];
    writeLocalTags(tags);
    window.dispatchEvent(new CustomEvent('tagsSynced', { detail: { tags } }));
    return { success: true, tags };
  }
  return { success: true, tags: [] };
}

function setupTagSyncListener() {
  if (tagSyncIntervalId) {
    clearInterval(tagSyncIntervalId);
  }
  tagSyncIntervalId = setInterval(() => {
    syncTagsFromCloud().catch(() => {});
  }, 60 * 1000);
}

function getCurrentUser() {
  return currentUser;
}

function isSharingTags() {
  return shareTags;
}

async function reconcileShareTags() {
  if (!currentUser || shareTags) {
    return shareTags;
  }
  const tagsDoc = await firestoreGetDocument(`users/${encodeURIComponent(currentUser.uid)}/data/tags`);
  if (tagsDoc && tagsDoc.fields && tagsDoc.fields.tags) {
    shareTags = true;
    currentUser.shareTags = true;
    storeAuthState(currentUser);
    setAuthState(currentUser);
    await syncTagsFromCloud();
    setupTagSyncListener();
  }
  return shareTags;
}

initAuth();

window.authService = {
  signUp,
  signIn,
  signOut: signOutUser,
  deleteAccount,
  sendPasswordResetEmail,
  getCurrentUser,
  isSharingTags,
  reconcileShareTags,
  syncTagsToCloud,
  syncTagsFromCloud,
  initAuth
};

window.addEventListener('storage', (event) => {
  if (event.key !== AUTH_STORAGE_KEY) return;
  const stored = loadStoredAuthState();
  if (stored && stored.idToken) {
    setAuthState(stored);
  } else {
    setAuthState(null);
  }
});
