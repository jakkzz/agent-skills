#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_root="${AGENT_SKILLS_DIR:-$HOME/.agents/skills}"
mkdir -p "$target_root"

for source in "$repo_root"/skills/*; do
  [[ -d "$source" && -f "$source/SKILL.md" ]] || continue
  name="$(basename "$source")"
  target="$target_root/$name"

  if [[ -L "$target" && "$(readlink "$target")" == "$source" ]]; then
    printf 'already linked: %s\n' "$name"
  elif [[ -e "$target" || -L "$target" ]]; then
    printf 'conflict: %s already exists; left unchanged\n' "$target" >&2
    exit 1
  else
    ln -s "$source" "$target"
    printf 'linked: %s -> %s\n' "$target" "$source"
  fi
done
