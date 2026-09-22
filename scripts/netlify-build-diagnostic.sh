#!/usr/bin/env bash
set -u

report="netlify-build-diagnostic.txt"
: > "$report"

run_step() {
  label="$1"
  shift
  printf 'RUNNING: %s\n' "$label" > "$report"
  "$@" >/tmp/ff-netlify-diagnostic.log 2>&1
  code=$?
  if [ "$code" -ne 0 ]; then
    printf 'FAIL: %s\nEXIT_CODE: %s\n' "$label" "$code" > "$report"
    if [ "$label" = "validate:identity" ]; then
      grep '^FAIL |' /tmp/ff-netlify-diagnostic.log >> "$report" || true
    fi
    exit 0
  fi
}

run_shell_step() {
  label="$1"
  command="$2"
  printf 'RUNNING: %s\n' "$label" > "$report"
  bash -lc "$command" >/tmp/ff-netlify-diagnostic.log 2>&1
  code=$?
  if [ "$code" -ne 0 ]; then
    printf 'FAIL: %s\nEXIT_CODE: %s\n' "$label" "$code" > "$report"
    exit 0
  fi
}

run_shell_step "build:identity" "npm run build:identity"
run_shell_step "validate:identity" "npm run validate:identity"
run_shell_step "inject-beta-invite-terms-gate" "node scripts/inject-beta-invite-terms-gate.mjs"
run_shell_step "validate-netlify-rule-budget" "node scripts/validate-netlify-rule-budget.mjs"
run_shell_step "build:paddle-live" "npm run build:paddle-live"
run_shell_step "validate:paddle-live-payment-link" "npm run validate:paddle-live-payment-link"
run_shell_step "validate:account-lifecycle" "npm run validate:account-lifecycle"
run_shell_step "validate:customer-intelligence" "npm run validate:customer-intelligence"
run_shell_step "validate:card-intelligence-result-priority" "npm run validate:card-intelligence-result-priority"
run_shell_step "validate:card-intelligence-detail-route" "npm run validate:card-intelligence-detail-route"
run_shell_step "validate:customer-dashboard" "npm run validate:customer-dashboard"
run_shell_step "validate:production-prototype-isolation" "npm run validate:production-prototype-isolation"
run_shell_step "validate:production-route-authority" "npm run validate:production-route-authority"
run_shell_step "validate-native-evidence-links" "node scripts/validate-native-evidence-links.mjs"
run_shell_step "validate:customer-compare" "npm run validate:customer-compare"
run_shell_step "validate:customer-management" "npm run validate:customer-management"
run_shell_step "validate:customer-portfolio" "npm run validate:customer-portfolio"
run_shell_step "validate:customer-lifecycle" "npm run validate:customer-lifecycle"
run_shell_step "validate:customer-export" "npm run validate:customer-export"
run_shell_step "validate:customer-discovery" "npm run validate:customer-discovery"
run_shell_step "validate:market-view" "npm run validate:market-view"
run_shell_step "validate:cardsight-evidence-visibility" "npm run validate:cardsight-evidence-visibility"
run_shell_step "validate:price-intelligence" "npm run validate:price-intelligence"
run_shell_step "validate:customer-entitlements" "npm run validate:customer-entitlements"
run_shell_step "validate:evaluation-quota-boundary" "npm run validate:evaluation-quota-boundary"
run_shell_step "validate:private-beta-operations-boundary" "npm run validate:private-beta-operations-boundary"
run_shell_step "validate:paddle-customer-checkout" "npm run validate:paddle-customer-checkout"
run_shell_step "validate:paddle-customer-portal" "npm run validate:paddle-customer-portal"
run_shell_step "validate:paddle-webhook-gateway-boundary" "npm run validate:paddle-webhook-gateway-boundary"
run_shell_step "validate:private-beta" "npm run validate:private-beta"
run_shell_step "validate:homepage-progression" "npm run validate:homepage-progression"
run_shell_step "validate:beta-acquisition" "npm run validate:beta-acquisition"
run_shell_step "validate:beta-operator" "npm run validate:beta-operator"
run_shell_step "validate-founder-selected-beta" "node scripts/validate-founder-selected-beta.mjs"
run_shell_step "build:marketing" "npm run build:marketing"
run_shell_step "validate:marketing" "npm run validate:marketing"
run_shell_step "build-assets" "node scripts/build-assets.js"
run_shell_step "validate-brand-assets" "node scripts/validate-brand-assets.js"
run_shell_step "build:deploy-manifest" "npm run build:deploy-manifest"
run_shell_step "validate:deploy-manifest" "npm run validate:deploy-manifest"

printf 'PASS: all Netlify build steps completed\n' > "$report"
exit 0
