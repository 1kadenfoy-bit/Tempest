# Preview hosting

Decided with Kaden, Nov 15, 2026: **GitHub Pages while testing, his home server for the final version.** The app is only static files (no backend), so moving it later is copying a folder.

## Now: GitHub Pages

- `.github/workflows/pages.yml` builds and publishes on every push to `main` and to milestone branches (`claude/**`), so the address always shows the latest work. It skips while the repository is private.
- Address: `https://1kadenfoy-bit.github.io/Tempest/`, with the phone test page at `…/Tempest/spike.html`.
- The build is made with `BASE_PATH=/Tempest/`, because Pages serves the site under the repository name.
- Limits: 1 GB per site, 100 MB per file, about 100 GB of traffic a month. Since M1 the site carries the base map for all of BC: about 680 MB in 28 files, the largest 78 MB (`tools/build-basemap.mjs`). Adding zoom-14 detail regions costs 2 to 10 MB each; zoom 14 for all of BC (about 1.4 GB) would not fit.
- **No security headers.** GitHub Pages cannot send the cross-origin isolation headers, so the weather library runs on its slower path. The phone tests show whether that is noticeable. If it is, a small service worker can add the headers in the browser (to try in M1).
- Making the repository public also settles the GPL question for the starter library and its decoder.

### Kaden's steps

1. On github.com, open the Tempest repository → **Settings**.
2. **General** → scroll to **Danger Zone** → **Change repository visibility** → **Public**, and confirm.
3. **Pages** (left menu) → under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Tell Claude. Claude re-runs the publish and sends the address.

## Later: the home server

A 2016 MacBook Pro running Ubuntu. To decide when the final version is near:

- How the phone reaches it away from home: a Cloudflare Tunnel (free, no open router ports) or Tailscale (a VPN app on the phone).
- A secure (https) address, which home-screen install, offline storage and the fast weather path need. The tunnel provides one.
- Updates: a small script that pulls the new version from GitHub and rebuilds.
- It can also hold the whole-BC map files without size limits, and could later process raw ECCC model data as an extra source (architecture: "a home server is an optional extra source").

## Considered

- **Cloudflare (free plan, no card):** sends the headers and builds private repositories. Kept as the fallback if GitHub Pages falls short.
- **Claude Code's own preview:** only exists while a session runs; it can't be installed to the home screen or relied on outdoors.
