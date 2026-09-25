[🇧🇷 Português](README.md) | 🇺🇸 English

# 🗳️ Apuração 2026 (2026 Election Results)

**Real-time Brazilian election results dashboard — 5 races at once, favorite candidates across states, and a real (not simulated) integration with Brazil's official electoral court (TSE) data feed.**

A client-side dashboard (TypeScript + Vite, no framework) that simulates vote counting by default and already fetches/parses the TSE's real election catalog when switched to official mode — never mixing fictional and real data on the same screen.

**[🔗 Live demo](https://andrescultori.github.io/apuracao-eleicoes/)** — no password needed; the default mode uses fictional data, so there's nothing sensitive to gate.

> ⚠ **Independent project.** "Apuração 2026" is not affiliated with Brazil's
> Tribunal Superior Eleitoral (TSE) or any official body. It's a public-data
> visualization interface only — no political analysis, no election
> forecasting, no voting recommendations.

![Apuração 2026 dashboard showing the Presidential race, with one starred candidate highlighted](screenshots/apuracao-2026-presidente.png)

## Context

Following a Brazilian general election spread across 5 different races (President, Governor, Senator, Federal Deputy, State Deputy) is awkward: the candidates a given voter cares about are often in different states, and most tracking dashboards only show one race at a time. This project set out to fix two things at once: bring all 5 races into a single view, and let you favorite a candidate from any state without losing track of them.

## The approach

```
Data source
  ├─ Demo mode → deterministic generator (fixed seed, simulates the count over time)
  └─ TSE mode  → real EA11 catalog → resolves office/state/round → EA10/EA20
        ↓
  DataProvider (single interface — the UI never knows where a number came from)
        ↓
  Application state (filters, favorites across offices/states, theme)
        ↓
  Rendering (table, charts, favorites bar pinned at the top)
```

Switching the data source is a single setting in "Settings" — the UI, the favorites search, and the charts all keep working exactly the same in both modes.

## The dashboard itself

- All 5 races (President, Governor, Senator, Federal Deputy, State Deputy), scoped nationally or per state as appropriate.
- Filters for voting round (1st/2nd — 2nd round only where it applies), state, and candidate search.
- **Favorite Candidates**: search by name or ballot number across every race and state (not just the one currently open), favorites highlighted in tables and charts, and a bar pinned to the top of every page showing each favorite's current standing.
- Vote distribution chart and a count-evolution chart over time.
- Light/dark/system theme, responsive layout, configurable auto-refresh (10s to 2min).

### Data modes

The app has two modes, switchable in **Settings**:

- **Demo** (default): fictional data, generated deterministically in the
  browser, simulating a vote count over time. This is the mode used outside
  the official disclosure windows, and the fallback if the real integration
  ever fails — the app never breaks or shows an empty screen.
- **Official data (TSE)**: consumes the TSE's public result-disclosure files.
  **Real data only exists to fetch during the official 2026 simulation
  windows (Sept 15–17, 22–24, and 28–29) and on election day** — outside
  those windows, even with official mode selected, there's nothing to fetch.

## Tech stack

| Layer                | Technology                                                 |
| -------------------- | ---------------------------------------------------------- |
| Build / dev server   | [Vite](https://vitejs.dev)                                 |
| Language             | TypeScript, `strict` mode                                  |
| UI                   | Plain HTML/CSS/JS — no framework, one module per component |
| Tests                | [Vitest](https://vitest.dev) (34 tests)                    |
| Lint / formatting    | ESLint 9 + typescript-eslint, Prettier                     |
| CI                   | GitHub Actions                                             |
| Deploy               | GitHub Pages (via Actions) + Netlify (config included)     |
| Official data source | TSE — EA11 election catalog + EA10/EA20 result files       |

## Deliberate technical decision: the real TSE integration

The real integration fetches and parses the TSE's election catalog (the EA11
file) to dynamically resolve the election code for each office/state — it
never hardcodes one. That part already works end to end (a request queue with
concurrency 1, caching via `ETag`/`If-None-Match`, exponential backoff on
network errors, never retrying a URL that returned 404).

What's **still not possible to finish**, documented as an explicit TODO in
the code (`src/data/tseConfig.ts`, `src/data/tseDataProvider.ts`) and never
worked around with a guessed value:

- **The TSE's office code** for President/Governor/Senator/Federal
  Deputy/State Deputy, needed to build the result-file URL (EA10/EA20).
  Without it, "Official data" mode honestly shows "Data unavailable" instead
  of risking a wrong URL.
- **The file-integrity verification mechanism.** The TSE mentions a digital
  certificate (`cert-e<ELECTION>-a.cer`) tied to each election, but we found
  no confirmation, across the sources we could check, that the result JSON
  files actually ship as a signed JWS envelope (the name assumed by this
  project's original spec) — it could be an X.509-certificate-based
  mechanism instead, or the relevant documentation page may simply have been
  unreachable during this development session (the `tse.jus.br` domain was
  blocked by that environment's network policy). Until this is confirmed, no
  data is ever promoted to "ready" — see `src/data/jws.ts`, which already
  implements and tests generic JWS verification, ready to be wired in once
  the real mechanism is confirmed.

This research was done through verifiable secondary sources (text extracted
from the official specification PDFs, and real JSON samples published in
public repositories), since direct access to `tse.jus.br` wasn't available in
the development environment. **Before relying on this for a real election**,
confirm the points above directly against the official documentation:

- [TSE — technical information on results disclosure](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados) (Portuguese only)

## Architecture

```
src/
  data/            # domain constants, types, data providers (mock and TSE)
  state/           # application state, persistence, shared context
  ui/              # one module per UI component
  styles/          # CSS (light/dark themes via custom properties)
  main.ts          # bootstrap
```

Both data providers ([`mockDataProvider`](src/data/mockDataProvider.ts) and
[`tseDataProvider`](src/data/tseDataProvider.ts)) implement the same
[`DataProvider`](src/data/types.ts) interface (`getElectionData`,
`getCandidates`, `getResults`, `getLastUpdate`) — the interface never knows
where the data came from. The shared context
([`AppContext`](src/state/appContext.ts)) decides which provider to query on
each call, and the cross-office/cross-state favorites search
([`candidateSearch.ts`](src/state/candidateSearch.ts)) goes through that same
dispatcher.

## CI/CD

- **GitHub Actions** (`.github/workflows/ci.yml`): runs formatting, lint,
  typecheck, tests, and build on every push/PR to `main`.
- **GitHub Pages deploy** (default): the
  `.github/workflows/deploy-pages.yml` workflow builds with
  `BASE_PATH=/apuracao-eleicoes/` (needed because a GitHub Pages project site
  is served at `user.github.io/repo/`, not at the domain root) and publishes
  via Actions on every push to `main`.
- **Netlify deploy** (alternative, config included): via `netlify.toml`
  (`npm run build`, publishes `dist/`). No secret environment variables are
  required — the TSE's disclosure files are public and don't require
  authentication (per the sources consulted; not explicitly confirmed in
  writing — see the section above).

## Running locally

```bash
npm install
npm run dev
```

Other available scripts:

```bash
npm run build          # production build into dist/
npm run preview        # serve the production build locally
npm run test           # unit tests (Vitest)
npm run lint           # ESLint
npm run typecheck      # strict TypeScript check, no output emitted
npm run format         # format the project with Prettier
npm run format:check   # check formatting without changing files
```

## License

MIT — see [LICENSE](LICENSE).

---

_All data shown in Demo mode is entirely fictional, generated deterministically in the browser — no real voting data is used, collected, or stored by this project._

Built by [André Scultori](https://github.com/andrescultori) · © 2026 · [GitHub](https://github.com/andrescultori/apuracao-eleicoes)
