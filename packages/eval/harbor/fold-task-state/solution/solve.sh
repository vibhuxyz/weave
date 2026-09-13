#!/bin/bash
set -euo pipefail

# The oracle solution — copies the real implementation over the stub.
# Run with the task working directory (/app) as cwd; sibling files here
# (state.ts) are located relative to this script, not cwd, so the copy
# works regardless of where solve.sh itself was placed.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$DIR/state.ts" src/state.ts
