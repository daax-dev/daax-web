

When you loop at the given interval - check in to ensure the goal is on track - make sure each iteration of the loop only has the needed context - when wrapping up a session (or goal) or about to need to compact - focus on keeping the same objective and leave a good "Hemingway bridge" of how to best start again.  with updated specific feedback so we wont get the same result.  log all decisions + key things to .logs/ in jsonl format (always)
always use git worktree / branch name that contains the GH issue # - do not ever rename a brach -

coding - only update whats needed (be a minimalist), don't add anything not specifically asked for, do not just rewrite code unless completely necessary, everything must be tested for input sanitization, and end to end - with a focus on any interface contracts.  unit tests complex things (not for the sake of testing).  Use idiomatic coding for the given language.

always perform 3 rounds of review from an adversarial objective agent (using codex, non anthropic) - make sure it has write access, and gives honest & pragmatic feedback. (fix them before next round)

perform a round of premordem - completely evaluating what could go wrong, think of operational resilience and edge cases - then fix.

(deploy locally and to [daax.galway.poley.dev](https://daax.galway.poley.dev/) which runs on 4200 4201 when ready for PR), and validate locally (using the means necessarily, make tests repeatable not agentic)

when ready for a PR - submit PR - wait for copilot review - (trigger it if needed) - when it comes back close the PR - use same branch and fix and repeat this process - do not ever change branch names, do not ever update a branch with an open PR, do not ever update a PR - always a new one.
this process repeats until GitHub copilot explicitly says - "generated no issues" then we are done and you can merge to main.   - a PR must NEVER fail ANY CI or EVER have a merge conflict - if it does -wait for copilot feedback (then fix all).
