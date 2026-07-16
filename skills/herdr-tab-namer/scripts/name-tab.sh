#!/usr/bin/env bash
set -euo pipefail

debug() {
  if [[ "${HERDR_TAB_NAMER_DEBUG:-0}" == "1" ]]; then
    printf 'herdr-tab-namer: %s\n' "$*" >&2
  fi
}

# Never control a Herdr session from an unmanaged shell.
if [[ "${HERDR_ENV:-}" != "1" ]]; then
  debug "not running inside Herdr; skipped"
  exit 0
fi

tab_id="${HERDR_TAB_ID:-}"
if [[ -z "$tab_id" ]]; then
  debug "HERDR_TAB_ID is unavailable; skipped"
  exit 0
fi

if [[ -n "${HERDR_BIN_PATH:-}" && -x "${HERDR_BIN_PATH}" ]]; then
  herdr_bin="$HERDR_BIN_PATH"
elif herdr_bin="$(command -v herdr 2>/dev/null)" && [[ -n "$herdr_bin" ]]; then
  :
else
  debug "herdr binary is unavailable; skipped"
  exit 0
fi

task="$*"
if [[ -z "${task//[[:space:]]/}" ]]; then
  task="working"
fi

# Keep labels single-line and free of terminal control characters.
label="$({ printf '%s' "$task" \
  | LC_ALL=C tr '\000-\010\013\014\016-\037\177' ' ' \
  | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//'; } || true)"
[[ -n "$label" ]] || label="working"

max_length="${HERDR_TAB_NAMER_MAX_LENGTH:-48}"
if [[ ! "$max_length" =~ ^[0-9]+$ ]] || (( max_length < 8 || max_length > 120 )); then
  max_length=48
fi

if (( ${#label} > max_length )); then
  prefix_length=$((max_length - 1))
  label="${label:0:prefix_length}…"
fi

if ! response="$("$herdr_bin" tab rename "$tab_id" "$label" 2>&1)"; then
  printf 'herdr-tab-namer: unable to rename the current tab\n' >&2
  if [[ "${HERDR_TAB_NAMER_DEBUG:-0}" == "1" && -n "$response" ]]; then
    printf '%s\n' "$response" >&2
  fi
  exit 1
fi

debug "renamed current tab"
printf '%s\n' "$label"
