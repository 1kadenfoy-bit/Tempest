# Preview hosting

## Recommendation: Cloudflare (free plan), connected to the GitHub repository

Why:

- **It can send the security headers** the weather library's fast path needs, from `public/_headers`. GitHub Pages cannot.
- **It builds private repositories.** The repo is private, and free GitHub Pages does not host private repos.
- Every push builds; each branch gets its own preview address, so a milestone can be checked on the phone before it is merged.
- Free plan: 25 MiB per file (our largest file, the Sea to Sky base map, is 19.9 MB), unlimited bandwidth on static files.

Not settled from the docs (their site is outside this session's network): whether Cloudflare's static hosting answers partial requests. The app no longer depends on it. If the host sends the whole map file, the app keeps it and slices it, and the phone test page reports which happened.

Runner-up: Netlify (also reads `_headers`, builds private repos).

## Setup (Kaden, about 10 minutes)

Cloudflare has been moving static sites from "Pages" to "Workers"; the dashboard wording may differ from this.

1. Create a free account at cloudflare.com.
2. In the dashboard: **Workers & Pages → Create → Import a repository** (or **Pages → Connect to Git**).
3. Connect GitHub and allow access to the `Tempest` repository only.
4. Build settings:
   - Framework preset: **None** (or Vite)
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variable: `NODE_VERSION` = `22`
5. Save and deploy. The site address ends in `.pages.dev` or `.workers.dev`.
6. Send Claude the address. Branch previews appear under the same project.

The build cuts the Sea to Sky base map from the Protomaps daily build each time (about 20 MB, 10 s), so no map file sits in the repository.
