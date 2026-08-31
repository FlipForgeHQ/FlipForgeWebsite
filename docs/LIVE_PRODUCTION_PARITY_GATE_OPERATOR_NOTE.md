# Operator Note — Live Production Parity

For a release candidate, do not mark Website production identity confirmed from GitHub `main` alone.

Use the `Live Production Parity` workflow result for the exact merge SHA. If it is red, the release remains production-unverified even when the rest of CI is green. If it is green, record the merge SHA and parity result in Website issue #69 before starting the controlled signed-in QA session.

A parity PASS does not authorize billing, transaction execution, recommendation changes, grading changes, or beta expansion by itself.
