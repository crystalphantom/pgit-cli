## Backlog (legacy + v2)
- Legend: `[x]` done · `[~]` partial · `[ ]` pending

1. [x] Store pgit/private config at a central location (`~/.pgit/...`) for v2 flow (preset + config sync metadata).
2. [ ] Clean up redundant tests.
3. [ ] Refactoring.
4. [ ] Commands auto complete is not working.
5. Presets:
   - [x] Provide `pgit preset add/remove/list/show/apply`.
   - [x] Apply preset uses bulk `pgit add` path through one operation for single-path-aggregated commit behavior.
   - [x] `pgit preset -h` and subcommand list are discoverable.
   - [x] Global preset creation works without local init.
6. [ ] Add a file based on file pattern (e.g., `*.sql`).
7. [~] Pause/close handling for `pgit add`:
   - batch rollback exists and is exercised.
   - pending: graceful `SIGINT`/hard abort handling is still not explicit.
8. [ ] Update the private commit message to include file/folder metadata (at least file count).
9. [ ] Update already added files automatically and keep private repo in sync via hooks.
10. [ ] `pgit remove` command or re-add flow for already-added files.
11. [x] Relative path-only behavior still valid for now (legacy + v2 path input normalization currently operate on repo-relative paths).
12. [ ] Add custom message option to `pgit add`.
13. [x] MVP visibility policy: hide legacy `init/add` surface from normal discovery (`help`/docs) while keeping it available internally as a non-default/legacy mode with clear deprecation warning.
