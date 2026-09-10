# Codex Automated Test Plan

This directory contains the runnable Codex test entrypoints for the garment factory SaaS frontend.

## One-command run

```sh
corepack pnpm test:codex
```

The suite keeps running after individual failures and writes a summary to `artifacts/codex-test/<run-id>/summary.md`.

## Useful environment variables

- `GARMENT_E2E_API_BASE_URL`: Backend API base URL. Defaults to `http://192.168.0.197:8080/api/v1`.
- `GARMENT_E2E_UI_BASE_URL`: UI URL. Defaults to `http://localhost:5173`.
- `GARMENT_E2E_TENANT_CODE`: Login tenant code. Defaults to `demo`.
- `GARMENT_E2E_ADMIN_USERNAME`: Login username. Defaults to `admin`.
- `GARMENT_E2E_DEMO_PASSWORD`: Login password. Defaults to `DemoOnly!123`.
- `GARMENT_E2E_TEST_SUPPORT_KEY`: Optional test-support endpoint key, sent as `X-Test-Support-Key`.
- `GARMENT_CODEX_SKIP_UI=1`: Skip browser E2E when only static/API smoke is needed.
- `GARMENT_CODEX_PERF_SAMPLES`: Samples per public endpoint for the light perf smoke. Defaults to `15`.
- `GARMENT_CODEX_PERF_P95_MS`: P95 threshold for light perf smoke. Defaults to `1000`.

## Stage map

- `test:codex:preflight`: Backend readiness, OpenAPI availability, anonymous auth behavior.
- `typecheck`, `lint`, `format:check`, `test:unit --run`: Existing static and unit baseline.
- `test:codex:ui`: Builds the frontend, starts Vite preview, and runs the existing Playwright route/security/business-chain specs against the selected backend.
- `test:codex:modules`: Logs in with the demo admin account and checks every primary module route renders without auth failures or 5xx API responses.
- `test:codex:api`: Classifies every OpenAPI operation into the module coverage matrix and fails on unclassified operations.
- `test:codex:security`: Anonymous access smoke checks for representative protected API surfaces.
- `test:codex:perf`: Light non-destructive health/OpenAPI latency baseline.

## Current contract expectation

The automated suite expects the shared backend to expose OpenAPI at `/v3/api-docs`, health at `/actuator/health/readiness`, and normal API routes under `/api/v1`.

`/api/v1/test-support/*` is not treated as a product API under test. Browser scenarios that need generated fixture data will use it only when the backend exposes it; otherwise those fixture-dependent scenarios are skipped instead of failed.
