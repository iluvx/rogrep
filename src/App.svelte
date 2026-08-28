<script lang="ts">
  import {
    findUserInServers,
    getPlaceIdFromUrl,
    getPublicServers,
    getUserHeadshot,
    resolveUsername,
    type RobloxUser,
    type ServerMatch,
  } from "./roblox.ts";
  import { showToast } from "./vm.ts";

  type Status =
    | { kind: "idle" }
    | { kind: "loading"; message: string }
    | { kind: "found"; user: RobloxUser; avatar: string; match: ServerMatch }
    | { kind: "not-found"; user: RobloxUser; avatar: string }
    | { kind: "error"; message: string };

  let username = $state("");
  let status = $state<Status>({ kind: "idle" });
  let formEl = $state<HTMLFormElement | undefined>();
  let resultEl = $state<HTMLDivElement | undefined>();

  const busy = $derived(status.kind === "loading");

  // Attach a direct (non-delegated) mousedown listener so it fires during
  // native bubbling and stops the panel's drag handler from calling
  // preventDefault, which would otherwise block focusing the input.
  function stopDrag(event: MouseEvent) {
    event.stopPropagation();
  }

  $effect(() => {
    const form = formEl;
    const result = resultEl;
    if (!form || !result) return;
    form.addEventListener("mousedown", stopDrag);
    result.addEventListener("mousedown", stopDrag);
    return () => {
      form.removeEventListener("mousedown", stopDrag);
      result.removeEventListener("mousedown", stopDrag);
    };
  });

  function joinUrl(serverId: string) {
    const placeId = getPlaceIdFromUrl(location.href);
    return `https://www.roblox.com/games/start?placeId=${placeId}&gameInstanceId=${serverId}`;
  }

  async function search() {
    const name = username.trim();
    if (!name) {
      showToast("Enter a username first", { theme: "dark" });
      return;
    }
    const placeId = getPlaceIdFromUrl(location.href);
    if (!placeId) {
      status = { kind: "error", message: "Could not detect a game id in the URL." };
      return;
    }

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
      const show = () => {
        status = {
          kind: "loading",
          message: `Rate limited (429) — retrying in ${remaining}s…`,
        };
      };
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
    const progress = (next: Status) => {
      clearCountdown();
      status = next;
    };

    try {
      progress({ kind: "loading", message: `Looking up "${name}"…` });
      const user = await resolveUsername(name, onRateLimit);
      if (!user) {
        clearCountdown();
        status = { kind: "error", message: `No user found named "${name}".` };
        return;
      }

      progress({ kind: "loading", message: "Fetching avatar…" });
      const avatar = await getUserHeadshot(user.id, onRateLimit);
      if (!avatar) {
        clearCountdown();
        status = { kind: "error", message: "Could not load the user avatar." };
        return;
      }

      progress({ kind: "loading", message: "Loading servers…" });
      const servers = await getPublicServers(
        placeId,
        (count) => {
          progress({ kind: "loading", message: `Loading servers… (${count})` });
        },
        onRateLimit,
      );

      progress({
        kind: "loading",
        message: `Scanning ${servers.length} servers…`,
      });
      const match = await findUserInServers(
        servers,
        avatar,
        (done, total) => {
          progress({
            kind: "loading",
            message: `Scanning players… (${done}/${total})`,
          });
        },
        onRateLimit,
      );

      clearCountdown();
      if (match) {
        status = { kind: "found", user, avatar, match };
      } else {
        status = { kind: "not-found", user, avatar };
      }
    } catch (err) {
      clearCountdown();
      status = {
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
</script>

<div class="root">
  <div class="header">rogrep — find a user in a server</div>

  <form
    bind:this={formEl}
    class="form"
    onsubmit={(event) => {
      event.preventDefault();
      void search();
    }}
  >
    <input
      class="input"
      type="text"
      placeholder="Roblox username"
      bind:value={username}
      disabled={busy}
    />
    <button class="button" type="submit" disabled={busy}>
      {busy ? "Searching…" : "Search"}
    </button>
  </form>

  <div bind:this={resultEl} class="result">
    {#if status.kind === "loading"}
      <div class="loading">{status.message}</div>
    {:else if status.kind === "error"}
      <div class="error">{status.message}</div>
    {:else if status.kind === "found"}
      <div class="card">
        <img class="avatar" src={status.avatar} alt="" />
        <div class="info">
          <div class="name">
            {status.user.displayName} (@{status.user.name})
          </div>
          <div class="found">Found in a server ✓</div>
          <div class="meta">
            Players: {status.match.server.playing}/{status.match.server.maxPlayers}
            · Ping: {Math.round(status.match.server.ping)}ms
          </div>
          <div class="serverId">{status.match.server.id}</div>
          <a
            class="join"
            href={joinUrl(status.match.server.id)}
            target="_blank"
            rel="noreferrer"
          >
            Join server
          </a>
        </div>
      </div>
    {:else if status.kind === "not-found"}
      <div class="card">
        <img class="avatar" src={status.avatar} alt="" />
        <div class="info">
          <div class="name">
            {status.user.displayName} (@{status.user.name})
          </div>
          <div class="notFound">Not found in any public server.</div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .root {
    width: 320px;
    padding: 14px;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    color: #f3f4f6;
    background: #1f2430;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  }

  .header {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 12px;
    color: #cdd3e0;
    cursor: move;
    user-select: none;
  }

  .form {
    display: flex;
    gap: 8px;
  }

  .input {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid #3a4152;
    background: #131722;
    color: #f3f4f6;
    font-size: 13px;
    outline: none;
  }

  .input:focus {
    border-color: #335fff;
  }

  .button {
    padding: 8px 14px;
    border-radius: 8px;
    border: none;
    background: #335fff;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .result {
    margin-top: 12px;
    min-height: 8px;
  }

  .loading {
    font-size: 13px;
    color: #9aa4bd;
  }

  .error {
    font-size: 13px;
    color: #ff6b6b;
  }

  .card {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .avatar {
    width: 56px;
    height: 56px;
    border-radius: 8px;
    background: #131722;
    flex-shrink: 0;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .name {
    font-size: 13px;
    font-weight: 600;
  }

  .found {
    font-size: 13px;
    color: #4ade80;
    font-weight: 600;
  }

  .notFound {
    font-size: 13px;
    color: #ff6b6b;
  }

  .meta {
    font-size: 12px;
    color: #9aa4bd;
  }

  .serverId {
    font-size: 11px;
    color: #6b7280;
    word-break: break-all;
  }

  .join {
    margin-top: 4px;
    font-size: 12px;
    color: #7aa2ff;
    text-decoration: none;
  }

  .join:hover {
    text-decoration: underline;
  }
</style>
