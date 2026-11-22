#!/bin/sh
# SessionStart hook: bring the current branch up to date before work starts.
# Never fails the session: it only reports what happened.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

if ! git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  echo "git: branch $(git branch --show-current) has no upstream, skipped pull."
  exit 0
fi

if out=$(git pull --rebase --autostash 2>&1); then
  echo "git pull --rebase: $(echo "$out" | tail -1)"
else
  echo "git pull --rebase FAILED, resolve before editing:"
  echo "$out" | tail -5
fi
exit 0
