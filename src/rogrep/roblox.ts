// Roblox Web API helpers implementing the flow described in info.txt:
// 1. Resolve a username to a user id.
// 2. Fetch that user's avatar headshot (to compare against server players).
// 3. Page through the game's public servers, collecting player tokens.
// 4. Batch-resolve the player tokens to avatar headshots.
// 5. Match the target user's headshot against the servers' headshots.

export interface RobloxUser {
  id: number;
  name: string;
  displayName: string;
  hasVerifiedBadge: boolean;
}

//asasas
export interface GameServer {
  id: string;
  maxPlayers: number;
  playing: number;
  playerTokens: string[];
  fps: number;
  ping: number;
}

export interface ServerMatch {
  server: GameServer;
  /** Headshot url of the matched player within the server. */
  imageUrl: string;
}

const COMMON_HEADERS = {
  accept: '*/*',
  'accept-language': 'en-GB,en;q=0.9',
};

/** How long to wait before retrying after a 429 (Too Many Requests). */
const RETRY_DELAY_MS = 10_000;
/** Maximum number of retries before giving up on a rate-limited request. */
const MAX_RETRIES = 10;

/** Called when a request is rate limited, so callers can surface a message. */
export type OnRateLimit = (info: {
  attempt: number;
  waitMs: number;
}) => void;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Like `fetch`, but when the response is a 429 it waits (respecting the
 * `Retry-After` header when present, otherwise 10 seconds) and retries.
 */
async function fetchWithRetry(
  input: string,
  init: RequestInit,
  onRateLimit?: OnRateLimit,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    const res = await fetch(input, init);
    if (res.status !== 429 || attempt >= MAX_RETRIES) return res;
    attempt += 1;
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.max(retryAfter * 1000, RETRY_DELAY_MS)
        : RETRY_DELAY_MS;
    onRateLimit?.({ attempt, waitMs });
    await delay(waitMs);
  }
}

/**
 * The headshot cdn url embeds a content hash that is stable for a given
 * rendered avatar. We compare on that hash so the target lookup and the batch
 * lookup only need to agree on the render parameters (size/format/filter).
 */
function headshotHash(imageUrl: string): string {
  const match = imageUrl.match(/AvatarHeadshot-([A-Fa-f0-9]+)/);
  return match ? match[1].toUpperCase() : imageUrl;
}

/** Resolve a username to its Roblox user record. Returns null if not found. */
export async function resolveUsername(
  username: string,
  onRateLimit?: OnRateLimit,
): Promise<RobloxUser | null> {
  const res = await fetchWithRetry(
    'https://users.roblox.com/v1/usernames/users',
    {
      headers: { ...COMMON_HEADERS, 'content-type': 'application/json' },
      referrer: 'https://www.roblox.com/',
      body: JSON.stringify({
        usernames: [username],
        excludeBannedUsers: true,
      }),
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
    },
    onRateLimit,
  );
  if (!res.ok) throw new Error(`Username lookup failed (${res.status})`);
  const json = (await res.json()) as { data: RobloxUser[] };
  return json.data?.[0] ?? null;
}

/**
 * Fetch a user's avatar headshot url. `isCircular` is kept false so the render
 * parameters match the batch lookup used for server players.
 */
export async function getUserHeadshot(
  userId: number,
  onRateLimit?: OnRateLimit,
): Promise<string | null> {
  const res = await fetchWithRetry(
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
    {
      headers: COMMON_HEADERS,
      referrer: 'https://www.roblox.com/',
      method: 'GET',
      mode: 'cors',
      credentials: 'include',
    },
    onRateLimit,
  );
  if (!res.ok) throw new Error(`Avatar lookup failed (${res.status})`);
  const json = (await res.json()) as {
    data: { imageUrl: string }[];
  };
  return json.data?.[0]?.imageUrl ?? null;
}

/** Page through every public server of a game. */
export async function getPublicServers(
  placeId: string | number,
  onProgress?: (count: number) => void,
  onRateLimit?: OnRateLimit,
): Promise<GameServer[]> {
  const servers: GameServer[] = [];
  let cursor = '';
  do {
    const res = await fetchWithRetry(
      `https://games.roblox.com/v1/games/${placeId}/servers/Public?limit=100&cursor=${cursor}`,
      {
        headers: COMMON_HEADERS,
        referrer: 'https://www.roblox.com/',
        method: 'GET',
        mode: 'cors',
        credentials: 'include',
      },
      onRateLimit,
    );
    if (!res.ok) throw new Error(`Server list failed (${res.status})`);
    const json = (await res.json()) as {
      nextPageCursor: string | null;
      data: GameServer[];
    };
    servers.push(...(json.data ?? []));
    onProgress?.(servers.length);
    cursor = json.nextPageCursor ?? '';
  } while (cursor);
  return servers;
}

interface BatchItem {
  token: string;
  type: 'AvatarHeadshot';
  size: '150x150';
  requestId: string;
}

interface BatchResult {
  requestId: string;
  imageUrl: string;
  state: string;
}

async function fetchHeadshotBatch(
  items: BatchItem[],
  onRateLimit?: OnRateLimit,
): Promise<BatchResult[]> {
  const res = await fetchWithRetry(
    'https://thumbnails.roblox.com/v1/batch',
    {
      headers: { ...COMMON_HEADERS, 'content-type': 'application/json' },
      referrer: 'https://www.roblox.com/',
      body: JSON.stringify(items),
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
    },
    onRateLimit,
  );
  if (!res.ok) throw new Error(`Batch thumbnail failed (${res.status})`);
  const json = (await res.json()) as { data: BatchResult[] };
  return json.data ?? [];
}

/**
 * Search the given servers for the target user's headshot.
 * Returns the first server whose player list contains a matching headshot.
 */
export async function findUserInServers(
  servers: GameServer[],
  targetImageUrl: string,
  onProgress?: (done: number, total: number) => void,
  onRateLimit?: OnRateLimit,
): Promise<ServerMatch | null> {
  const targetHash = headshotHash(targetImageUrl);

  // Build a unique requestId per token so we can map each result back to the
  // server it belongs to, regardless of response ordering.
  const tokenToServer = new Map<string, GameServer>();
  const items: BatchItem[] = [];
  servers.forEach((server, si) => {
    server.playerTokens.forEach((token, ti) => {
      const requestId = `${si}:${ti}`;
      tokenToServer.set(requestId, server);
      items.push({ token, type: 'AvatarHeadshot', size: '150x150', requestId });
    });
  });

  const CHUNK = 100;
  const total = items.length;
  let done = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const results = await fetchHeadshotBatch(chunk, onRateLimit);
    for (const result of results) {
      if (!result.imageUrl) continue;
      if (headshotHash(result.imageUrl) === targetHash) {
        const server = tokenToServer.get(result.requestId);
        if (server) return { server, imageUrl: result.imageUrl };
      }
    }
    done += chunk.length;
    onProgress?.(done, total);
  }
  return null;
}

/** Extract the numeric place id from a /games/<id>/... url. */
export function getPlaceIdFromUrl(url: string): string | null {
  const match = url.match(/\/games\/(\d+)/);
  return match ? match[1] : null;
}
