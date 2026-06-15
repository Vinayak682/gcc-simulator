#!/bin/bash
# NayakLabs — Push gcc-simulator to GitHub
# Run from Terminal:
#   chmod +x push-to-github.sh && ./push-to-github.sh
#
# You need a GitHub PAT with 'repo' scope:
#   https://github.com/settings/tokens/new

set -e

REPO_NAME="gcc-simulator"
GITHUB_USER="Vinayak682"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  NayakLabs — gcc-simulator → GitHub      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

read -s -p "Paste your GitHub Personal Access Token: " GITHUB_TOKEN
echo ""

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ No token provided. Exiting."
  exit 1
fi

echo ""
echo "→ Creating GitHub repository '$REPO_NAME'..."

HTTP_STATUS=$(curl -s -o /tmp/gh_response.json -w "%{http_code}" \
  -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/user/repos \
  -d "{
    \"name\": \"$REPO_NAME\",
    \"description\": \"GCC Business Simulator — Next.js 15 · Supabase · Google Gemini · 8 AI agents. by NayakLabs.\",
    \"private\": false,
    \"auto_init\": false,
    \"topics\": [\"nextjs\", \"supabase\", \"gemini\", \"ai-agents\", \"business-simulator\", \"gcc\", \"dubai\"]
  }")

if [ "$HTTP_STATUS" = "201" ]; then
  echo "✅ Repository created: https://github.com/$GITHUB_USER/$REPO_NAME"
elif [ "$HTTP_STATUS" = "422" ]; then
  echo "ℹ️  Repository already exists — pushing to it..."
else
  echo "❌ Failed to create repo (HTTP $HTTP_STATUS):"
  cat /tmp/gh_response.json
  exit 1
fi

# Clean stale git locks
rm -f .git/index.lock .git/MERGE_HEAD 2>/dev/null || true

echo ""
echo "→ Initialising git..."
git init
git config user.email "vinayakbhadani1998@gmail.com"
git config user.name "Vinayak682"
git checkout -b main 2>/dev/null || git checkout main

echo "→ Staging all files..."
git add -A

echo "→ Committing..."
git commit -m "🚀 NayakLabs — GCC Business Simulator v1.0

- Next.js 15 App Router, Supabase, Google Gemini (free tier)
- 8 autonomous AI agents: Tariq, Zara, Omar, Nadia, Faris, Leila, Priya, Board
- GCC-authentic: Ramadan cycles, DFM compliance, Emiratization pressure
- 3-layer share price model: ops + sentiment + market events
- Auto org/team provisioning on login
- S&OP cycles, expansion board memos, decision cards

by NayakLabs · github.com/Vinayak682" 2>/dev/null || echo "(nothing new to commit)"

echo ""
echo "→ Pushing to GitHub..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://$GITHUB_USER:$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git"
git push -u origin main --force

# Strip token from remote URL immediately
git remote set-url origin "https://github.com/$GITHUB_USER/$REPO_NAME.git"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Live at:                                             ║"
echo "║  https://github.com/$GITHUB_USER/$REPO_NAME    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
