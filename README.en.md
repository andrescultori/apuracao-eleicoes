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
| Tests                | [Vitest](https://vitest.dev) (66 tests)                    |
| Lint / formatting    | ESLint 9 + typescript-eslint, Prettier                     |
| CI                   | GitHub Actions                                             |
| Deploy               | GitHub Pages (via Actions) + Netlify (config included)     |
| Official data source | TSE — EA11 catalog, EA10/EA20 results, EA14/EA15 tracking  |

## Deliberate technical decision: the real TSE integration

The real integration fetches and parses the TSE's election catalog (the EA11
file) to dynamically resolve the election code for each office/state — it
never hardcodes one — and builds every file's URL from the directory
_template_ published by the catalog itself (`arq[].dir`), never a path
hardcoded in the code. Request queue with concurrency 1, caching via
`ETag`/`If-None-Match`, exponential backoff on network errors, never
retrying a URL that returned 404.

Confirmed live, with real browser access during the September 2026
simulation windows, and tested in this very interface (President, Governor,
Senator, Federal Deputy, and State Deputy, across several states, with
auto-refresh and no manual intervention):

- **The TSE's office code** — President `0001`, Governor `0003`, Senator
  `0005`, Federal Deputy `0006`, State Deputy `0007`
  (`TSE_CONFIG.officeCargoCode`), also confirmed in the catalog itself
  (`cp[].cd`).
- **Signature verification wired end to end** — files ship as a JWS envelope
  (EdDSA/Ed25519); both public keys published by the TSE
  (development/simulation and production/official) are already embedded in
  `src/data/tseKeys.ts`. No data is accepted without a valid signature, the
  expected algorithm (`EdDSA`), and a `kid` matching the active environment —
  a tampered file, one from another environment, or one not yet published is
  never promoted to "ready".
- **Section tracking** — comes from the TSE's tracking file (file type
  "ab", EA14/EA15), confirmed live on 09/29/2026 from a real simulation
  file: a single Brazil-scoped file already carries all 27 states (plus
  overseas voting), no per-state file needed.
- **CORS** — direct browser access to the TSE's domain, no blocking; there's
  no proxy or serverless function in between, and none is needed.
- **Configurable percentage basis** — "Settings" lets you choose whether
  each candidate's percentage is computed over valid votes (default,
  excludes blank/null ballots) or over total votes counted.

What's **still not confirmed live**, documented explicitly in the code and
never worked around with a guessed value:

- **The official environment** (`resultados.tse.jus.br/oficial`). The
  production public key is already embedded and the verification mechanism
  has been tested (it rejects the wrong key), but the environment only opens
  with pleito 3220, on 10/04/2026 — candidates not yet finalized.
- **State-only result files** (without a municipality). Only the
  municipality-level pattern has been directly observed live; the app always
  resolves the path from the catalog's own template, so it never invents
  this pattern.
- **2nd round** — uses the same 2nd-round election code (`cdt2`) published
  by the catalog, but this hasn't been tested against real 2nd-round data
  yet.
- **Per-candidate annulled-vote handling** (`dvt`) — every candidate
  currently appears in the results list regardless of this field; the
  percentage-basis option handles the aggregate total but doesn't filter
  individual rows.

**Before relying on this for a real election**, confirm the points above
directly against the official documentation:

- [TSE — technical information on results disclosure](https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados) (Portuguese only)
- [JWS file verification manual](https://www.tse.jus.br/eleicoes/eleicoes-2026-content/arquivos/divulgacao-de-resultados/manual-verificacao-jws) (Portuguese only)

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
  required — the TSE's disclosure files are public and require neither
  authentication nor a proxy, confirmed by the real fetches this interface
  made during the simulations (see the section above).

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
