#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s <status|update> [repository]\n' "$(basename "$0")" >&2
  exit 64
}

fail() {
  printf 'error: %s\n' "$1" >&2
  exit "${2:-1}"
}

action="${1:-}"
repo="${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
target_root="${AGENT_SKILLS_DIR:-$HOME/.agents/skills}"
pi_skill_root="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills"
expected_https="https://github.com/jakkzz/agent-skills"
expected_ssh="git@github.com:jakkzz/agent-skills"

[[ "$action" == "status" || "$action" == "update" ]] || usage
[[ -d "$repo" ]] || fail "repository directory is missing: $repo"
git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1 || \
  fail "not a Git worktree: $repo"
[[ -d "$repo/skills" ]] || fail "skills directory is missing: $repo/skills"

repo="$(cd "$repo" && pwd)"
remote="$(git -C "$repo" config --get remote.origin.url 2>/dev/null || true)"
normalized_remote="${remote%.git}"
if [[ "$normalized_remote" != "$expected_https" && "$normalized_remote" != "$expected_ssh" ]]; then
  fail "origin is not the approved jakkzz/agent-skills repository"
fi

branch="$(git -C "$repo" branch --show-current)"
[[ "$branch" == "main" ]] || fail "expected branch main; found ${branch:-detached HEAD}"

export GIT_TERMINAL_PROMPT=0
if [[ -z "${GIT_SSH_COMMAND:-}" ]]; then
  export GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10"
fi

current_skill_names() {
  local source
  for source in "$repo"/skills/*; do
    [[ -d "$source" && -f "$source/SKILL.md" ]] || continue
    basename "$source"
  done
}

remote_skill_names() {
  git -C "$repo" ls-tree -r --name-only origin/main -- skills 2>/dev/null |
    awk -F/ '$1 == "skills" && NF == 3 && $3 == "SKILL.md" { print $2 }'
}

link_conflicts() {
  local name target conflicts=""
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    target="$target_root/$name"
    if [[ -e "$target" && ! -L "$target" ]]; then
      conflicts="${conflicts}${conflicts:+, }$name"
    fi
  done
  printf '%s' "$conflicts"
}

pi_shadows() {
  local name source target shadows=""
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    source="$repo/skills/$name"
    target="$pi_skill_root/$name"
    if [[ -L "$target" && "$(readlink "$target")" == "$source" ]]; then
      continue
    fi
    if [[ -e "$target" || -L "$target" ]]; then
      shadows="${shadows}${shadows:+, }$name"
    fi
  done
  printf '%s' "$shadows"
}

link_status() {
  local total=0 linked=0 missing=0 wrong=0 conflicts=0 source name target
  for source in "$repo"/skills/*; do
    [[ -d "$source" && -f "$source/SKILL.md" ]] || continue
    total=$((total + 1))
    name="$(basename "$source")"
    target="$target_root/$name"
    if [[ -L "$target" ]]; then
      if [[ "$(readlink "$target")" == "$source" ]]; then
        linked=$((linked + 1))
      else
        wrong=$((wrong + 1))
      fi
    elif [[ -e "$target" ]]; then
      conflicts=$((conflicts + 1))
    else
      missing=$((missing + 1))
    fi
  done
  printf 'links=%d/%d missing=%d wrong=%d conflicts=%d\n' \
    "$linked" "$total" "$missing" "$wrong" "$conflicts"
}

shadow_status() {
  local names shadows count=0
  names="$(current_skill_names | sort -u)"
  shadows="$(printf '%s\n' "$names" | pi_shadows)"
  if [[ -n "$shadows" ]]; then
    count="$(printf '%s' "$shadows" | awk -F', ' '{print NF}')"
  fi
  printf 'pi_shadows=%d%s\n' "$count" "${shadows:+ names=$shadows}"
}

if [[ "$action" == "status" ]]; then
  remote_ref="fresh"
  if ! git -C "$repo" fetch --quiet origin main; then
    remote_ref="cached"
  fi
  dirty="no"
  if [[ -n "$(git -C "$repo" status --porcelain)" ]]; then
    dirty="yes"
  fi
  counts="$(git -C "$repo" rev-list --left-right --count HEAD...origin/main 2>/dev/null || printf 'unknown unknown')"
  ahead="$(printf '%s' "$counts" | awk '{print $1}')"
  behind="$(printf '%s' "$counts" | awk '{print $2}')"
  printf 'branch=%s dirty=%s ahead=%s behind=%s remote_ref=%s commit=%s\n' \
    "$branch" "$dirty" "$ahead" "$behind" "$remote_ref" "$(git -C "$repo" rev-parse --short HEAD)"
  link_status
  shadow_status
  exit 0
fi

[[ -z "$(git -C "$repo" status --porcelain)" ]] || \
  fail "working tree has uncommitted changes; commit or discard them first"

# Check the current tree before even updating remote-tracking metadata.
current_names="$(current_skill_names | sort -u)"
conflicts="$(printf '%s\n' "$current_names" | link_conflicts)"
[[ -z "$conflicts" ]] || fail "real files or directories block symlinks: $conflicts"
shadows="$(printf '%s\n' "$current_names" | pi_shadows)"
[[ -z "$shadows" ]] || \
  fail "Pi top-level skills shadow this package: $shadows; move them aside or replace them with links to this checkout"

git -C "$repo" fetch --quiet origin main
counts="$(git -C "$repo" rev-list --left-right --count HEAD...origin/main)"
ahead="$(printf '%s' "$counts" | awk '{print $1}')"
behind="$(printf '%s' "$counts" | awk '{print $2}')"
operation="already synchronized"

if (( ahead > 0 && behind > 0 )); then
  fail "local and origin/main have diverged; resolve manually"
fi

# Include skills that exist only in the fetched remote before changing HEAD or pushing.
all_names="$({ printf '%s\n' "$current_names"; remote_skill_names; } | sed '/^$/d' | sort -u)"
conflicts="$(printf '%s\n' "$all_names" | link_conflicts)"
[[ -z "$conflicts" ]] || fail "real files or directories block symlinks: $conflicts"
shadows="$(printf '%s\n' "$all_names" | pi_shadows)"
[[ -z "$shadows" ]] || \
  fail "Pi top-level skills shadow this package: $shadows; move them aside or replace them with links to this checkout"

if (( behind > 0 )); then
  git -C "$repo" merge --ff-only --quiet origin/main
  operation="pulled $behind commit(s)"
elif (( ahead > 0 )); then
  # Push the exact URL that passed validation; ignore any remote.origin.pushurl override.
  git -C "$repo" push --quiet "$remote" HEAD:main
  operation="pushed $ahead commit(s)"
fi

if ! link_output="$("$repo/scripts/link-shared.sh" 2>&1)"; then
  printf 'partial: %s; Git synchronization completed but link reconciliation failed\n%s\n' \
    "$operation" "$link_output" >&2
  exit 75
fi
created="$(printf '%s\n' "$link_output" | grep -c '^linked:' || true)"
repaired="$(printf '%s\n' "$link_output" | grep -c '^repaired:' || true)"

printf '%s; created=%d repaired=%d; commit=%s\n' \
  "$operation" "$created" "$repaired" "$(git -C "$repo" rev-parse --short HEAD)"
link_status
shadow_status
