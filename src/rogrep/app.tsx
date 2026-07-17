import { createSignal, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { getPanel, showToast } from '@violentmonkey/ui';
// global CSS
import globalCss from './style.css';
// CSS modules
import styles, { stylesheet } from './style.module.css';
import {
  resolveUsername,
  getUserHeadshot,
  getPublicServers,
  findUserInServers,
  getPlaceIdFromUrl,
  type RobloxUser,
  type ServerMatch,
} from './roblox';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; message: string }
  | { kind: 'found'; user: RobloxUser; avatar: string; match: ServerMatch }
  | { kind: 'not-found'; user: RobloxUser; avatar: string }
  | { kind: 'error'; message: string };

function Rogrep() {
  const [username, setUsername] = createSignal('');
  const [status, setStatus] = createSignal<Status>({ kind: 'idle' });

  const busy = () => status().kind === 'loading';

  // Attach a direct (non-delegated) mousedown listener so it fires during
  // native bubbling and stops the panel's drag handler from calling
  // preventDefault, which would otherwise block focusing the input.
  const stopDrag = (el: HTMLElement) => {
    el.addEventListener('mousedown', (e) => e.stopPropagation());
  };

  const search = async () => {
    const name = username().trim();
    if (!name) {
      showToast('Enter a username first', { theme: 'dark' });
      return;
    }
    const placeId = getPlaceIdFromUrl(location.href);
    if (!placeId) {
      setStatus({ kind: 'error', message: 'Could not detect a game id in the URL.' });
      return;
    }

    // Shows a live countdown while a rate-limited request waits to retry.
    let countdownTimer: ReturnType<typeof setInterval> | undefined;
    const clearCountdown = () => {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = undefined;
      }
    };
    const onRateLimit = ({ waitMs }: { attempt: number; waitMs: number }) => {
      clearCountdown();
      let remaining = Math.ceil(waitMs / 1000);
      const show = () =>
        setStatus({
          kind: 'loading',
          message: `Rate limited (429) — retrying in ${remaining}s…`,
        });
      show();
      countdownTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearCountdown();
          return;
        }
        show();
      }, 1000);
    };
    // Wrap progress callbacks so they cancel any active countdown.
    const progress = (status: Status) => {
      clearCountdown();
      setStatus(status);
    };

    try {
      progress({ kind: 'loading', message: `Looking up "${name}"…` });
      const user = await resolveUsername(name, onRateLimit);
      if (!user) {
        clearCountdown();
        setStatus({ kind: 'error', message: `No user found named "${name}".` });
        return;
      }

      progress({ kind: 'loading', message: 'Fetching avatar…' });
      const avatar = await getUserHeadshot(user.id, onRateLimit);
      if (!avatar) {
        clearCountdown();
        setStatus({ kind: 'error', message: 'Could not load the user avatar.' });
        return;
      }

      progress({ kind: 'loading', message: 'Loading servers…' });
      const servers = await getPublicServers(
        placeId,
        (count) => {
          progress({ kind: 'loading', message: `Loading servers… (${count})` });
        },
        onRateLimit,
      );

      progress({
        kind: 'loading',
        message: `Scanning ${servers.length} servers…`,
      });
      const match = await findUserInServers(
        servers,
        avatar,
        (done, total) => {
          progress({
            kind: 'loading',
            message: `Scanning players… (${done}/${total})`,
          });
        },
        onRateLimit,
      );

      clearCountdown();
      if (match) {
        setStatus({ kind: 'found', user, avatar, match });
      } else {
        setStatus({ kind: 'not-found', user, avatar });
      }
    } catch (err) {
      clearCountdown();
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const joinUrl = (serverId: string) => {
    const placeId = getPlaceIdFromUrl(location.href);
    return `https://www.roblox.com/games/start?placeId=${placeId}&gameInstanceId=${serverId}`;
  };

  return (
    <div class={styles.root}>
      <div class={styles.header}>rogrep — find a user in a server</div>

      <form
        ref={stopDrag}
        class={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input
          class={styles.input}
          type="text"
          placeholder="Roblox username"
          value={username()}
          disabled={busy()}
          onInput={(e) => setUsername(e.currentTarget.value)}
        />
        <button class={styles.button} type="submit" disabled={busy()}>
          {busy() ? 'Searching…' : 'Search'}
        </button>
      </form>

      <div ref={stopDrag} class={styles.result}>
        <Show when={status().kind === 'loading'}>
          <div class={styles.loading}>
            {(status() as { message: string }).message}
          </div>
        </Show>

        <Show when={status().kind === 'error'}>
          <div class={styles.error}>
            {(status() as { message: string }).message}
          </div>
        </Show>

        <Show when={status().kind === 'found'}>
          {(() => {
            const s = status() as Extract<Status, { kind: 'found' }>;
            return (
              <div class={styles.card}>
                <img class={styles.avatar} src={s.avatar} alt="" />
                <div class={styles.info}>
                  <div class={styles.name}>
                    {s.user.displayName} (@{s.user.name})
                  </div>
                  <div class={styles.found}>Found in a server ✓</div>
                  <div class={styles.meta}>
                    Players: {s.match.server.playing}/{s.match.server.maxPlayers}{' '}
                    · Ping: {Math.round(s.match.server.ping)}ms
                  </div>
                  <div class={styles.serverId}>{s.match.server.id}</div>
                  <a
                    class={styles.join}
                    href={joinUrl(s.match.server.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Join server
                  </a>
                </div>
              </div>
            );
          })()}
        </Show>

        <Show when={status().kind === 'not-found'}>
          {(() => {
            const s = status() as Extract<Status, { kind: 'not-found' }>;
            return (
              <div class={styles.card}>
                <img class={styles.avatar} src={s.avatar} alt="" />
                <div class={styles.info}>
                  <div class={styles.name}>
                    {s.user.displayName} (@{s.user.name})
                  </div>
                  <div class={styles.notFound}>
                    Not found in any public server.
                  </div>
                </div>
              </div>
            );
          })()}
        </Show>
      </div>
    </div>
  );
}

// Inject CSS
GM_addStyle(globalCss);

const panel = getPanel({
  theme: 'dark',
  style: stylesheet,
});
Object.assign(panel.wrapper.style, {
  top: '80px',
  right: '20px',
  zIndex: '99999',
});
panel.setMovable(true);

// A small launcher button to toggle the panel.
const launcher = document.createElement('button');
launcher.textContent = 'rogrep';
Object.assign(launcher.style, {
  position: 'fixed',
  bottom: '20px',
  right: '20px',
  zIndex: '99999',
  padding: '10px 16px',
  borderRadius: '9999px',
  border: 'none',
  background: '#335fff',
  color: '#fff',
  fontWeight: '600',
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
});

let visible = false;
const toggle = () => {
  visible = !visible;
  if (visible) panel.show();
  else panel.hide();
};
launcher.addEventListener('click', toggle);
document.body.appendChild(launcher);

render(Rogrep, panel.body);
