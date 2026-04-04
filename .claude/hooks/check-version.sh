#!/bin/bash
# Stop hook: block if v3/src/ has changes but version.ts is not updated.
# Checks both staged and unstaged changes in the working tree.

cd "$(git rev-parse --show-toplevel)" 2>/dev/null || exit 0

# List modified files (staged + unstaged) under v3/src/
changed=$(git diff --name-only HEAD -- v3/src/ 2>/dev/null)
if [ -z "$changed" ]; then
  # Also check staged-only changes
  changed=$(git diff --name-only --cached -- v3/src/ 2>/dev/null)
fi

if [ -z "$changed" ]; then
  exit 0  # No v3/src/ changes, nothing to check
fi

# Check if version.ts is among the changed files
if echo "$changed" | grep -q "v3/src/version.ts"; then
  exit 0  # version.ts was updated
fi

# Also check if version.ts has unstaged changes
if git diff --name-only -- v3/src/version.ts 2>/dev/null | grep -q .; then
  exit 0
fi

echo "v3/src/ に変更がありますが v3/src/version.ts が更新されていません。version.ts の GAME_VERSION と package.json の version を更新してください。" >&2
exit 2
