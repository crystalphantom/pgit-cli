## Future ( once the functionality is complete )
- Legend: `[x]` done · `[~]` partial · `[ ]` pending
- [x] pgit should be able to handle multiple files and folders simultaneously (legacy `add` + v2 `preset apply` now uses bulk path arrays).
- [x] pgit should be able to handle both tracked and untracked files (legacy `add` tracks state and avoids re-adding tracked entries).
- [ ] If any private files changes (which are already tracked), we should manage them also.
- [ ] Add support for glob patterns (e.g., `pgit add *.env`) [glob-pattern-plan](glob-pattern-plan.md).
- [ ] Implement exclusion patterns (e.g., `pgit add . --exclude *.log`).
- [ ] Add dry-run mode to preview what would be added.
- [~] Refactor version management to use package.json as the single source of truth (see [Refactoring_Version_Management_Plan](Refactoring_Version_Management_Plan.md).md for details).  
  `done: runtime CLI version reads package.json`; `pending: config/schema version sources still duplicated.`
- [ ] Support non-git repos (e.g., `~/.secrets`, config files outside git repo).
