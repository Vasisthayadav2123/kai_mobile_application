/**
 * Server configuration for the Flask backend.
 * 
 * SECURITY: Challenge-Response Key Table Authentication
 * ─────────────────────────────────────────────────────
 * 1. Mobile app calls /api/handshake/init → server returns a random key_number + challenge_id
 * 2. Mobile app looks up the matching secret from KAI_KEYS and sends it back via /api/handshake/verify
 * 3. Server validates and issues a session_token (valid 1 hour)
 * 4. All subsequent requests include the token in the Authorization header
 * 
 * To set server IP without rebuilding:
 *   Option 1: Automatically detected from Metro bundler host IP
 *   Option 2: Set EXPO_PUBLIC_KAI_SERVER_IP env var before running expo
 *   Option 3: Update the FALLBACK_IP below
 */
import Constants from 'expo-constants';

// Fallback IP — used if no Metro IP or env var is set (Tailscale IP)
const FALLBACK_IP = '100.95.86.123';

// Automatically detect the IP of the machine running Metro
const METRO_IP = (() => {
  try {
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      const ip = hostUri.split(':')[0];
      if (ip && !ip.startsWith('localhost') && !ip.startsWith('127.0.0.1')) {
        return ip;
      }
    }
  } catch (e) {
    console.warn('[KAI CONFIG] Failed to parse Metro hostUri:', e);
  }
  return '';
})();

// Read from Expo env if available (set EXPO_PUBLIC_KAI_SERVER_IP before `npx expo start`)
const ENV_IP = (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_KAI_SERVER_IP) || '';

// Resolved server IP — env > metro auto-detect > fallback
let _serverIp = ENV_IP || METRO_IP || FALLBACK_IP;

console.log(`[KAI CONFIG] Resolved Server IP: ${_serverIp} (Metro Auto-detected: ${METRO_IP || 'None'}, Env: ${ENV_IP || 'None'}, Fallback: ${FALLBACK_IP})`);

// Flask control API (media buttons)
export const SERVER_PORT = '5000';

// WebRTC signaling server (screen sharing)
export const WEBRTC_PORT = '8080';


// ── Shared Key Table (must match server's KAI_KEYS) ──────────────
const KAI_KEYS: Record<string, string> = {
  "1": "kai-sec-alpha-87219",
  "2": "kai-sec-beta-39281",
  "3": "kai-sec-gamma-10482",
  "4": "kai-sec-delta-58291",
  "5": "kai-sec-epsilon-74920",
};


// ── Session State ────────────────────────────────────────────────
let _sessionToken: string | null = null;
let _handshakePromise: Promise<string> | null = null;

export function getSessionToken(): string | null {
  return _sessionToken;
}

export function setSessionToken(token: string | null) {
  _sessionToken = token;
}


/**
 * Override the server IP at runtime (e.g. from a settings screen).
 */
export function setServerIp(ip: string) {
  _serverIp = ip;
  // Reset session since we're targeting a new server
  _sessionToken = null;
}

/**
 * Get the current server IP.
 */
export function getServerIp(): string {
  return _serverIp;
}

// Dynamic getters so URL always reflects the latest IP
export const getServerUrl = () => `https://${_serverIp}:${SERVER_PORT}`;
export const getWebRtcUrl = () => `https://${_serverIp}:${WEBRTC_PORT}`;

// ── Legacy static exports (kept for backward compat) ─────────────
export const SERVER_IP = _serverIp;
export const SERVER_URL = `https://${_serverIp}:${SERVER_PORT}`;
export const WEBRTC_URL = `https://${_serverIp}:${WEBRTC_PORT}`;


// ── Helper: Fetch with Timeout ───────────────────────────────────
async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 15000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}


// ── Global Handshake Listener System ─────────────────────────────

export type HandshakeStep =
  | 'locating'
  | 'server_found'
  | 'challenge_received'
  | 'key_lookup'
  | 'bullet_fired'
  | 'verifying'
  | 'connected'
  | 'failed';

export type HandshakeListener = (event: { step: HandshakeStep; data?: any }) => void;

const _handshakeListeners = new Set<HandshakeListener>();

/**
 * Register a global listener to track the current handshake state.
 */
export function addHandshakeListener(listener: HandshakeListener): () => void {
  _handshakeListeners.add(listener);
  return () => {
    _handshakeListeners.delete(listener);
  };
}

function emitHandshakeStep(step: HandshakeStep, data?: any) {
  _handshakeListeners.forEach(listener => {
    try {
      listener({ step, data });
    } catch (e) {
      console.warn('[KAI AUTH] Error in handshake listener:', e);
    }
  });
}


// ── Challenge-Response Handshake ─────────────────────────────────

/**
 * Perform the challenge-response handshake to get a session token.
 * Deduplicates concurrent handshake calls and notifies global listeners.
 */
export async function performHandshake(): Promise<string> {
  // If there's already an active handshake in progress, return its promise to avoid duplicate network calls
  if (_handshakePromise) {
    console.log('[KAI AUTH] Handshake already in progress, awaiting active request...');
    return _handshakePromise;
  }

  const baseUrl = getServerUrl();

  _handshakePromise = (async () => {
    const maxRetries = 3;
    const baseDelay = 2000; // start with 2s delay
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        emitHandshakeStep('locating');

        // Step 1: Request challenge from server
        const initRes = await fetchWithTimeout(`${baseUrl}/api/handshake/init`, {
          method: 'POST',
          timeout: 15000, // 15 seconds timeout to locate server
        });

        if (!initRes.ok) {
          throw new Error(`Handshake init failed: ${initRes.status}`);
        }

        const { challenge_id, key_number } = await initRes.json();

        emitHandshakeStep('server_found');
        await new Promise(r => setTimeout(r, 600)); // Short delay to appreciate "Server Online"

        emitHandshakeStep('challenge_received', { key_number });
        await new Promise(r => setTimeout(r, 800)); // Delay for bullet traveling down

        // Step 2: Look up the secret for the requested key number
        emitHandshakeStep('key_lookup', { key_number });
        const keyValue = KAI_KEYS[key_number];
        if (!keyValue) {
          throw new Error(`No key found for key number: ${key_number}`);
        }
        await new Promise(r => setTimeout(r, 800)); // Appreciation delay

        emitHandshakeStep('bullet_fired');
        await new Promise(r => setTimeout(r, 600)); // Bullet flying up

        emitHandshakeStep('verifying');

        // Step 3: Send the answer back to the server
        const verifyRes = await fetchWithTimeout(`${baseUrl}/api/handshake/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challenge_id,
            key_number,
            key: keyValue,
          }),
          timeout: 15000,
        });

        if (!verifyRes.ok) {
          const err = await verifyRes.json().catch(() => ({}));
          throw new Error(`Handshake verify failed: ${err.error || verifyRes.status}`);
        }

        const { session_token } = await verifyRes.json();
        _sessionToken = session_token;

        emitHandshakeStep('connected');
        console.log('[KAI AUTH] Handshake successful, session established.');
        return session_token;
      } catch (error) {
        attempt++;
        if (attempt <= maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.warn(`[KAI AUTH] Handshake attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}. Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          emitHandshakeStep('failed', { error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      }
    }
    throw new Error('Handshake failed after maximum retries');
  })();

  try {
    const token = await _handshakePromise;
    return token;
  } finally {
    _handshakePromise = null;
  }
}


// ── Authenticated Fetch Wrapper ──────────────────────────────────

/**
 * Wrapper around fetch() that:
 *   1. Auto-performs handshake if no session token exists
 *   2. Attaches Bearer token to every request
 *   3. Auto-retries handshake once on 401 (expired/invalid session)
 */
export async function fetchWithAuth(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  // Perform handshake if we don't have a session yet
  if (!_sessionToken) {
    try {
      await performHandshake();
    } catch (err) {
      console.warn('[KAI AUTH] Initial handshake failed:', err);
    }
  }

  const withAuth = (opts: RequestInit): RequestInit => {
    const headers = new Headers(opts.headers || {});
    if (_sessionToken) {
      headers.set('Authorization', `Bearer ${_sessionToken}`);
    }
    return { ...opts, headers };
  };

  const { timeout = 15000, ...fetchOptions } = options;
  let response = await fetchWithTimeout(url, { ...withAuth(fetchOptions), timeout });

  // If 401, session may have expired — retry handshake once
  if (response.status === 401) {
    try {
      console.log('[KAI AUTH] Session expired, re-authenticating...');
      await performHandshake();
      response = await fetchWithTimeout(url, { ...withAuth(fetchOptions), timeout });
    } catch (err) {
      console.warn('[KAI AUTH] Re-handshake failed:', err);
    }
  }

  return response;
}
