## Future ( once the functionality is complete )
1. pgit should b able to handle multiple files and folders simultaniously
2. pgit should b able to handle both - tracked and untracked files
3. If any private files changes ( which are already tracked ) , we should b able to manage them also . 
4. Add support for glob patterns (e.g., pgit add *.env) [glob-pattern-plan](glob-pattern-plan.md)
5. Implement exclusion patterns (e.g., pgit add . --exclude *.log)
6. Add dry-run mode to preview what would be added
- Refactor version management to use package.json as the single source of truth (see [Refactoring_Version_Management_Plan](Refactoring_Version_Management_Plan.md).md for details).