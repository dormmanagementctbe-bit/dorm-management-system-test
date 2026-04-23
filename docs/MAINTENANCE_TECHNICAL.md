# Maintenance Module — Technical Documentation

## Overview

The maintenance module handles the full lifecycle of room issue reports in the dorm management system. It spans five files: `maintenance.routes.ts`, `maintenance.controller.ts`, `maintenance.service.ts`, `maintenance.dto.ts`, and the `MaintenanceRequest` Prisma model.

---

## Architecture

```
HTTP Request
    │
    ▼
maintenance.routes.ts      — route definitions, middleware chains (auth + role guards)
    │
    ▼
maintenance.controller.ts  — thin layer: parse DTO, call service, send response
    │
    ▼
maintenance.service.ts     — all business logic, DB access via Prisma
    │
    ▼
prisma/schema.prisma       — MaintenanceRequest model + enums
```

Controllers never access Prisma directly. All errors are propagated via `next(err)` to the global error handler (errors with a `statusCode` property are treated as HTTP errors).

---

## Data Model

### `MaintenanceRequest`

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID PK | Auto-generated |
| `roomId` | UUID FK → Room | Required |
| `reportedByUserId` | UUID FK → User | Set from JWT on creation, immutable |
| `assignedToUserId` | UUID FK → User (nullable) | Must be an ACTIVE MAINTENANCE user |
| `confirmedByUserId` | UUID FK → User (nullable) | Set to reporter when they confirm fix |
| `category` | Enum | `PLUMBING`, `ELECTRICAL`, `FURNITURE`, `OTHER` |
| `priority` | Enum | `LOW`, `MEDIUM`, `HIGH`, `URGENT` — default `MEDIUM` |
| `status` | Enum | `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`, `REJECTED` — default `OPEN` |
| `title` | String | 3–200 chars |
| `description` | String | 10–2000 chars |
| `resolvedAt` | DateTime (nullable) | Set when status → `RESOLVED`; cleared on rollback |
| `confirmedAt` | DateTime (nullable) | Set when student confirms (`CLOSED`) |
| `createdAt` | DateTime | Auto |
| `updatedAt` | DateTime | Auto-updated |

### Indexes
- `(status, priority)` — primary work-queue filter + sort
- `roomId` — room-scoped queries
- `reportedByUserId` — student's own request list
- `assignedToUserId` — maintenance worker's queue
- `confirmedByUserId` — audit lookups

---

## Route Table

| Method | Path | Middleware | Handler |
|--------|------|-----------|---------|
| `POST` | `/maintenance` | `authenticate` → `requireRole(STUDENT)` | `create` |
| `GET` | `/maintenance/my` | `authenticate` | `getMy` |
| `GET` | `/maintenance` | `authenticate` → `requireRole(ADMIN, SUPER_ADMIN, MAINTENANCE)` | `list` |
| `GET` | `/maintenance/:id` | `authenticate` | `getById` |
| `PUT` | `/maintenance/:id` | `authenticate` → `requireRole(ADMIN, SUPER_ADMIN, MAINTENANCE)` | `update` |
| `PATCH` | `/maintenance/:id` | `authenticate` → `requireRole(ADMIN, SUPER_ADMIN, MAINTENANCE)` | `update` |
| `POST` | `/maintenance/:id/confirm-fixed` | `authenticate` → `requireRole(STUDENT)` | `confirmFixed` |

> `PUT` and `PATCH` route to the same handler — both perform a partial update. This is intentional for REST client compatibility.

---

## Service Functions

### `createRequest(userId, dto)`
Creates a new `MaintenanceRequest` with `status = OPEN` and `reportedByUserId` set from the JWT. No further validation beyond Zod schema.

**Known gap:** Does not verify that the student is currently allocated to the submitted `roomId`. See Production Gaps section.

---

### `listRequests(query)`
Staff-facing paginated list with filtering on `status`, `priority`, `category`, and `assignedToUserId`. Invalid enum values for filter params are silently ignored (the filter is not applied). Ordered by `priority DESC, createdAt ASC` — highest priority and oldest first, making it suitable as a direct work queue.

---

### `getMyRequests(userId, query)`
Returns paginated requests where `reportedByUserId = userId`. Ordered by `createdAt DESC`. No status filter is available on this endpoint.

---

### `getRequestById(id, actor)`
Fetches a single request with full relation includes. Authorization is checked in the service layer: staff may view any request; a student may only view their own (verified by comparing `reportedByUserId` to `actor.id`).

---

### `updateRequest(id, actor, dto)`
The core triage function. Only staff can call it (enforced at route level). Business logic:

1. **No-op guard:** Rejects if none of `status`, `priority`, or `assignedToUserId` are provided.
2. **Priority update:** Applied directly.
3. **Assignee update:**
   - `assignedToUserId = null` → disconnects the current assignee.
   - `assignedToUserId = <uuid>` → verifies the target is an ACTIVE MAINTENANCE user via `ensureAssignableMaintenanceUser`, then connects.
4. **Auto-assign:** If `assignedToUserId` is not provided and the request has no current assignee and the actor has the `MAINTENANCE` role and the new status is `IN_PROGRESS` or `RESOLVED`, the actor is auto-assigned. This does not apply to ADMIN callers.
5. **Timestamp management:**
   - `status → RESOLVED` → sets `resolvedAt = now()`.
   - `status → anything else` (from RESOLVED) → clears `resolvedAt`, `confirmedAt`, and disconnects `confirmedBy`.

---

### `confirmRequestFixed(id, userId)`
Allows the original reporter to transition `RESOLVED → CLOSED`. Sets `confirmedAt` and `confirmedBy`.

- Idempotent on `CLOSED`: returns current state without error.
- Rejects if caller is not the original reporter.
- Rejects if status is not `RESOLVED`.

---

## Authorization Model

```
canManageMaintenance(actor) = actor.roles ∩ {MAINTENANCE, ADMIN, SUPER_ADMIN} ≠ ∅
```

Role checks are enforced at two levels:
- **Route level** (`requireRole` middleware): coarse-grained guards per endpoint.
- **Service level**: fine-grained ownership checks (e.g., `getRequestById`, `confirmRequestFixed`).

The `MAINTENANCE` role is functionally a subset of `ADMIN` within this module — it can do everything `ADMIN` can except for actions not explicitly restricted (currently there are no ADMIN-exclusive operations in the update flow).

---

## DTO Validation

| Schema | Fields | Notes |
|--------|--------|-------|
| `createMaintenanceSchema` | `roomId`, `category`, `priority`, `title`, `description` | All required except `priority` (defaults to `MEDIUM`) |
| `updateMaintenanceSchema` | `status`, `priority`, `assignedToUserId` | All optional; at least one must be present (service-layer check) |
| `confirmMaintenanceSchema` | *(empty)* | No body needed; schema exists for consistency |

---

## Known Issues and Production Gaps

### 🔴 Critical

#### 1. No room ownership check on create
`createRequest` accepts any valid `roomId` UUID. A student can submit a request for a room they do not live in. The service must verify that the student has an active allocation to the submitted room before creating the request.

**Fix (service-layer):**
```typescript
// In createRequest, before prisma.maintenanceRequest.create:
const allocation = await prisma.allocation.findFirst({
  where: { room: { id: dto.roomId }, student: { userId }, isActive: true },
  select: { id: true },
});
if (!allocation) throw toHttpError("You are not allocated to this room", 403);
```

#### 2. No status transition enforcement
The state machine is not enforced in the service. Any staff member can set `status` to any value at any time, including:
- Reopening a `CLOSED` request (only the student confirm flow should close it — it should be immutable after).
- Reopening a `REJECTED` request.
- Moving from `RESOLVED` back to `OPEN` or skipping states.

**Recommended valid transitions:**
```
OPEN        → IN_PROGRESS, REJECTED
IN_PROGRESS → RESOLVED, OPEN (reopen)
RESOLVED    → IN_PROGRESS (dispute)
CLOSED      → (none — immutable)
REJECTED    → OPEN (reopen by admin only)
```

**Fix (service-layer):** Add a transition matrix and validate `existing.status → dto.status` before applying.

---

### 🟡 Minor

#### 3. MAINTENANCE role can reject requests
The update route allows all staff roles to set `status = REJECTED`. The DB design does not explicitly assign rejection authority. If rejection should require ADMIN or SUPER_ADMIN, add a field-level role check in `updateRequest`.

#### 4. Missing filters on `listRequests`
Staff cannot filter by `roomId` or `reportedByUserId`. These would be practical for room-scoped inspection and for looking up a specific student's history.

#### 5. No status filter on `getMyRequests`
Students cannot filter their own request list by status. Add an optional `status` query param handled the same way as in `listRequests`.

#### 6. No resolution notes field
When a maintenance worker marks a request `RESOLVED`, there is no field to record what was done. Consider adding a nullable `resolutionNotes` column to the `maintenance_requests` table and exposing it as an optional field in `updateMaintenanceSchema`.

#### 7. Auto-assign only applies to MAINTENANCE role
The auto-assign logic in `updateRequest` (lines 184–191 in service) does not apply when an `ADMIN` transitions a request to `IN_PROGRESS`. This is likely intentional (admins dispatch, not fix), but should be documented and confirmed.

---

## What Is Working Correctly

- All authentication is enforced at route level via `authenticate` middleware.
- Role guards are correctly applied per endpoint.
- `ensureAssignableMaintenanceUser` correctly validates that the target assignee is both ACTIVE and has the MAINTENANCE role.
- The `maintenanceInclude` constant is reused across queries to ensure consistent relation loading.
- `resolvedAt` is correctly managed (set on RESOLVED, cleared on rollback).
- `confirmFixed` is idempotent — safe to call twice.
- Pagination defaults (page 1, limit 20, max 100) are enforced.
- The default sort order (priority DESC, createdAt ASC) is correct for a triage work queue.
- Both `PUT` and `PATCH` route to the same handler — the schema supports partial updates in both cases.
- Invalid filter enum values are silently ignored (no 400 on unknown status string) — this is safe and prevents filter misconfiguration from breaking the list.

---

## Response Envelope

All endpoints use consistent response shapes from `src/utils/helpers.ts`:

**Single item:**
```json
{ "success": true, "data": { ... }, "message": "optional" }
```

**Paginated list:**
```json
{ "success": true, "data": [ ... ], "meta": { "total": 0, "page": 1, "limit": 20, "totalPages": 0 } }
```

**Error:**
```json
{ "success": false, "error": "message" }
```

HTTP status codes used: `200`, `201`, `400`, `401`, `403`, `404`, `500`.
