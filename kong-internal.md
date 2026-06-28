# Internal Portal Kong Runtime Implementation

This document converts `pepiko-kong-runtime-portal-implementation.md` into a practical implementation plan for the Pepiko Internal Portal in this repo.

The Internal Portal must never call Kong Admin API directly. Internal browser code calls only `platform-core-service` endpoints under `/api/internal/*`. The core service owns Kong Admin API connectivity, secret handling, database writes, audit logs, and runtime drift repair.

The filename is `kon-internal.md` to match the requested file name.

## Current Internal Portal Mapping

| Existing Internal Portal Feature | Current Files | Kong Runtime Mapping | Required Change |
|---|---|---|---|
| Customers | `src/features/customers/customers.js`, `/api/internal/customers/*` | Customer organization maps to one Kong Consumer | Add runtime tab/section on customer detail route. Sync/suspend/restore acts on organization Consumer. |
| Products Management | `src/features/products/products.js`, `/api/internal/products` | Product config maps to Kong public runtime routes/ACL groups by metadata | Keep product CRUD in Pepiko DB. Do not expose generic Kong route/service CRUD. Add runtime group/path metadata only. |
| Users / Roles | `src/features/users/users.js` | Internal authorization for runtime operations | Restrict destructive runtime actions to `super_admin` and `ops_admin`; settings secrets to `super_admin`. |
| Plans | `src/features/plans/plans.js` | Plan limits sync to Kong rate-limiting plugin | Add sync status and limit preview. Core service pushes config to Kong. |
| Usage / Reports | `src/features/usage`, `src/features/reports` | Runtime analytics from Kong logs/metrics after ingestion | Read normalized analytics from core service. |
| Audit | `src/features/audit` | Runtime audit logs | Include Kong settings, consumer sync, key revoke, access, limits, drift fixes. |
| Health | `src/features/health` | Kong Admin API connection health | Add Kong health summary from core service. |

## Runtime Ownership Model

Consumers are customers, not individual users.

```text
Customer organization -> Kong Consumer
Customer user         -> Portal identity only
Internal user         -> Admin identity only
API key               -> Kong key-auth credential under organization Consumer
Product access        -> ACL groups or route policy for organization Consumer
Plan/limits           -> Kong rate-limiting plugin for organization Consumer
```

Do not create Kong Consumers for:

- Customer team member emails
- Internal user emails
- Projects
- Billing contacts

## Internal Navigation Additions

Add a Runtime Operations area, or add runtime tabs inside existing pages:

```text
Runtime Operations
  - Kong Settings
  - Kong Drift
  - Runtime Analytics
  - Runtime Audit

Customer Detail
  - Overview
  - Runtime
  - API Keys
  - API Access
  - Limits
  - Suspension
```

This keeps the UI mapped to existing internal workflows instead of recreating Kong Dashboard.

## Backend Contract

Internal Portal should call only these Pepiko backend endpoints:

```http
GET   /api/internal/kong/settings
PATCH /api/internal/kong/settings/{environment}
POST  /api/internal/kong/settings/{environment}/test

GET  /api/internal/customers/{org_id}/runtime
POST /api/internal/customers/{org_id}/runtime/sync-consumer
POST /api/internal/customers/{org_id}/runtime/suspend
POST /api/internal/customers/{org_id}/runtime/restore
POST /api/internal/customers/{org_id}/runtime/sync-all

GET   /api/internal/customers/{org_id}/api-keys
POST  /api/internal/customers/{org_id}/api-keys
POST  /api/internal/customers/{org_id}/api-keys/{api_key_id}/rotate
POST  /api/internal/customers/{org_id}/api-keys/{api_key_id}/revoke
POST  /api/internal/customers/{org_id}/api-keys/revoke-all

GET   /api/internal/customers/{org_id}/api-access
PATCH /api/internal/customers/{org_id}/api-access
POST  /api/internal/customers/{org_id}/api-access/sync-kong

GET   /api/internal/customers/{org_id}/limits
PATCH /api/internal/customers/{org_id}/limits
POST  /api/internal/customers/{org_id}/limits/sync-kong

GET  /api/internal/kong/drift
POST /api/internal/kong/drift/{drift_id}/fix
POST /api/internal/kong/drift/bulk-fix

GET /api/internal/analytics/runtime/summary
GET /api/internal/analytics/runtime/by-customer
GET /api/internal/analytics/runtime/by-api
GET /api/internal/analytics/runtime/errors

GET /api/internal/audit/runtime
```

The frontend must not contain Kong Admin endpoints, Admin API tokens, or generic Kong entity mutation calls.

## Kong Admin API First Configuration Form

Internal Portal must provide first configuration of Kong Admin API through a form backed by core service.

Route:

```text
/kong/settings
```

Form fields:

| Field | Type | Notes |
|---|---|---|
| Environment | select | `development`, `staging`, `production` |
| Admin API base URL | URL input | Example: `http://kong-admin:8001`; stored only in operations DB. |
| Authentication type | select | `none`, `header_token`, `basic`, `mtls` |
| Header name | text | Required for `header_token`, example `Kong-Admin-Token`. |
| Secret reference | password/text | Store a secret reference or encrypted value in backend only. Never echo back raw secret. |
| Timeout ms | number | Default `5000`. |
| Retry count | number | Default `2`. |
| Health check path | text | Default `/status` or `/`. |
| Enabled | toggle | Allows saving settings before enabling sync. |

Save flow:

1. Internal user submits form to `PATCH /api/internal/kong/settings/{environment}`.
2. Core service validates URL and auth type.
3. Core service stores secret safely; response returns only `secret_configured: true`.
4. User clicks "Test connection".
5. Portal calls `POST /api/internal/kong/settings/{environment}/test`.
6. Core service calls Kong Admin API and returns health status.
7. Portal displays connected/failed/unknown status.

Response must redact secret:

```json
{
  "environment": "development",
  "admin_api_base_url": "http://kong-admin:8001",
  "auth_type": "header_token",
  "header_name": "Kong-Admin-Token",
  "secret_configured": true,
  "timeout_ms": 5000,
  "retry_count": 2,
  "health_check_path": "/status",
  "status": "connected",
  "last_checked_at": "2026-06-28T10:00:00Z"
}
```

Role policy:

```text
View settings: super_admin, ops_admin
Update settings: super_admin only
Test connection: super_admin, ops_admin
```

## Customer Runtime Management

Existing location:

```text
Customer detail route: /customers/{customer-slug}
Feature file: src/features/customers/customers.js
```

Add a Runtime tab or section on customer detail.

Required UI cards:

- Kong Consumer mapping
- Runtime sync status
- Active DB keys vs active Kong credentials
- Product access sync status
- Plan/rate limit sync status
- Suspension runtime status

Actions:

| Action | Endpoint | Roles | Behavior |
|---|---|---|---|
| Sync Consumer | `POST /api/internal/customers/{org_id}/runtime/sync-consumer` | `super_admin`, `ops_admin` | Ensures Kong Consumer `tenant_<slug>` exists. |
| Sync All Runtime | `POST /api/internal/customers/{org_id}/runtime/sync-all` | `super_admin`, `ops_admin` | Syncs Consumer, active keys, ACL groups, and limits. |
| Suspend Runtime | `POST /api/internal/customers/{org_id}/runtime/suspend` | `super_admin`, `ops_admin` | Suspends organization and removes/invalidates Kong credentials. |
| Restore Runtime | `POST /api/internal/customers/{org_id}/runtime/restore` | `super_admin`, `ops_admin` | Restores organization; old keys remain revoked. |

Kong Consumer naming:

```text
username = tenant_<organization.slug>
custom_id = organizations.id
```

The `CustomerRegistry` row should mirror status and sync metadata for internal search/reporting, but the customer database `Organization` remains the tenant source.

## Internal API Key Administration

Internal Portal should manage customer organization keys, still synced to Kong.

Customer detail API Keys tab:

```text
/customers/{customer-slug} -> API Keys tab
```

Required actions:

- List keys
- Create key for customer organization
- Rotate key
- Revoke key
- Revoke all active keys
- View runtime sync status
- View Kong credential id if available
- View owner user metadata from Pepiko DB

Do not allow:

- Revealing an existing raw key
- Editing Kong credentials directly
- Creating keys for individual customer emails as Kong Consumers

Create key on behalf flow:

1. Internal user selects customer organization and project.
2. Internal Portal calls `POST /api/internal/customers/{org_id}/api-keys`.
3. Core service verifies organization is active.
4. Core service checks configured key limit unless internal override is explicitly allowed.
5. Core service creates Kong key-auth credential.
6. Raw key is shown once to the internal admin.
7. Audit event stores actor email and masked key only.

Revoke key flow:

1. Internal Portal calls revoke endpoint.
2. Core service deletes Kong credential first.
3. Core service marks DB key revoked.
4. Public API must reject the key with 401.

Revoke all flow:

1. Core service lists all active DB keys for org.
2. Deletes each Kong credential.
3. Marks keys revoked/suspended.
4. Returns per-key sync result.
5. Creates one summary audit event plus per-key metadata if needed.

## API Key Limit Management

Existing model:

```text
CustomerRegistry.api_key_limit default = 2
```

Internal Portal should control this value on customer detail/account settings.

Rules:

- Default is 2.
- Maximum customer-configurable/internal approved limit is 5.
- Platform Portal should not show the configured limit number.
- Platform Portal only receives `can_create`.
- Internal Portal can show current limit, active DB keys, active Kong credentials, and drift.

Validation:

```text
api_key_limit must be an integer from 1 to 5.
active_api_key_count must ignore revoked keys.
active_kong_credential_count should match active DB keys.
```

## Product Management Runtime Metadata

Existing location:

```text
src/features/products/products.js
ProductConfig model in app/models/operations.py
```

Product Management remains a Pepiko product catalog, not Kong Dashboard.

Fields required for runtime mapping:

| Field | Existing/Proposed Storage | Purpose |
|---|---|---|
| Product code | `ProductConfig.product_code` | Stable API identifier. |
| Status | `ProductConfig.status` | Single source: `published` or `unpublished`. |
| Absolute endpoint | `ProductConfig.endpoint_path` | Public/runtime API endpoint used by playground. |
| Request body template | `ProductConfig.config_json.request_body_template` | JSON shown in playground. |
| Authentication type | `ProductConfig.config_json.authentication_type` | `key_auth`, `bearer`, or `none`. |
| Kong ACL group | `ProductConfig.config_json.kong_acl_group` | Group assigned to authorized customer Consumers. |
| Runtime route path | `ProductConfig.config_json.runtime_route_path` | Informational only unless core service syncs route metadata. |

Do not add UI for generic Kong service/route/plugin CRUD. If a route must be created or changed, do it through core service using product-specific safe operations.

## Product Access Management

Customer detail API Access tab:

```text
/customers/{customer-slug} -> API Access tab
```

Required UI:

- Product list from published/internal products
- Access status per product: `enabled`, `disabled`, `pending`, `drifted`
- Allowed environments
- Kong ACL group
- Last synced at
- Sync button

Save flow:

1. Internal admin changes product access toggles.
2. Portal calls `PATCH /api/internal/customers/{org_id}/api-access`.
3. Core service updates Pepiko DB source of truth.
4. Core service adds/removes Kong ACL group membership for the organization Consumer.
5. Core service marks sync status.
6. Portal shows precise result.

Preferred MVP enforcement:

```text
Kong ACL plugin on product routes.
Organization Consumer belongs to product-specific ACL groups.
```

Example groups:

```text
api_prompt_classification
api_chat_guardrail
api_response_validation
api_all_guardrails
```

## Plan, Rate Limit, And Quota Sync

Existing location:

```text
src/features/plans
Customer detail billing/account areas
Plan model in operations DB
```

Required internal UI:

- Current plan
- Default daily/monthly limits
- Override minute/hour/day limits
- Hard block toggle
- Kong sync status
- Drift warning
- "Sync limits to runtime" action

Core service must:

1. Save Pepiko plan/override first.
2. Upsert Consumer-level Kong rate-limiting plugin.
3. Verify resulting plugin config.
4. Store sync status and last sync time.
5. Audit actor, before, after, and Kong result.

Do not let the frontend submit arbitrary Kong plugin JSON. Submit normalized business fields only.

## Suspension And Restore

Existing location:

```text
Customer list quick actions
Customer detail account/runtime actions
```

Suspension must affect both portal actions and public API runtime.

Suspend flow:

1. Internal admin chooses reason.
2. Portal calls `POST /api/internal/customers/{org_id}/runtime/suspend`.
3. Core service sets `Organization.status = suspended`.
4. Core service mirrors `CustomerRegistry.status = suspended`.
5. Core service deletes/revokes all active Kong key-auth credentials for the Consumer.
6. Core service marks API keys `suspended` or `revoked`.
7. Platform Portal login/actions show suspended account message.
8. Public API rejects old keys.

Restore flow:

1. Set organization/registry status back to `active`.
2. Re-sync Consumer, product access, and limits.
3. Do not restore old raw API keys.
4. Customer or internal admin creates new keys.

Delete customer:

- Super admin only.
- Revoke all Kong credentials first.
- Delete Kong Consumer only after permanent business deletion is final.
- Keep audit logs according to retention rules.

## Kong Drift Dashboard

Route:

```text
/kong/drift
```

Checks:

- Organization active in DB but Kong Consumer missing
- Kong Consumer exists but DB organization missing
- DB active key missing Kong credential
- DB revoked/suspended key still exists in Kong
- Product access differs from Kong ACL groups
- Plan limit differs from Kong rate-limiting plugin
- Suspended organization has active Kong credentials

UI table fields:

- Severity
- Customer
- Resource type
- Drift type
- DB state
- Kong state summary
- Last detected at
- Fix action

Fix action must call core service:

```http
POST /api/internal/kong/drift/{drift_id}/fix
```

Bulk fix should be guarded by confirmation and role checks.

## Runtime Analytics

Internal analytics should not query Kong Admin API from the browser.

Data source:

```text
Kong logs/metrics -> ingestion pipeline -> Pepiko analytics store -> core service -> Internal Portal
```

For MVP, `UsageEvent` in customer DB can continue to be used, extended with:

- HTTP status code
- error type: `missing_key`, `invalid_key`, `access_denied`, `rate_limited`, `upstream_error`
- Kong request id
- Kong consumer id/username
- latency breakdown if available

Internal Portal displays:

- Requests by customer
- Requests by product
- 401/403/429 counts
- p50/p95/p99 latency
- Tenants near quota
- Suspicious spikes

## Audit Requirements

Every runtime operation must write `InternalAuditLog` with actor email.

Audit actions:

```text
kong.settings.updated
kong.settings.tested
runtime.consumer.synced
runtime.keys.created
runtime.keys.rotated
runtime.keys.revoked
runtime.keys.revoked_all
runtime.access.updated
runtime.access.synced
runtime.limits.updated
runtime.limits.synced
runtime.customer.suspended
runtime.customer.restored
runtime.drift.fixed
runtime.drift.bulk_fixed
```

Never store raw API keys or Kong Admin secrets in audit payloads.

## Core Service Implementation Modules

Because this repo uses FastAPI/Python, implement these modules instead of the TypeScript filenames in the source spec:

```text
platform-core-service/app/services/kong_admin_service.py
platform-core-service/app/services/runtime_sync_service.py
platform-core-service/app/services/runtime_drift_service.py
platform-core-service/app/services/runtime_audit_service.py
```

Suggested responsibilities:

```python
class KongAdminService:
    def health_check(self, environment: str) -> dict: ...
    def ensure_consumer(self, org) -> dict: ...
    def delete_consumer(self, org) -> None: ...
    def create_key_credential(self, org, raw_key: str) -> dict: ...
    def delete_key_credential(self, org, credential_id: str) -> None: ...
    def list_key_credentials(self, org) -> list[dict]: ...
    def sync_acl_groups(self, org, groups: list[str]) -> dict: ...
    def sync_rate_limit(self, org, limits: dict) -> dict: ...
```

```python
class RuntimeSyncService:
    def sync_customer_consumer(self, org_id: int) -> dict: ...
    def create_api_key(self, org_id: int, payload, actor_email: str) -> dict: ...
    def revoke_api_key(self, org_id: int, key_id: int, actor_email: str) -> dict: ...
    def rotate_api_key(self, org_id: int, key_id: int, actor_email: str) -> dict: ...
    def suspend_customer_runtime(self, org_id: int, reason: str, actor_email: str) -> dict: ...
    def restore_customer_runtime(self, org_id: int, actor_email: str) -> dict: ...
    def sync_product_access(self, org_id: int) -> dict: ...
    def sync_limits(self, org_id: int) -> dict: ...
```

## Database Additions

Add columns instead of replacing existing tables where possible.

Customer DB:

```text
organizations.kong_consumer_id
organizations.kong_consumer_username
organizations.kong_custom_id
organizations.kong_sync_status
organizations.kong_last_synced_at

api_keys.kong_credential_id
api_keys.kong_sync_status
api_keys.kong_last_synced_at
api_keys.revoked_at
api_keys.revoked_by
```

Operations DB:

```text
kong_environment_settings
tenant_product_access or customer_product_access
runtime_sync_events or reuse internal_audit_logs
```

For `ProductConfig`, prefer using `config_json` for Kong-specific metadata first. Add explicit columns later only if reporting/querying requires them.

## Role Policy

| Runtime Action | Roles |
|---|---|
| View runtime status | `super_admin`, `ops_admin`, `support_agent` |
| Sync consumer | `super_admin`, `ops_admin` |
| Create/rotate/revoke customer keys | `super_admin`, `ops_admin`, `support_agent` |
| Revoke all keys | `super_admin`, `ops_admin` |
| Update Kong settings | `super_admin` |
| Test Kong settings | `super_admin`, `ops_admin` |
| Update product access | `super_admin`, `ops_admin` |
| Update plan limits | `super_admin`, `ops_admin`, `billing_manager` |
| Suspend/restore runtime | `super_admin`, `ops_admin` |
| Delete customer/Consumer | `super_admin` |
| Fix drift | `super_admin`, `ops_admin` |

## User Messages

Use the existing portal message box patterns with specific text.

Examples:

- Success: "Kong Consumer tenant_brightminds-inc synced for BrightMinds Inc."
- Success: "API key revoked and removed from the runtime gateway."
- Warning: "Pepiko DB was updated, but Kong sync is pending. Review Kong Drift."
- Error: "Kong Admin API connection failed for development. Check the base URL or secret reference."
- Info: "Restored customer account. Existing revoked API keys were not reactivated."

## Acceptance Checklist

- Internal Portal has no direct Kong Admin API calls.
- Kong Admin API first configuration is done through a core-service-backed form.
- Secrets are never returned to the browser.
- Customer organization maps to one Kong Consumer.
- API keys remain managed in portals and synced to Kong key-auth credentials.
- Revoked customer keys cannot call public APIs.
- Suspended customers cannot use existing keys.
- Product access syncs through ACL groups or equivalent core-service policy.
- Plans/limits sync through normalized fields, not arbitrary plugin JSON.
- Drift dashboard can detect and repair DB/Kong mismatches.
- All runtime operations write internal audit logs.
