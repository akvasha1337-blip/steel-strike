# Hosting the app online (GitHub Pages)

The app is one self-contained page. Hosted on GitHub Pages it gets an `https://` address, which is what Chrome and Edge require for Bluetooth (Web Bluetooth), USB (Web Serial) and one-click firmware install.

## Why Bluetooth/USB from the hosted page, and Wi-Fi only from the hub

A page loaded over `https://` may not open plain `ws://` or `http://` connections to a device on the local network (browsers block it as mixed content), and the ESP32 can't present a certificate browsers trust. So:

| How you open the app | Connects to the hub by | Browsers |
|---|---|---|
| Hosted URL (GitHub Pages) | Bluetooth or USB cable | Chrome / Edge on Windows, macOS, ChromeOS, Linux; Chrome on Android (Bluetooth) |
| `http://192.168.4.1` on the hub's own Wi-Fi (`SteelStrike-XXXX`) | Wi-Fi | Any browser, including iPhone Safari. No internet needed. |

Both are the same app; the hub carries a copy in its flash.

## One-time setup

1. On github.com create a new repository, e.g. `steel-strike` (public is simplest; Pages on private repos needs a paid plan).
2. Upload the contents of this folder (the `steel-strike/` folder itself, so `.github/`, `web/`, `firmware/`, `docs/` sit at the repository root). Either `git push`, or **Add file → Upload files** and drag the folders in. Make sure the hidden `.github` folder is included.
3. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Actions** tab: the "Build and deploy" workflow runs on every push to `main` (re-run it once after step 3 if the first run failed at deploy). It tests the app, builds all four firmware images, and publishes.
5. The app is at `https://<your-github-username>.github.io/steel-strike/`. Open it once in Chrome while online; it then works offline (service worker). Chrome's address bar → **Install** adds it as a desktop app.

## At the range

1. Power the hub (power bank).
2. Open the bookmarked/installed app in Chrome or Edge.
3. **Connect → Bluetooth** → pick `SteelStrike-…`. Setup and play.

Fallback if Bluetooth is flaky or you're on an iPhone: join Wi-Fi `SteelStrike-XXXX` (password `steelstrike`), open `http://192.168.4.1`, **Connect → Wi-Fi**.

## Flashing the hub from the hosted page

Chrome/Edge on a computer, hub on USB → **Connect → Install firmware**:
- **Install wired hub firmware** — piezos wired straight to the hub (minimum build, no target boards).
- **Install hub firmware** — hub for wireless ESP32-C3 targets.
- **Install target firmware** — each ESP32-C3 target.
