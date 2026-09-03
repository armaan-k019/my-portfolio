#!/bin/bash
# setup-repos.sh
# Run this from /Users/armaank019/my-portfolio/demos-standalone/
# It copies each standalone demo to ~/demos-standalone/, inits git, and creates a public GitHub repo.

set -e

SRC_BASE="/Users/armaank019/my-portfolio/demos-standalone"
DST_BASE="/Users/armaank019/demos-standalone"
GH="/opt/homebrew/bin/gh"

DEMOS=(
  "rho-drift-detection"
  "corgi-model-risk-monitor"
  "harper-coverage-profiler"
  "whop-page-roaster"
  "weave-noshow-sequencer"
  "sideshift-route-optimizer"
  "wisprflow-asl"
  "erebor-debanking-scorer"
  "revyl-test-auditor"
  "retell-humanity-detector"
  "greptile-pr-auditor"
)

mkdir -p "$DST_BASE"

for DEMO in "${DEMOS[@]}"; do
  echo ""
  echo "========================================="
  echo "Setting up: $DEMO"
  echo "========================================="

  SRC="$SRC_BASE/$DEMO"
  DST="$DST_BASE/$DEMO"

  # Copy to destination
  if [ -d "$DST" ]; then
    echo "  Destination already exists, removing..."
    rm -rf "$DST"
  fi
  cp -r "$SRC" "$DST"

  # Init git
  cd "$DST"
  git init
  git add .
  git commit -m "Initial commit: standalone Next.js app"

  # Create GitHub repo and push
  REPO_NAME="$DEMO"
  echo "  Creating GitHub repo: armaan-k019/$REPO_NAME"
  "$GH" repo create "armaan-k019/$REPO_NAME" --public --source=. --remote=origin --push

  echo "  Done: https://github.com/armaan-k019/$REPO_NAME"
done

echo ""
echo "All done! Repos created:"
for DEMO in "${DEMOS[@]}"; do
  echo "  https://github.com/armaan-k019/$DEMO"
done
