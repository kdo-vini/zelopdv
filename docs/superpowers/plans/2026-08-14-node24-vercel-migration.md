# Vercel Node.js 24 Migration Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Move both Vercel projects, zelopdv and zelopdv-admin, from Node.js 20 to Node.js 24.x before the October 1 deadline in the Vercel notice.

**Architecture:** This is a runtime/configuration migration, not a product or database migration. The repository declares Node 24 for local/build tooling, the main SvelteKit app emits Vercel functions with nodejs24.x, and both Vercel project settings select 24.x. Dependency versions and application behavior remain unchanged; Git-connected preview deployments are the validation gate before the normal origin/main production deploy.

**Tech Stack:** Node.js 24.x, npm lockfile v3, SvelteKit 2, Svelte 5, @sveltejs/adapter-vercel, @sveltejs/adapter-auto, Vite, Vercel Git deployments.

## Global Constraints

- Target 24.x for all project-level Node declarations; keep .nvmrc at major version 24.
- Change the main adapter runtime from nodejs20.x to nodejs24.x.
- Do not upgrade SvelteKit, Svelte, Vite, npm dependencies, or lockfile-resolved versions.
- Do not create or apply Supabase migrations; this change has no database impact.
- Do not change environment variables, secrets, cron schedules, domains, or project roots.
- Use Git-connected preview deployments and push origin/main for production; do not use vercel --prod directly.
- Preserve a known-good production deployment for rollback.
- Finish before September 15, 2026 to leave buffer before the October 1 deadline.

## Current Findings

- Local baseline is Node v24.16.0 and npm 11.17.0.
- Main app Node 20 declarations are in .nvmrc, package.json, package-lock.json, and svelte.config.js.
- Admin app Node 20 declarations are in admin-dashboard/package.json and the root metadata of admin-dashboard/package-lock.json.
- vercel.json contains cron definitions only; it does not configure Node.
- Admin uses adapter-auto, so its package engine and Vercel project setting are the runtime controls; do not add a runtime line to admin-dashboard/svelte.config.js.
- Baseline on Node 24: root check passes with 0 errors and 95 known warnings; root tests pass with 107 files and 685 tests; admin build passes with existing warnings.
- Pre-existing exception: admin-dashboard npm run check points to a missing admin-dashboard/jsconfig.json. Do not mix that fix into this migration.
- The repository already documents a Windows-only Vercel adapter symlink EPERM risk; Vercel preview build logs are authoritative for deployment validation.

## File Map

- Modify .nvmrc, package.json, package-lock.json, svelte.config.js.
- Modify admin-dashboard/package.json and admin-dashboard/package-lock.json.
- Modify CLAUDE.md, docs/CURRENT.md, and docs/ZeloPDV.memory.md after rollout.
- Do not modify vercel.json unless the dashboard reveals an unavoidable project override.

### Task 1: Establish the branch and baseline

**Files:** No source files.

**Interfaces:** Consumes the current working tree. Produces a baseline for comparison.

- [ ] Step 1: Check the working tree and create the branch.

~~~powershell
git status --short
git switch -c codex/migrate-vercel-node24
~~~

Expected: no unrelated changes are overwritten; if the branch already exists, check it out instead of recreating it.

- [ ] Step 2: Record runtime and active declarations.

~~~powershell
node --version
npm --version
rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!*.lock' --glob '!.env*' '(nodejs20|nodejs24|20\.x|24\.x|NODE_VERSION)' .
~~~

Expected: local Node 24 is available and tracked declarations still show the Node 20 baseline.

- [ ] Step 3: Run baseline gates.

~~~powershell
npm run check
npm test
Push-Location admin-dashboard
npm run build
Pop-Location
~~~

Expected: root check/tests and admin build remain green; the existing admin jsconfig check failure is recorded but not fixed here.

### Task 2: Update the main app runtime contract

**Files:**
- Modify: .nvmrc
- Modify: package.json
- Modify: package-lock.json
- Modify: svelte.config.js

**Interfaces:** Consumes Node 24. Produces aligned local, npm, and SvelteKit runtime declarations.

- [ ] Step 1: Set .nvmrc to 24 and change package.json to:

~~~json
"engines": {
  "node": "24.x"
}
~~~

Do not change scripts or dependencies.

- [ ] Step 2: In svelte.config.js, change only the adapter runtime to:

~~~js
adapterVercel({
  runtime: 'nodejs24.x'
})
~~~

Preserve preprocessing, paths.relative, and the adapter choice.

- [ ] Step 3: Regenerate only root lock metadata.

~~~powershell
npm install --package-lock-only --ignore-scripts
~~~

Expected: packages[""].engines.node becomes 24.x; resolved versions, URLs, integrities, and dependency graph do not change.

- [ ] Step 4: Review the exact diff.

~~~powershell
git diff -- .nvmrc package.json package-lock.json svelte.config.js
~~~

Expected: only Node declarations and generated root metadata changed.

### Task 3: Update the admin app runtime contract

**Files:**
- Modify: admin-dashboard/package.json
- Modify: admin-dashboard/package-lock.json
- Do not modify: admin-dashboard/svelte.config.js

**Interfaces:** Consumes the existing adapter-auto path. Produces admin npm metadata selecting Node 24 without a second runtime surface.

- [ ] Step 1: Set admin-dashboard/package.json engines to:

~~~json
"engines": {
  "node": "24.x"
}
~~~

Keep its dependencies, scripts, Svelte 4 version, and adapter unchanged.

- [ ] Step 2: Regenerate only admin lock metadata.

~~~powershell
Push-Location admin-dashboard
npm install --package-lock-only --ignore-scripts
Pop-Location
~~~

Expected: only packages[""].engines.node changes from 20.x to 24.x.

- [ ] Step 3: Review the admin diff.

~~~powershell
git diff -- admin-dashboard/package.json admin-dashboard/package-lock.json admin-dashboard/svelte.config.js
~~~

Expected: admin package and lockfile declare 24.x; admin adapter config is untouched.

### Task 4: Validate installs and builds under Node 24

**Files:** No additional source files.

**Interfaces:** Consumes Tasks 2 and 3. Produces reproducible local evidence.

- [ ] Step 1: Install from both committed lockfiles.

~~~powershell
npm ci --ignore-scripts
Push-Location admin-dashboard
npm ci --ignore-scripts
Pop-Location
~~~

Expected: both installs complete under Node 24. Stop if npm reports engine or native-package failures.

- [ ] Step 2: Run main app gates.

~~~powershell
npm run check
npm test
npm run build
~~~

Expected: 0 check errors, full suite green, build complete. If Windows reproduces the documented .vercel/output/functions/index.func symlink EPERM, record it as local-only and use Vercel preview as the deployment build gate.

- [ ] Step 3: Run admin gates.

~~~powershell
Push-Location admin-dashboard
npm run build
npx svelte-check --output human
Pop-Location
~~~

Expected: build completes under Node 24. Keep the missing-jsconfig script problem and existing warnings separate from runtime results.

- [ ] Step 4: Search for active stale Node 20 declarations.

~~~powershell
rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!docs/superpowers/plans/**' --glob '!*.lock' --glob '!.env*' '(nodejs20|20\.x)' .
~~~

Expected: no active source/config reference remains; historical references are clearly marked and current docs are updated in Task 7.

### Task 5: Align both Vercel projects

**Files:** No repository files unless an intentional tracked Vercel setting is required.

**Interfaces:** Consumes repository engines declarations. Produces Vercel projects selecting Node 24.x for builds and functions.

- [ ] Step 1: In Vercel Dashboard, open project zelopdv → Settings → Build and Deployment → Node.js Version and select 24.x.
- [ ] Step 2: Repeat for project zelopdv-admin.
- [ ] Step 3: Verify the affected-project list with an authenticated CLI session.

~~~powershell
npm i -g vercel@latest
vercel project ls --update-required --scope vinicius-projects-d8d7bb4c
~~~

Expected: neither project appears as requiring a Node update. Do not commit the CLI or a token.
- [ ] Step 4: Inspect each project’s next deployment and confirm both dashboard setting and package engine resolve to 24.x. The package engine overrides a conflicting dashboard setting.

### Task 6: Validate previews and production-critical paths

**Files:** No source files.

**Interfaces:** Consumes Node 24 branch and project settings. Produces deployment evidence.

- [ ] Step 1: Commit and push the branch.

~~~powershell
git add .nvmrc package.json package-lock.json svelte.config.js admin-dashboard/package.json admin-dashboard/package-lock.json
git commit -m "chore: migrate Vercel projects to Node.js 24"
git push -u origin codex/migrate-vercel-node24
~~~

Expected: previews are created for both projects; production aliases do not change.

- [ ] Step 2: Inspect both previews for Node 24 build runtime, lockfile install success, no unsupported-runtime/module/native errors, and unchanged cron paths/schedules.
- [ ] Step 3: With a dedicated test account, smoke-test public landing/login, authenticated app shell and subscription guard, POS catalog load, admin login/users/subscriptions/settings, and one non-mutating main-app API plus one non-mutating admin API.
- [ ] Step 4: Search preview logs for Unsupported Node.js version, ERR_MODULE_NOT_FOUND, ReferenceError, Cannot find module, native binary failures, and failed cron invocations. Separate pre-existing warnings from new failures.

### Task 7: Roll out and document

**Files:**
- Modify: CLAUDE.md
- Modify: docs/CURRENT.md
- Modify: docs/ZeloPDV.memory.md

**Interfaces:** Consumes green local/preview gates. Produces production rollout and current docs.

- [ ] Step 1: Change active CLAUDE.md references from nodejs20.x/Node 20 to nodejs24.x/Node 24. Add a dated docs/CURRENT.md entry with files changed, test results, preview result, and pre-existing warnings. Replace the Node 20 runtime fact in docs/ZeloPDV.memory.md with Node 24.
- [ ] Step 2: Review the complete diff.

~~~powershell
git diff --check
git diff --stat
git diff -- .nvmrc package.json package-lock.json svelte.config.js admin-dashboard/package.json admin-dashboard/package-lock.json CLAUDE.md docs/CURRENT.md docs/ZeloPDV.memory.md
~~~

Expected: no whitespace errors, dependency churn, secrets, Supabase changes, or undocumented behavior changes.
- [ ] Step 3: After preview approval, merge and push origin/main. Use the existing Git integration; do not use vercel --prod.
- [ ] Step 4: Verify both production deployments are Ready, show Node 24.x, serve public/login/POS/admin flows, have no new runtime errors, and retain the existing cron configuration.
- [ ] Step 5: If docs were not included in the rollout commit, run:

~~~powershell
git add CLAUDE.md docs/CURRENT.md docs/ZeloPDV.memory.md
git commit -m "docs: record Vercel Node.js 24 migration"
git push origin main
~~~

## Rollback Procedure

1. Keep Vercel project settings at 24.x and promote the last known-good deployment artifact or revert the application commit through Git.
2. Do not restore 20.x declarations after the deadline; new Node 20 builds will be rejected.
3. If failure is runtime-specific, capture deployment ID, build log, and failing route before changing anything. A pre-deadline temporary return to Node 20 is an emergency exception only, followed by a Node 24 redeploy.
4. Re-run public app, auth, POS, admin, and function-log smoke checks after rollback.

## Acceptance Criteria

- .nvmrc is 24; both package.json files and both lockfile root metadata entries declare 24.x.
- svelte.config.js uses runtime nodejs24.x; admin adapter config is unchanged.
- Both Vercel projects select Node 24.x and neither appears in project ls --update-required.
- Main check has 0 errors and the 685-test baseline remains green or any change is explained.
- Both previews are Ready under Node 24; admin build is green; no new runtime/module/native errors appear.
- Production is deployed through Git integration and smoke-tested.
- CLAUDE.md, docs/CURRENT.md, and docs/ZeloPDV.memory.md describe Node 24; pre-existing admin check and Windows symlink limitations remain documented.
- No dependency graph, application behavior, Supabase schema, environment variable, cron schedule, or secret changes are included.

## Sources

- Vercel supported Node.js versions: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Vercel Node.js 24 LTS announcement: https://vercel.com/changelog/node-js-24-lts-is-now-generally-available-for-builds-and-functions
