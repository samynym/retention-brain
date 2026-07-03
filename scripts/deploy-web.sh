#!/usr/bin/env bash
#
# Deploy the onboarding frontend to Vercel production and repoint the stable
# alias -- in one command.
#
# Why this script exists (two Vercel gotchas this flow hits every time):
#   1. retentionbrain.vercel.app is a manual alias (created with `vercel alias
#      set`), so it does NOT auto-follow a `--prod` deploy -- it has to be
#      repointed at the new deployment each time.
#   2. `vite build` wipes apps/onboarding/dist, including the `.vercel` project
#      link, so the dist has to be re-linked before every deploy.
#
# Safety gates (per project deploy rules): typecheck + tests must pass first.
#
# Usage:  pnpm deploy:web        (from repo root)
#   or:   bash scripts/deploy-web.sh
set -euo pipefail

SCOPE="samynym-stripe"
PROJECT="retention-brain"
ALIAS="retentionbrain.vercel.app"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

echo "> typechecking onboarding..."
pnpm --filter @retention-brain/onboarding exec tsc --noEmit

echo "> running tests..."
pnpm test

echo "> building onboarding..."
pnpm --filter @retention-brain/onboarding build

cd apps/onboarding/dist
echo "> linking dist to ${PROJECT}..."
vercel link --yes --scope "${SCOPE}" --project "${PROJECT}" >/dev/null

echo "> deploying to production..."
DEPLOY="$(vercel deploy --prod --yes --scope "${SCOPE}" 2>/dev/null | grep -oE 'https://[a-z0-9.-]+\.vercel\.app' | tail -1)"
if [ -z "${DEPLOY}" ]; then
  echo "x could not determine the deployment URL -- alias NOT repointed" >&2
  exit 1
fi
echo "  deployed: ${DEPLOY}"

echo "> repointing ${ALIAS} to new deployment..."
vercel alias set "${DEPLOY}" "${ALIAS}" --scope "${SCOPE}"

echo "OK live: https://${ALIAS}"
