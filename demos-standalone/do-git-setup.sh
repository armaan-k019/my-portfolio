#!/usr/bin/env bash
# Run this script manually from your terminal:
#   bash /Users/armaank019/my-portfolio/demos-standalone/do-git-setup.sh
#
# It syncs all demos from my-portfolio/demos-standalone/ to ~/demos-standalone/,
# initializes git repos, and creates/pushes to GitHub repos under armaan-k019.

set -e

SRC_BASE="/Users/armaank019/my-portfolio/demos-standalone"
DST_BASE="/Users/armaank019/demos-standalone"
GH="/opt/homebrew/bin/gh"

DEMOS=(
  "rho-drift-detection"
  "corgi-model-risk-monitor"
  "athenahq-geo-intelligence"
  "harper-coverage-profiler"
  "whop-page-roaster"
  "weave-noshow-sequencer"
  "sideshift-route-optimizer"
  "wisprflow-asl"
  "erebor-debanking-scorer"
)

mkdir -p "$DST_BASE"

for DEMO in "${DEMOS[@]}"; do
  echo ""
  echo "========================================="
  echo "Setting up: $DEMO"
  echo "========================================="

  SRC="$SRC_BASE/$DEMO"
  DST="$DST_BASE/$DEMO"

  # Sync source to destination (exclude transform scripts from parent)
  echo "  Syncing files..."
  rsync -a --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='*.sh' \
    --exclude='*.py' \
    --exclude='*.mjs' \
    "$SRC/" "$DST/"

  # Init git if needed
  if [ ! -d "$DST/.git" ]; then
    echo "  Initializing git..."
    git -C "$DST" init
  fi

  # Stage and commit
  echo "  Committing..."
  git -C "$DST" add .
  git -C "$DST" diff --cached --quiet && echo "  No changes to commit" || git -C "$DST" commit -m "Initial commit: standalone Next.js app"

  # Create GitHub repo if it doesn't exist, then push
  echo "  Creating/pushing GitHub repo: armaan-k019/$DEMO"
  if "$GH" repo view "armaan-k019/$DEMO" &>/dev/null; then
    echo "  Repo already exists, pushing..."
    git -C "$DST" remote get-url origin &>/dev/null || git -C "$DST" remote add origin "https://github.com/armaan-k019/$DEMO.git"
    git -C "$DST" push -u origin main 2>/dev/null || git -C "$DST" push -u origin master 2>/dev/null || true
  else
    "$GH" repo create "armaan-k019/$DEMO" --public --source="$DST" --remote=origin --push
  fi

  echo "  Done: https://github.com/armaan-k019/$DEMO"
done

echo ""
echo "All repos ready:"
for DEMO in "${DEMOS[@]}"; do
  echo "  https://github.com/armaan-k019/$DEMO"
done
