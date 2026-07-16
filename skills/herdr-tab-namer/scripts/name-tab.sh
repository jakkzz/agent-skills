#!/usr/bin/env bash
set -euo pipefail

debug() {
  if [[ "${HERDR_TAB_NAMER_DEBUG:-0}" == "1" ]]; then
    printf 'herdr-tab-namer: %s\n' "$*" >&2
  fi
}

sanitize_label_part() {
  { printf '%s' "$1" \
    | LC_ALL=C tr '\000-\010\013\014\016-\037\177' ' ' \
    | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//'; } || true
}

extract_workspace_label() {
  local json="$1"

  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$json" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    result = data.get("result", {})
    workspace = result.get("workspace", result)
    label = workspace.get("label", "")
    if isinstance(label, str):
        sys.stdout.write(label)
except Exception:
    raise SystemExit(1)
'
    return
  fi

  if command -v node >/dev/null 2>&1; then
    printf '%s' "$json" | node -e '
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input);
    const result = data.result ?? {};
    const workspace = result.workspace ?? result;
    if (typeof workspace.label === "string") process.stdout.write(workspace.label);
  } catch {
    process.exitCode = 1;
  }
});
'
    return
  fi

  return 1
}

# Never control a Herdr session from an unmanaged shell.
if [[ "${HERDR_ENV:-}" != "1" ]]; then
  debug "not running inside Herdr; skipped"
  exit 0
fi

tab_id="${HERDR_TAB_ID:-}"
workspace_id="${HERDR_WORKSPACE_ID:-}"
if [[ -z "$tab_id" || -z "$workspace_id" ]]; then
  debug "Herdr tab/workspace context is unavailable; skipped"
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

task="$(sanitize_label_part "$*")"
[[ -n "$task" ]] || task="working"

workspace_json=""
workspace=""
if workspace_json="$("$herdr_bin" workspace get "$workspace_id" 2>/dev/null)"; then
  workspace="$(extract_workspace_label "$workspace_json" 2>/dev/null || true)"
fi
workspace="$(sanitize_label_part "$workspace")"
if [[ -z "$workspace" ]]; then
  workspace="$(sanitize_label_part "$(basename "${PWD:-workspace}")")"
fi
[[ -n "$workspace" ]] || workspace="workspace"

max_length="${HERDR_TAB_NAMER_MAX_LENGTH:-48}"
if [[ ! "$max_length" =~ ^[0-9]+$ ]] || (( max_length < 16 || max_length > 120 )); then
  max_length=48
fi

separator=" - "
minimum_task_length=8
maximum_workspace_length=$((max_length - ${#separator} - minimum_task_length))
if (( ${#workspace} > maximum_workspace_length )); then
  workspace_prefix_length=$((maximum_workspace_length - 1))
  workspace="${workspace:0:workspace_prefix_length}…"
fi

available_task_length=$((max_length - ${#workspace} - ${#separator}))
if (( ${#task} > available_task_length )); then
  task_prefix_length=$((available_task_length - 1))
  task="${task:0:task_prefix_length}…"
fi

label="${workspace}${separator}${task}"

if ! response="$("$herdr_bin" tab rename "$tab_id" "$label" 2>&1)"; then
  printf 'herdr-tab-namer: unable to rename the current tab\n' >&2
  if [[ "${HERDR_TAB_NAMER_DEBUG:-0}" == "1" && -n "$response" ]]; then
    printf '%s\n' "$response" >&2
  fi
  exit 1
fi

debug "renamed current tab"
printf '%s\n' "$label"
