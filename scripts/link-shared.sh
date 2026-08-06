#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_root="${AGENT_SKILLS_DIR:-$HOME/.agents/skills}"
conflict_names=""

# Refuse real files and directories before changing any link.
for source in "$repo_root"/skills/*; do
  [[ -d "$source" && -f "$source/SKILL.md" ]] || continue
  name="$(basename "$source")"
  target="$target_root/$name"
  if [[ -e "$target" && ! -L "$target" ]]; then
    conflict_names="${conflict_names}${conflict_names:+, }$name"
  fi
done

if [[ -n "$conflict_names" ]]; then
  printf 'conflict: real files or directories block symlinks: %s\n' "$conflict_names" >&2
  exit 1
fi

mkdir -p "$target_root"
for source in "$repo_root"/skills/*; do
  [[ -d "$source" && -f "$source/SKILL.md" ]] || continue
  name="$(basename "$source")"
  target="$target_root/$name"

  if [[ -L "$target" && "$(readlink "$target")" == "$source" ]]; then
    printf 'already linked: %s\n' "$name"
  elif [[ -L "$target" ]]; then
    rm "$target"
    ln -s "$source" "$target"
    printf 'repaired: %s -> %s\n' "$target" "$source"
  else
    ln -s "$source" "$target"
    printf 'linked: %s -> %s\n' "$target" "$source"
  fi
done
