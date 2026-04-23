# Maintenance API — Frontend Developer Guide

> **Base URL:** `http://localhost:3001/api/v1`  
> All endpoints require `Authorization: Bearer <token>` unless otherwise stated.  
> All request bodies use `Content-Type: application/json`.

---

## Overview

The maintenance module lets **students** report room issues and lets **staff** (admins and maintenance workers) triage, assign, and resolve them. A student must confirm the fix before a request is fully closed.

### Who Can Do What

| Action | STUDENT | MAINTENANCE | ADMIN / SUPER_ADMIN |
|--------|:-------:|:-----------:|:-------------------:|
| Submit a request | ✅ | ❌ | ❌ |
| View own requests | ✅ | ✅ | ✅ |
| View all requests | ❌ | ✅ | ✅ |
| View a single request | ✅ (own only) | ✅ | ✅ |
| Update status / priority / assignee | ❌ | ✅ | ✅ |
| Confirm fix (RESOLVED → CLOSED) | ✅ (reporter only) | ❌ | ❌ |

---

## Request Lifecycle (Status Machine)

```
                    ┌──────────┐
                    │   OPEN   │  ← Student submits request
                    └────┬─────┘
                         │ Staff sets status
           ┌─────────────┼─────────────┐
           ▼             ▼             │
    ┌─────────────┐  ┌──────────┐     │
    │  IN_PROGRESS│  │ REJECTED │     │
    └──────┬──────┘  └──────────┘     │
           │ Staff marks resolved      │
           ▼                           │
    ┌──────────────┐                  │
    │   RESOLVED   │◄─────────────────┘
    └──────┬───────┘
           │ Student confirms fix
           ▼
    ┌──────────────┐
    │    CLOSED    │  ← Terminal state
    └──────────────┘
```

**Status values:** `OPEN` · `IN_PROGRESS` · `RESOLVED` · `REJECTED` · `CLOSED`

> **Note:** Once a request is `CLOSED`, it cannot be changed. `RESOLVED` → `CLOSED` requires the original reporting student to call the confirm-fixed endpoint.

---

## Enumerations

### Category
| Value | Description |
|-------|-------------|
| `PLUMBING` | Water, pipes, drainage |
| `ELECTRICAL` | Lighting, outlets, wiring |
| `FURNITURE` | Beds, desks, chairs, wardrobes |
| `OTHER` | Anything else |

### Priority
| Value | Description |
|-------|-------------|
| `LOW` | Non-urgent, can wait |
| `MEDIUM` | Default — standard turnaround |
| `HIGH` | Needs attention soon |
| `URGENT` | Immediate action required |

---

## Endpoints

---

### `POST /maintenance`
**Submit a maintenance request**  
**Role required:** `STUDENT`

#### Request Body
```json
{
  "roomId": "uuid",
  "category": "PLUMBING | ELECTRICAL | FURNITURE | OTHER",
  "priority": "LOW | MEDIUM | HIGH | URGENT",
  "title": "string (3–200 chars)",
  "description": "string (10–2000 chars)"
}
```

- `priority` defaults to `MEDIUM` if omitted.
- `roomId` must be a valid UUID of an existing room.

#### Success Response — `201 Created`
```json
{
  "success": true,
  "message": "Maintenance request submitted",
  "data": {
    "id": "uuid",
    "roomId": "uuid",
    "reportedByUserId": "uuid",
    "assignedToUserId": null,
    "confirmedByUserId": null,
    "category": "PLUMBING",
    "priority": "MEDIUM",
    "status": "OPEN",
    "title": "Sink is leaking",
    "description": "The bathroom sink drips constantly and the cabinet below is wet.",
    "resolvedAt": null,
    "confirmedAt": null,
    "createdAt": "2026-04-23T10:00:00.000Z",
    "updatedAt": "2026-04-23T10:00:00.000Z"
  }
}
```

> **Note (current limitation):** The backend does not yet validate that the student is assigned to the submitted `roomId`. The frontend should pre-fill `roomId` from the student's current allocation and not let them pick an arbitrary room.

#### Error Responses
| Code | Reason |
|------|--------|
| `400` | Validation failure (missing fields, invalid enum, title/description too short) |
| `401` | Not authenticated |
| `403` | Caller does not have `STUDENT` role |

---

### `GET /maintenance/my`
**Get the current user's own maintenance requests (paginated)**  
**Role required:** Any authenticated user

#### Query Parameters
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Items per page (max 100) |

#### Success Response — `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "roomId": "uuid",
      "reportedByUserId": "uuid",
      "assignedToUserId": "uuid",
      "confirmedByUserId": null,
      "category": "PLUMBING",
      "priority": "HIGH",
      "status": "IN_PROGRESS",
      "title": "Sink is leaking",
      "description": "...",
      "resolvedAt": null,
      "confirmedAt": null,
      "createdAt": "2026-04-23T10:00:00.000Z",
      "updatedAt": "2026-04-23T11:00:00.000Z",
      "room": {
        "id": "uuid",
        "roomNumber": "101",
        "dorm": { "id": "uuid", "name": "Block A" }
      },
      "assignedTo": { "id": "uuid", "email": "tech@uni.edu" },
      "confirmedBy": null
    }
  ],
  "meta": {
    "total": 3,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

> Results are ordered by `createdAt` descending (newest first).

---

### `GET /maintenance`
**Get all maintenance requests (paginated, with filters)**  
**Role required:** `ADMIN`, `SUPER_ADMIN`, or `MAINTENANCE`

#### Query Parameters
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Items per page (max 100) |
| `status` | string | — | Filter by status (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`, `REJECTED`) |
| `priority` | string | — | Filter by priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`) |
| `category` | string | — | Filter by category (`PLUMBING`, `ELECTRICAL`, `FURNITURE`, `OTHER`) |
| `assignedToUserId` | uuid | — | Filter by assigned maintenance user |

> Results are ordered by `priority DESC`, then `createdAt ASC` — highest priority and oldest first (ideal work queue order).

#### Success Response — `200 OK`
Same structure as `/maintenance/my` with full pagination meta. Each item also includes `reportedBy`:
```json
"reportedBy": { "id": "uuid", "email": "student@uni.edu" }
```

#### Error Responses
| Code | Reason |
|------|--------|
| `401` | Not authenticated |
| `403` | Insufficient role |

---

### `GET /maintenance/:id`
**Get a single maintenance request by ID**  
**Role required:** Any authenticated user  
**Access rule:** Staff can view any request; students can only view their own.

#### Success Response — `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "roomId": "uuid",
    "reportedByUserId": "uuid",
    "assignedToUserId": "uuid",
    "confirmedByUserId": null,
    "category": "ELECTRICAL",
    "priority": "URGENT",
    "status": "IN_PROGRESS",
    "title": "Power outlet sparking",
    "description": "The outlet near the desk sparks when plugging in a phone charger.",
    "resolvedAt": null,
    "confirmedAt": null,
    "createdAt": "2026-04-23T08:00:00.000Z",
    "updatedAt": "2026-04-23T09:00:00.000Z",
    "room": {
      "id": "uuid",
      "roomNumber": "205",
      "dorm": { "id": "uuid", "name": "Block B" }
    },
    "reportedBy": { "id": "uuid", "email": "student@uni.edu" },
    "assignedTo": { "id": "uuid", "email": "electrician@uni.edu" },
    "confirmedBy": null
  }
}
```

#### Error Responses
| Code | Reason |
|------|--------|
| `403` | Student attempting to view someone else's request |
| `404` | Request not found |

---

### `PUT /maintenance/:id` / `PATCH /maintenance/:id`
**Update a maintenance request (status, priority, or assignee)**  
**Role required:** `ADMIN`, `SUPER_ADMIN`, or `MAINTENANCE`

Both `PUT` and `PATCH` behave identically — send only the fields you want to change.

#### Request Body
```json
{
  "status": "OPEN | IN_PROGRESS | RESOLVED | REJECTED",
  "priority": "LOW | MEDIUM | HIGH | URGENT",
  "assignedToUserId": "uuid | null"
}
```

All fields are optional, but **at least one must be provided**.

- Set `assignedToUserId` to a valid UUID to assign a maintenance user.
- Set `assignedToUserId` to `null` to unassign.
- The target user must have the `MAINTENANCE` role and `ACTIVE` status.

**Auto-assign rule:** If a `MAINTENANCE` user sets status to `IN_PROGRESS` or `RESOLVED` without providing `assignedToUserId`, and the request has no current assignee, they are automatically assigned to themselves.

**Timestamp rules:**
- Setting `status` → `RESOLVED` records `resolvedAt`.
- Moving back from `RESOLVED` to any earlier status clears `resolvedAt`, `confirmedAt`, and unlinks `confirmedBy`.

#### Success Response — `200 OK`
Same shape as the single-request response (`GET /maintenance/:id`).

#### Error Responses
| Code | Reason |
|------|--------|
| `400` | No fields provided / `assignedToUserId` is not a MAINTENANCE user |
| `403` | Insufficient role |
| `404` | Request not found |

---

### `POST /maintenance/:id/confirm-fixed`
**Student confirms their issue is resolved (moves status to CLOSED)**  
**Role required:** `STUDENT`  
**Access rule:** Only the student who originally reported the request can call this.

#### Request Body
Empty — send `{}` or no body.

#### Precondition
The request must currently be in `RESOLVED` status. Calling this on an already-`CLOSED` request is a no-op (returns `200` with the current state).

#### Success Response — `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "CLOSED",
    "confirmedAt": "2026-04-23T14:00:00.000Z",
    "confirmedBy": { "id": "uuid", "email": "student@uni.edu" },
    ...
  }
}
```

#### Error Responses
| Code | Reason |
|------|--------|
| `400` | Request is not in `RESOLVED` status |
| `403` | Caller is not the original reporter |
| `404` | Request not found |

---

## Common Error Response Shape

All errors follow this format:
```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

Zod validation errors (status `400`) may return a more detailed structure with a `details` array if the global error handler is configured to expose them.

---

## Pagination Meta

All list endpoints return a `meta` object:
```json
{
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

---

## Frontend Integration Checklist

- [ ] **Student submit form:** Pre-fill `roomId` from the student's current allocation — do not let students type it manually.
- [ ] **Student dashboard:** Use `GET /maintenance/my` to show their request history. Poll or use websockets for live status updates.
- [ ] **Student detail page:** Show a "Confirm Fix" button only when `status === "RESOLVED"` and the current user is the reporter.
- [ ] **Staff queue:** Use `GET /maintenance` with `status=OPEN` or `status=IN_PROGRESS` to build the work queue. Default sort (priority DESC, createdAt ASC) is already correct for triage.
- [ ] **Staff assign:** Send `PUT /maintenance/:id` with `{ "assignedToUserId": "uuid" }`. Fetch the list of MAINTENANCE users from the user management API to populate the dropdown.
- [ ] **Staff status update:** Send `PUT /maintenance/:id` with `{ "status": "IN_PROGRESS" }` etc. `CLOSED` is not a valid update target via this endpoint — it is set only by the student confirm-fixed flow.
- [ ] **Filter UI:** Offer filter dropdowns for `status`, `priority`, `category`. Pass them as query params to `GET /maintenance`.
