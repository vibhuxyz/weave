#!/bin/bash
set -uo pipefail

# Copied to /tests/test.sh and run with cwd = the task working directory
# (/app). node/npm are already in the image (see environment/Dockerfile).

mkdir -p /logs/verifier
GRADER_DIR="/app/__grader__"
mkdir -p "$GRADER_DIR"
cp /tests/correctness.test.ts /tests/purity.test.ts /tests/robustness.test.ts "$GRADER_DIR/"

cd /app

# Typecheck first — a solution that doesn't compile gets zero regardless of
# what the runtime tests happen to do with a half-written module.
if ! npm run --silent typecheck; then
  echo '{"typecheck": 0}' > /logs/verifier/rewards.json
  echo 0 > /logs/verifier/reward.txt
  exit 0
fi

run_weighted() {
  local name="$1" weight="$2" file="$3"
  if node --experimental-strip-types --test "$file" > "/logs/verifier/${name}.log" 2>&1; then
    echo "$weight"
  else
    echo "0"
  fi
}

CORRECTNESS=$(run_weighted correctness 0.6 "$GRADER_DIR/correctness.test.ts")
PURITY=$(run_weighted purity 0.2 "$GRADER_DIR/purity.test.ts")
ROBUSTNESS=$(run_weighted robustness 0.2 "$GRADER_DIR/robustness.test.ts")

TOTAL=$(node -e "console.log($CORRECTNESS + $PURITY + $ROBUSTNESS)")

cat > /logs/verifier/rewards.json << EOF
{"correctness": $CORRECTNESS, "purity": $PURITY, "robustness": $ROBUSTNESS, "total": $TOTAL}
EOF
echo "$TOTAL" > /logs/verifier/reward.txt
