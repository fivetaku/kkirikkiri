#!/bin/bash
#
# run-cli.sh — 끼리끼리 외부 CLI 러너 (council 패턴)
#
# Subcommands:
#   run-cli.sh start --provider codex --prompt-file task.md    # returns JOB_DIR
#   run-cli.sh status [--text] JOB_DIR                         # poll progress
#   run-cli.sh wait JOB_DIR                                    # block until done
#   run-cli.sh results [--json] JOB_DIR                        # print output
#   run-cli.sh stop JOB_DIR                                    # kill running CLI
#   run-cli.sh clean JOB_DIR                                   # remove job directory
#   run-cli.sh check codex|gemini                              # check CLI installed
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOB_SCRIPT="$SCRIPT_DIR/run-cli-job.js"

if [ $# -eq 0 ]; then
  echo "Usage: run-cli.sh <start|status|wait|results|stop|clean|check> [options]"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required." >&2
  exit 127
fi

exec node "$JOB_SCRIPT" "$@"
