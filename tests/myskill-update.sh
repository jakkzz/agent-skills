#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="$root/scripts/myskill-update.sh"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/myskill-test.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

export GIT_CONFIG_GLOBAL="$tmp/gitconfig"
export GIT_CONFIG_NOSYSTEM=1
export AGENT_SKILLS_DIR="$tmp/links"
export PI_CODING_AGENT_DIR="$tmp/pi"
git config --global user.name "myskill test"
git config --global user.email "myskill@example.invalid"
git config --global init.defaultBranch main
git config --global "url.file://$tmp/remote.git.insteadOf" "https://github.com/jakkzz/agent-skills.git"

git init --bare --quiet "$tmp/remote.git"
git init --quiet "$tmp/seed"
mkdir -p "$tmp/seed/scripts" "$tmp/seed/skills/alpha" "$tmp/seed/skills/thai-contextual-editor"
cp "$root/scripts/link-shared.sh" "$tmp/seed/scripts/link-shared.sh"
chmod +x "$tmp/seed/scripts/link-shared.sh"
printf '%s\n' '---' 'name: alpha' 'description: test' '---' > "$tmp/seed/skills/alpha/SKILL.md"
printf '%s\n' '---' 'name: thai-contextual-editor' 'description: test' '---' > "$tmp/seed/skills/thai-contextual-editor/SKILL.md"
git -C "$tmp/seed" add .
git -C "$tmp/seed" commit --quiet -m seed
git -C "$tmp/seed" remote add origin https://github.com/jakkzz/agent-skills.git
git -C "$tmp/seed" push --quiet -u origin main

git clone --quiet https://github.com/jakkzz/agent-skills.git "$tmp/work"

# Create missing links and report a clean synchronized checkout.
out="$($helper update "$tmp/work")"
grep -q 'created=2' <<<"$out"
[[ "$(readlink "$AGENT_SKILLS_DIR/thai-contextual-editor")" == "$tmp/work/skills/thai-contextual-editor" ]]

# Pull a remote-only commit.
printf 'remote\n' > "$tmp/seed/remote.txt"
git -C "$tmp/seed" add remote.txt
git -C "$tmp/seed" commit --quiet -m remote
git -C "$tmp/seed" push --quiet
out="$($helper update "$tmp/work")"
grep -q 'pulled 1 commit' <<<"$out"
[[ -f "$tmp/work/remote.txt" ]]

# Push a local-only commit to the validated URL, ignoring a malicious pushurl.
git init --bare --quiet "$tmp/malicious.git"
git -C "$tmp/work" remote set-url --add --push origin "file://$tmp/malicious.git"
printf 'local\n' > "$tmp/work/local.txt"
git -C "$tmp/work" add local.txt
git -C "$tmp/work" commit --quiet -m local
out="$($helper update "$tmp/work")"
grep -q 'pushed 1 commit' <<<"$out"
if git --git-dir="$tmp/malicious.git" rev-parse --verify refs/heads/main >/dev/null 2>&1; then
  echo 'validated push unexpectedly used remote.origin.pushurl' >&2
  exit 1
fi
git -C "$tmp/work" config --unset-all remote.origin.pushurl
git -C "$tmp/seed" pull --quiet --ff-only
[[ -f "$tmp/seed/local.txt" ]]

# Stop instead of reconciling diverged histories.
printf 'remote divergence\n' > "$tmp/seed/diverged.txt"
git -C "$tmp/seed" add diverged.txt
git -C "$tmp/seed" commit --quiet -m remote-divergence
git -C "$tmp/seed" push --quiet
printf 'local divergence\n' > "$tmp/work/diverged.txt"
git -C "$tmp/work" add diverged.txt
git -C "$tmp/work" commit --quiet -m local-divergence
if "$helper" update "$tmp/work" >"$tmp/diverged.out" 2>&1; then
  echo 'expected diverged checkout to fail' >&2
  exit 1
fi
grep -q 'have diverged' "$tmp/diverged.out"
git -C "$tmp/work" reset --quiet --hard origin/main

# Detect a new remote skill conflict before changing HEAD.
mkdir -p "$tmp/seed/skills/beta" "$AGENT_SKILLS_DIR/beta"
printf '%s\n' '---' 'name: beta' 'description: test' '---' > "$tmp/seed/skills/beta/SKILL.md"
git -C "$tmp/seed" add skills/beta/SKILL.md
git -C "$tmp/seed" commit --quiet -m remote-new-skill
git -C "$tmp/seed" push --quiet
before="$(git -C "$tmp/work" rev-parse HEAD)"
if "$helper" update "$tmp/work" >"$tmp/remote-conflict.out" 2>&1; then
  echo 'expected fetched remote skill conflict to fail' >&2
  exit 1
fi
grep -q 'block symlinks: beta' "$tmp/remote-conflict.out"
[[ "$(git -C "$tmp/work" rev-parse HEAD)" == "$before" ]]
rmdir "$AGENT_SKILLS_DIR/beta"
"$helper" update "$tmp/work" >/dev/null

# Detect Pi top-level skills that would shadow the package.
mkdir -p "$PI_CODING_AGENT_DIR/skills/alpha"
status_out="$($helper status "$tmp/work")"
grep -q 'remote_ref=fresh' <<<"$status_out"
grep -q 'pi_shadows=1 names=alpha' <<<"$status_out"
if "$helper" update "$tmp/work" >"$tmp/shadow.out" 2>&1; then
  echo 'expected Pi top-level shadow to fail' >&2
  exit 1
fi
grep -q 'top-level skills shadow' "$tmp/shadow.out"
rmdir "$PI_CODING_AGENT_DIR/skills/alpha"

# Accept a linked Git worktree and reject wrong branches and origins.
git -C "$tmp/work" switch --quiet -c holder
git -C "$tmp/work" worktree add --quiet "$tmp/linked-worktree" main
"$helper" status "$tmp/linked-worktree" >/dev/null
git -C "$tmp/work" worktree remove --force "$tmp/linked-worktree"
if "$helper" status "$tmp/work" >"$tmp/branch.out" 2>&1; then
  echo 'expected wrong branch to fail' >&2
  exit 1
fi
grep -q 'expected branch main' "$tmp/branch.out"
git -C "$tmp/work" switch --quiet main
git clone --quiet https://github.com/jakkzz/agent-skills.git "$tmp/wrong-origin"
git -C "$tmp/wrong-origin" remote set-url origin "file://$tmp/malicious.git"
if "$helper" status "$tmp/wrong-origin" >"$tmp/origin.out" 2>&1; then
  echo 'expected wrong origin to fail' >&2
  exit 1
fi
grep -q 'not the approved' "$tmp/origin.out"

# Repair a wrong symlink.
rm "$AGENT_SKILLS_DIR/alpha"
ln -s "$tmp/seed/skills/alpha" "$AGENT_SKILLS_DIR/alpha"
out="$($helper update "$tmp/work")"
grep -q 'repaired=1' <<<"$out"
[[ "$(readlink "$AGENT_SKILLS_DIR/alpha")" == "$tmp/work/skills/alpha" ]]

# Never overwrite a real file or directory.
rm "$AGENT_SKILLS_DIR/alpha"
mkdir "$AGENT_SKILLS_DIR/alpha"
if "$helper" update "$tmp/work" >"$tmp/conflict.out" 2>&1; then
  echo 'expected real-directory conflict to fail' >&2
  exit 1
fi
grep -q 'block symlinks: alpha' "$tmp/conflict.out"

# Never update a dirty checkout.
printf 'dirty\n' >> "$tmp/work/local.txt"
if "$helper" update "$tmp/work" >"$tmp/dirty.out" 2>&1; then
  echo 'expected dirty checkout to fail' >&2
  exit 1
fi
grep -q 'uncommitted changes' "$tmp/dirty.out"

printf 'myskill update tests passed\n'
