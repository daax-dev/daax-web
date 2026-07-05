#!/usr/bin/env bash
# Install the daax-dev org ARC runner scale set (namespace arc-runners, release daax-arc).
# Prereq: the ARC controller is already installed in arc-systems (helm release "arc").
# Prereq: a GitHub App exists on daax-dev with Org "Self-hosted runners: Read and write",
#         installed on the org — see docs/building/self-hosted-runners-runbook.md STEP 1.
#
# Usage:
#   APP_ID=123456 INSTALLATION_ID=7890123 APP_PEM=/path/to/daax-arc-runners.pem \
#     ./deploy/arc/install-scale-set.sh
#
# Idempotent-ish: re-running "helm upgrade --install" reconciles; the secret create is
# guarded so a re-run does not error if it already exists.
set -euo pipefail

: "${APP_ID:?set APP_ID (GitHub App ID, from the App settings page)}"
: "${INSTALLATION_ID:?set INSTALLATION_ID (from the org installations URL)}"
: "${APP_PEM:?set APP_PEM (path to the App private-key .pem file)}"
[[ -f "$APP_PEM" ]] || { echo "APP_PEM file not found: $APP_PEM" >&2; exit 1; }

NS=arc-runners
SECRET=daax-arc-github-app
RELEASE=daax-arc
VALUES="$(dirname "$0")/daax-arc-values.yaml"
CHART=oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set

echo "==> namespace $NS"
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -

echo "==> secret $SECRET (App auth)"
kubectl create secret generic "$SECRET" \
  --namespace="$NS" \
  --from-literal=github_app_id="$APP_ID" \
  --from-literal=github_app_installation_id="$INSTALLATION_ID" \
  --from-file=github_app_private_key="$APP_PEM" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> helm upgrade --install $RELEASE"
helm upgrade --install "$RELEASE" "$CHART" \
  --namespace "$NS" \
  --values "$VALUES"

echo "==> verify"
kubectl get autoscalingrunnerset -n "$NS"
kubectl get pods -n arc-systems | grep -E 'listener|NAME' || true
echo "Done. Org check: daax-dev → Settings → Actions → Runners → scale set 'daax-arc' idle at 0."
