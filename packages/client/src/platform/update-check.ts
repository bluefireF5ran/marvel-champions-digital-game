/**
 * "Is there a newer release for this install?", for the native apps.
 *
 * The desktop and Android builds are downloaded from GitHub releases, not an app store, so nothing tells a player a
 * newer one exists. This asks GitHub's public API for the repo's latest published release (drafts and prereleases
 * are never "latest", so a release still building is not offered) and offers it only when it is newer than this
 * build *and* carries an installer for the platform it is running on. The web app is redeployed on every merge and
 * never asks.
 *
 * The API sends `access-control-allow-origin: *`, so this is the webview's own `fetch` in both shells, with no native
 * HTTP scope to widen. Unauthenticated calls are limited to 60 an hour per IP; one per launch is far inside that.
 */

import { detectPlatform, type Platform } from "./platform.js";
import { CLIENT_VERSION } from "../version.js";

const REPO_URL = "https://github.com/quincarter/marvel-champions-digital-game";
const LATEST_RELEASE_API = "https://api.github.com/repos/quincarter/marvel-champions-digital-game/releases/latest";

/** What a release has to carry an installer for. iOS is absent: no release ships an iOS build. */
export type InstallTarget = "android" | "windows" | "macos" | "linux";

export interface ReleaseAsset {
  readonly name: string;
  readonly url: string;
}

export interface LatestRelease {
  /** Without the tag's leading `v`. */
  readonly version: string;
  /** The release's page on GitHub: its notes and every download. */
  readonly url: string;
  readonly assets: readonly ReleaseAsset[];
}

export interface AvailableUpdate {
  readonly version: string;
  /** The installer itself where the platform has exactly one, otherwise the release page to pick from. */
  readonly url: string;
}

/** The installers each target can use, as the release workflow names them (release-on-merge.yml). */
const INSTALLERS: Record<InstallTarget, RegExp> = {
  android: /\.apk$/i,
  windows: /(-setup\.exe|\.msi)$/i,
  macos: /\.dmg$/i,
  linux: /\.(AppImage|deb|rpm)$/i,
};

/**
 * Targets with one obvious installer open it directly. macOS has a .dmg per architecture and the webview's user
 * agent reports Intel on both, and Linux has three package formats, so those open the release page instead.
 */
const DIRECT_DOWNLOAD: Partial<Record<InstallTarget, RegExp>> = {
  android: /\.apk$/i,
  windows: /-setup\.exe$/i,
};

export function installTarget(platform: Platform, userAgent: string): InstallTarget | null {
  if (platform === "capacitor") return /android/i.test(userAgent) ? "android" : null;
  if (platform !== "tauri") return null;
  if (/windows/i.test(userAgent)) return "windows";
  if (/mac os x|macintosh/i.test(userAgent)) return "macos";
  if (/linux|x11/i.test(userAgent)) return "linux";
  return null;
}

/** `[major, minor, patch]` of `1.2.3` or `v1.2.3`, or null for anything else (a pre-release suffix included). */
export function parseVersion(text: string): readonly [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (a === null || b === null) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  }
  return false;
}

/**
 * Reads GitHub's release JSON. Null for a draft, a prerelease, or anything malformed. Only URLs under this repo are
 * kept: they are opened outside the game, so a response is not trusted to name any other destination.
 */
export function parseLatestRelease(json: unknown): LatestRelease | null {
  if (typeof json !== "object" || json === null) return null;
  const release = json as Record<string, unknown>;
  if (release.draft === true || release.prerelease === true) return null;
  const { tag_name: tag, html_url: url } = release;
  if (typeof tag !== "string" || parseVersion(tag) === null || !isRepoUrl(url)) return null;
  const assets: ReleaseAsset[] = [];
  for (const entry of Array.isArray(release.assets) ? release.assets : []) {
    const { name, browser_download_url: download } = (entry ?? {}) as Record<string, unknown>;
    if (typeof name === "string" && isRepoUrl(download)) assets.push({ name, url: download });
  }
  return { version: tag.trim().replace(/^v/, ""), url, assets };
}

function isRepoUrl(url: unknown): url is string {
  return typeof url === "string" && url.startsWith(`${REPO_URL}/`);
}

/** The update to offer, or null: not newer, or published without an installer for `target`. */
export function updateFor(
  release: LatestRelease,
  currentVersion: string,
  target: InstallTarget,
): AvailableUpdate | null {
  if (!isNewerVersion(release.version, currentVersion)) return null;
  if (!release.assets.some((asset) => INSTALLERS[target].test(asset.name))) return null;
  const direct = DIRECT_DOWNLOAD[target];
  const installer = direct === undefined ? undefined : release.assets.find((asset) => direct.test(asset.name));
  return { version: release.version, url: installer?.url ?? release.url };
}

let answered: Promise<AvailableUpdate | null> | null = null;

/**
 * Asks once per launch and remembers the answer, so every later Title visit has it at once. Never rejects: offline,
 * rate-limited or malformed all mean "nothing to offer", and a failed ask is retried on the next call.
 */
export function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (answered !== null) return answered;
  const target = installTarget(detectPlatform(), globalThis.navigator?.userAgent ?? "");
  if (target === null) return (answered = Promise.resolve(null));
  const asking = fetchLatestRelease().then(
    (release) => (release === null ? null : updateFor(release, CLIENT_VERSION, target)),
    () => {
      answered = null;
      return null;
    },
  );
  answered = asking;
  return asking;
}

async function fetchLatestRelease(): Promise<LatestRelease | null> {
  const response = await fetch(LATEST_RELEASE_API, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  return parseLatestRelease(await response.json());
}
