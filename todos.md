1. Store the pgit at some central location rather than in the same repo ( /tmp)
2. Clean up the redundant tests
3. Refactoring
4. Commands auto complete is not working
5. Presets -
    ex : pgit add --preset claude
    ex : pgit add --presets claude gemini claude-flow opencode
6. Add a file based on the file pattern ( *.sql)
7. What happens if i pause or close the pgit add command ? Need its handling
8. Update the pgit commit message to also include the files/folders metadata ( at least no of files)


<!-- below is the gitignore . Move this to git info exclude -->
# Private Git Tracking (auto-generated)
.git-private
.private-storage
.private-config.json