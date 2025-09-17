1. Store the pgit at some central location rather than in the same repo ( /tmp)
2. Clean up the redundant tests
3. Refactoring
4. Commands auto complete is not working
5. Presets -
    ex : pgit add --preset claude
    ex : pgit add --presets claude gemini claude-flow opencode
    the commands should : 
        - pgit preset add preset-name
        - pgit preset remove preset-name

    * Currently preset command includes the file and commits independantly . We should b able to bulk add it ( single meaunigfull commit) . If possible can we use the underlining methods of the - `pgit add ... ` as this can handle mulitple files and folders 
    * Also update the pgit -h to also include all the sub commands available for the preset .
    * define preset is not working . It should work even without initializing the pgit in a worksapce or repo as the presets are global . 

6. Add a file based on the file pattern ( *.sql)
7. What happens if i pause or close the pgit add command ? Need its handling
8. Update the pgit commit message to also include the files/folders metadata ( at least no of files)
9. We should b able to update already added file or it should automatically handle this ( so if user has added a file to pgit , it should not come to git history and also should b always up to date in the pgit/repos.) . 
    should b able to do with the help of git hooks . Need to double down on this though.
10. pgit remove command or re-add a already added file.
11. When adding only the relative path works for now .


<!-- below is the gitignore . Move this to git info -->
# Private Git Tracking (auto-generated)
.git-private
.private-storage
.private-config.json