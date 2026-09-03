#!/usr/bin/env bash
# Run from your terminal (NOT Claude Code) to push all 9 standalone demo repos:
#
#   bash /Users/armaank019/my-portfolio/demos-standalone/do-git-setup.sh
#
# What it does:
#   1. Copies each demo from my-portfolio/demos-standalone/ to ~/demos-standalone/
#   2. git init → commit → force-push to armaan-k019/<repo>
#
# Prerequisites: gh CLI authenticated (gh auth status), git configured.

set -e

SRC_BASE="/Users/armaank019/my-portfolio/demos-standalone"
DST_BASE="$HOME/demos-standalone"

declare -A MESSAGES
MESSAGES[rho-drift-detection]="Initial commit: Rho Drift Detection -- built for Rho Technologies"
MESSAGES[corgi-model-risk-monitor]="Initial commit: AI Model Risk Monitor -- built for Corgi Insurance"
MESSAGES[harper-coverage-profiler]="Initial commit: Business Coverage Profiler -- built for Harper Insurance"
MESSAGES[whop-page-roaster]="Initial commit: Page Roaster -- built for Whop"
MESSAGES[weave-noshow-sequencer]="Initial commit: No-Show Recovery Sequencer -- built for Weave"
MESSAGES[sideshift-route-optimizer]="Initial commit: Swap Route Optimizer -- built for SideShift.ai"
MESSAGES[wisprflow-asl]="Initial commit: ASL-to-text bridge concept -- built for Wispr Flow"
MESSAGES[erebor-debanking-scorer]="Initial commit: De-banking Risk Scorer -- built for Erebor"

DEMOS=(
  rho-drift-detection
  corgi-model-risk-monitor
  harper-coverage-profiler
  whop-page-roaster
  weave-noshow-sequencer
  sideshift-route-optimizer
  wisprflow-asl
  erebor-debanking-scorer
)

mkdir -p "$DST_BASE"

for DEMO in "${DEMOS[@]}"; do
  echo "========================================="
  echo "Setting up: $DEMO"
  echo "========================================="

  SRC="$SRC_BASE/$DEMO"
  DST="$DST_BASE/$DEMO"

  # Clean copy of source to destination
  rm -rf "$DST"
  cp -r "$SRC" "$DST"

  # Init git repo
  git -C "$DST" init -b main
  git -C "$DST" add .
  git -C "$DST" commit -m "${MESSAGES[$DEMO]}"

  # Set remote and force-push (handles rho which already has wrong content)
  if git -C "$DST" remote get-url origin &>/dev/null 2>&1; then
    git -C "$DST" remote set-url origin "https://github.com/armaan-k019/$DEMO.git"
  else
    git -C "$DST" remote add origin "https://github.com/armaan-k019/$DEMO.git"
  fi

  git -C "$DST" push -u origin main --force
  echo "  Pushed: https://github.com/armaan-k019/$DEMO"
  echo ""
done

echo "============================="
echo "All 9 repos pushed:"
for DEMO in "${DEMOS[@]}"; do
  echo "  https://github.com/armaan-k019/$DEMO"
done
echo ""
echo "Cleanup: remove the 2 temporary commits from your local portfolio repo:"
echo "  cd /Users/armaank019/my-portfolio"
echo "  git reset --hard b462dce"
