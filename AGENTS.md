# Repository Guidelines

## Project Structure & Module Organization
This repository is a monorepo with workspace packages under `apps/*` and `packages/*`.

- `apps/web`: React + Vite frontend (`src/`, `vite.config.ts`, Tailwind config).
- `apps/mobile` and `apps/mobile2`: Expo React Native clients (`app/`, `assets/`, platform folders).
- `apps/desktop`: Electron wrapper and a `wails-app` Go subproject.
- `packages/common`: Shared TypeScript crypto/types used across clients.
- `packages/server`: Go backend (`cmd/server`, `internal/*`, SQL schema, Docker/Fly config).
- `docs/`: setup and operational guides.
- `scripts/`: local setup helpers (e.g., server/app bootstrap scripts).

Keep changes scoped to the relevant workspace. Shared contracts should be updated in `packages/common` first.

## Build, Test, and Development Commands
Run from repository root unless noted:

- `pnpm install`: install all workspace dependencies (Node 20+ required).
- `npm run dev:web`: start web app dev server (`apps/web`).
- `npm run dev:mobile`: start Expo for `apps/mobile`.
- `npm run build`: run Turborepo build across workspaces.
- `npm run build:web`: production web build only.
- `npm run type-check`: TypeScript checks across workspaces (where defined).
- `npm run lint`: run ESLint across workspaces (where defined).
- `npm run test`: executes workspace test scripts if present.

## Coding Style & Naming Conventions
Formatting is governed by root Prettier config: 2-space indent, single quotes, no semicolons, `printWidth: 100`.

- TypeScript/TSX: prefer `camelCase` for variables/functions, `PascalCase` for components/types.
- Go (`packages/server`): follow standard Go naming and package layout under `internal/`.
- File naming: React components in `PascalCase` (e.g., `ChatPage.tsx`), utility modules in `kebab-case` or existing local style.

Run `npm run lint` and `npm run type-check` before opening a PR.

## Testing Guidelines
There is no comprehensive first-party test suite yet. For now:

- Add tests with new features where practical (`*.test.ts`, `*_test.go` conventions).
- At minimum, include type-check + lint in validation.
- For backend edits, prefer focused Go tests near changed package when adding coverage.

## Commit & Pull Request Guidelines
Recent history uses concise Conventional Commit-style prefixes, mainly `fix:` (also use `feat:`, `chore:`, `docs:`, `refactor:` as appropriate).

- Keep commit subject imperative and scoped (example: `fix: align mobile metro watchFolders`).
- PRs should include: purpose, affected workspaces, validation steps run, and any env/config changes.
- Include screenshots or short recordings for UI changes (web/mobile/desktop).
