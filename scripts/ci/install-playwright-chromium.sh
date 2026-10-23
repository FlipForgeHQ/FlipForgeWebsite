#!/usr/bin/env bash
# Installs Playwright and Chromium for browser audits in CI.
#
# Why this exists: every browser workflow used to run
#   npm install playwright@1.55.0 && npx playwright install --with-deps chromium
# That step normally takes ~20 seconds but sometimes stalled for 10+ minutes
# on a network fetch (package registry, browser download, or apt mirrors) and
# then ran the job out of time before any test executed.
#
# What this does instead:
#   1. Every network step has its own time limit and is retried, so one stalled
#      connection costs minutes, not the whole job.
#   2. apt is only used when Chromium actually cannot start. GitHub's Ubuntu
#      runner images normally ship the libraries Chromium needs, so the usual
#      path skips apt entirely.
#   3. It finishes by launching Chromium once, so a broken install fails here
#      with a clear message instead of inside an audit.
#
# This changes nothing about what the audits test or how long they may run.
set -euo pipefail

PLAYWRIGHT_VERSION="1.55.0"
ATTEMPTS=3
CLI="./node_modules/playwright/cli.js"

# Fail a stalled browser download connection after 60s instead of waiting.
export PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT="${PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT:-60000}"

retry() {
  # retry <label> <seconds per attempt> <command...>
  local label="$1" limit="$2"
  shift 2
  local attempt
  for attempt in $(seq 1 "$ATTEMPTS"); do
    local started=$SECONDS
    if timeout --kill-after=15s "${limit}s" "$@"; then
      echo "${label}: done in $((SECONDS - started))s (attempt ${attempt})"
      return 0
    fi
    if [ "$attempt" -lt "$ATTEMPTS" ]; then
      echo "::warning title=Playwright install::${label} did not finish on attempt ${attempt} of ${ATTEMPTS} (limit ${limit}s); retrying"
      sleep $((attempt * 5))
    fi
  done
  echo "::error title=Playwright install::${label} failed after ${ATTEMPTS} attempts"
  return 1
}

chromium_launches() {
  timeout --kill-after=10s 60s node -e '
    const { chromium } = require("playwright");
    (async () => {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.setContent("<p>ok</p>");
      await browser.close();
    })().catch(error => { console.error(error.message.split("\n").slice(0, 6).join("\n")); process.exit(1); });
  '
}

retry "Playwright package install" 120 \
  npm install --no-save --no-package-lock --no-audit --no-fund "playwright@${PLAYWRIGHT_VERSION}"

retry "Chromium download" 150 node "$CLI" install chromium

if chromium_launches; then
  echo "::notice title=Playwright install::Chromium ${PLAYWRIGHT_VERSION} ready; runner already had the system libraries, apt skipped"
  exit 0
fi

echo "Chromium could not start yet; installing its system libraries with apt."
# Bound each apt network fetch so a slow mirror is retried rather than hanging.
printf 'Acquire::Retries "3";\nAcquire::http::Timeout "30";\nAcquire::https::Timeout "30";\n' \
  | sudo tee /etc/apt/apt.conf.d/99flipforge-ci-network >/dev/null

# Each attempt first recovers from an attempt that was stopped part-way through.
retry "Chromium system libraries (apt)" 240 \
  bash -c 'sudo dpkg --configure -a >/dev/null 2>&1 || true; node "$1" install-deps chromium' _ "$CLI"

if ! chromium_launches; then
  echo "::error title=Playwright install::Chromium still cannot start after installing system libraries"
  exit 1
fi
echo "::notice title=Playwright install::Chromium ${PLAYWRIGHT_VERSION} ready; system libraries installed with apt"
