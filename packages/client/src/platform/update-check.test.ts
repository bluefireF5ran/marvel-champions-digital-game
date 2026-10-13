import { describe, expect, it } from "vitest";
import {
  installTarget,
  isNewerVersion,
  parseLatestRelease,
  parseVersion,
  updateFor,
  type LatestRelease,
} from "./update-check.js";

const REPO = "https://github.com/quincarter/marvel-champions-digital-game";
const download = (name: string) => ({ name, browser_download_url: `${REPO}/releases/download/v0.20.0/${name}` });

/** The asset names release-on-merge.yml publishes (v0.19.1's, renumbered). */
const ALL_ASSETS = [
  "marvel-champions-0.20.0.apk",
  "Marvel.Champions-0.20.0-1.x86_64.rpm",
  "Marvel.Champions_0.20.0_aarch64.dmg",
  "Marvel.Champions_0.20.0_amd64.AppImage",
  "Marvel.Champions_0.20.0_amd64.deb",
  "Marvel.Champions_0.20.0_x64-setup.exe",
  "Marvel.Champions_0.20.0_x64.dmg",
  "Marvel.Champions_0.20.0_x64_en-US.msi",
  "Marvel.Champions_aarch64.app.tar.gz",
  "SHA256SUMS.txt",
];

const githubJson = (assets: readonly string[], extra: object = {}) => ({
  tag_name: "v0.20.0",
  html_url: `${REPO}/releases/tag/v0.20.0`,
  draft: false,
  prerelease: false,
  assets: assets.map(download),
  ...extra,
});

const release = (assets: readonly string[]): LatestRelease => parseLatestRelease(githubJson(assets))!;

describe("installTarget", () => {
  const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/141.0";
  const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
  const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15";
  const ANDROID = "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/141.0 Mobile";
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15";

  it("names the desktop OS under Tauri and Android under Capacitor", () => {
    expect(installTarget("tauri", WINDOWS)).toBe("windows");
    expect(installTarget("tauri", MAC)).toBe("macos");
    expect(installTarget("tauri", LINUX)).toBe("linux");
    expect(installTarget("capacitor", ANDROID)).toBe("android");
  });

  it("is null on the web and on iOS, which no release ships a build for", () => {
    expect(installTarget("web", WINDOWS)).toBeNull();
    expect(installTarget("web", ANDROID)).toBeNull();
    expect(installTarget("capacitor", IPHONE)).toBeNull();
  });
});

describe("version comparison", () => {
  it("parses a plain or v-prefixed version and nothing else", () => {
    expect(parseVersion("v0.19.1")).toEqual([0, 19, 1]);
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("v1.2.3-beta.1")).toBeNull();
    expect(parseVersion("latest")).toBeNull();
  });

  it("compares numerically, not as text", () => {
    expect(isNewerVersion("0.20.0", "0.19.1")).toBe(true);
    expect(isNewerVersion("0.19.10", "0.19.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.99.99")).toBe(true);
    expect(isNewerVersion("0.19.1", "0.19.1")).toBe(false);
    expect(isNewerVersion("0.19.0", "0.19.1")).toBe(false);
    expect(isNewerVersion("nonsense", "0.19.1")).toBe(false);
  });
});

describe("parseLatestRelease", () => {
  it("reads the version, page and assets", () => {
    const parsed = parseLatestRelease(githubJson(["marvel-champions-0.20.0.apk"]));
    expect(parsed).toEqual({
      version: "0.20.0",
      url: `${REPO}/releases/tag/v0.20.0`,
      assets: [
        { name: "marvel-champions-0.20.0.apk", url: `${REPO}/releases/download/v0.20.0/marvel-champions-0.20.0.apk` },
      ],
    });
  });

  it("refuses a draft, a prerelease and malformed JSON", () => {
    expect(parseLatestRelease(githubJson(ALL_ASSETS, { draft: true }))).toBeNull();
    expect(parseLatestRelease(githubJson(ALL_ASSETS, { prerelease: true }))).toBeNull();
    expect(parseLatestRelease(githubJson(ALL_ASSETS, { tag_name: "nightly" }))).toBeNull();
    expect(parseLatestRelease({ message: "API rate limit exceeded" })).toBeNull();
    expect(parseLatestRelease(null)).toBeNull();
  });

  it("keeps only URLs under this repo", () => {
    expect(parseLatestRelease(githubJson(ALL_ASSETS, { html_url: "https://example.com/releases" }))).toBeNull();
    const parsed = parseLatestRelease(
      githubJson([], { assets: [{ name: "evil.apk", browser_download_url: "https://example.com/evil.apk" }] }),
    );
    expect(parsed?.assets).toEqual([]);
  });
});

describe("updateFor", () => {
  it("offers nothing when the release is not newer", () => {
    expect(updateFor(release(ALL_ASSETS), "0.20.0", "windows")).toBeNull();
    expect(updateFor(release(ALL_ASSETS), "0.21.0", "android")).toBeNull();
  });

  it("opens the one installer directly on Android and Windows", () => {
    expect(updateFor(release(ALL_ASSETS), "0.19.1", "android")).toEqual({
      version: "0.20.0",
      url: `${REPO}/releases/download/v0.20.0/marvel-champions-0.20.0.apk`,
    });
    expect(updateFor(release(ALL_ASSETS), "0.19.1", "windows")?.url).toBe(
      `${REPO}/releases/download/v0.20.0/Marvel.Champions_0.20.0_x64-setup.exe`,
    );
  });

  it("opens the release page on macOS and Linux, which have several installers", () => {
    const page = `${REPO}/releases/tag/v0.20.0`;
    expect(updateFor(release(ALL_ASSETS), "0.19.1", "macos")?.url).toBe(page);
    expect(updateFor(release(ALL_ASSETS), "0.19.1", "linux")?.url).toBe(page);
  });

  it("offers nothing to a platform the release has no installer for", () => {
    const desktopOnly = release(ALL_ASSETS.filter((name) => !name.endsWith(".apk")));
    expect(updateFor(desktopOnly, "0.19.1", "android")).toBeNull();
    expect(updateFor(desktopOnly, "0.19.1", "windows")).not.toBeNull();

    const androidOnly = release(["marvel-champions-0.20.0.apk", "SHA256SUMS.txt"]);
    expect(updateFor(androidOnly, "0.19.1", "android")).not.toBeNull();
    expect(updateFor(androidOnly, "0.19.1", "windows")).toBeNull();
    expect(updateFor(androidOnly, "0.19.1", "macos")).toBeNull();
    expect(updateFor(androidOnly, "0.19.1", "linux")).toBeNull();
  });

  it("falls back to the release page when Windows has only the .msi", () => {
    const msiOnly = release(["Marvel.Champions_0.20.0_x64_en-US.msi"]);
    expect(updateFor(msiOnly, "0.19.1", "windows")?.url).toBe(`${REPO}/releases/tag/v0.20.0`);
  });
});
