# Auth and User Management API

This document reflects the **current code and schema** (`RoleCode`, `UserStatus`, `user_roles`, `studentNumber`, soft delete via `status + deletedAt`).

## Base URL
- `http://localhost:3001/api/v1`
- Backward-compatible alias: `http://localhost:3001/api`

## Common Headers
- `Content-Type: application/json`
- `Authorization: Bearer <token>` for protected routes

## Authentication Notes
- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, and `POST /auth/change-temporary-password` are rate-limited.
- Auth middleware validates token and then checks DB user status:
  - must be `status=ACTIVE`
  - must have `deletedAt=null`
- Access token and refresh token policy:
  - Access token lifetime defaults to `15m` (`JWT_EXPIRES_IN`).
  - Refresh token lifetime defaults to `7d` (`JWT_REFRESH_EXPIRES_IN`).
  - Use `POST /auth/refresh` to rotate tokens.
  - Refresh tokens are backed by DB sessions (`token jti + hash`).
  - Reusing a previously rotated/revoked refresh token triggers reuse detection and revokes active refresh sessions for that user.
- Login security policy:
  - Progressive backoff is applied after each failed login attempt.
  - Account is auto-suspended after `AUTH_MAX_FAILED_LOGINS` consecutive failed attempts.
  - Locked account login may return `423` on lock event; subsequent attempts return inactive/blocked response.
- Password security policy:
  - Minimum length is controlled by `PASSWORD_MIN_LENGTH` (default `12`).
  - Must include uppercase, lowercase, number, and special character.
  - Common breached passwords are blocked.
  - Optional Have I Been Pwned k-anonymity check can be enabled (`HIBP_API_ENABLED=true`).
- Privileged account onboarding policy:
  - `ADMIN`, `DORM_HEAD`, and `MAINTENANCE` accounts can only be created/assigned by `SUPER_ADMIN`.
  - Newly created/assigned privileged accounts must change temporary credentials before first successful login.
  - Temporary credential expiry is controlled by `TEMP_PASSWORD_EXPIRY_DAYS`.

## Role Codes
- `STUDENT`
- `DORM_HEAD`
- `ADMIN`
- `SUPER_ADMIN`
- `MAINTENANCE`

## User Status Values
- `ACTIVE`
- `INACTIVE`
- `SUSPENDED`

---

## 1) Register Student
- Method: `POST`
- Endpoint: `/auth/register`
- Auth: No

### Request Body
```json
{
  "email": "student@example.com",
  "password": "Password123!",
  "studentNumber": "STU-2026-001",
  "firstName": "Jane",
  "middleName": "M",
  "lastName": "Doe",
  "gender": "FEMALE",
  "studyYear": 3,
  "department": "Computer Science",
  "phone": "0912000000",
  "guardianName": "Parent Name",
  "guardianPhone": "0912000001",
  "emergencyContactName": "Emergency Person",
  "emergencyContactPhone": "0912000002",
  "hasDisability": false,
  "disabilityNotes": "",
  "scholarshipNotes": ""
}
```

### Required Fields
- `email`
- `password` (min `PASSWORD_MIN_LENGTH`, default 12, with complexity requirements)
- `studentNumber`
- `firstName`
- `lastName`
- `gender` (`MALE|FEMALE`)
- `studyYear` (1..8)

### Success Response (`201`)
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "token": "<jwt>",
    "refreshToken": "<refresh-jwt>",
    "user": {
      "id": "uuid",
      "email": "student@example.com",
      "status": "ACTIVE",
      "roles": ["STUDENT"],
      "student": {
        "studentNumber": "STU-2026-001",
        "firstName": "Jane",
        "lastName": "Doe"
      }
    }
  }
}
```

### Status Codes
- `201` Created
- `400` Validation failed
- `409` Email already in use

---

## 2) Login
- Method: `POST`
- Endpoint: `/auth/login`
- Auth: No

### Request Body
```json
{
  "email": "student@example.com",
  "password": "Password123!"
}
```

### Success Response (`200`)
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "<jwt>",
    "refreshToken": "<refresh-jwt>",
    "user": {
      "id": "uuid",
      "email": "student@example.com",
      "status": "ACTIVE",
      "roles": ["STUDENT"]
    }
  }
}
```

### Status Codes
- `200` OK
- `400` Validation failed
- `401` Invalid credentials or inactive account
- `423` Account locked due to repeated failed attempts

---

## 3) Refresh Access Token
- Method: `POST`
- Endpoint: `/auth/refresh`
- Auth: No (uses refresh token in body)

### Request Body
```json
{
  "refreshToken": "<refresh-jwt>"
}
```

### Success Response (`200`)
```json
{
  "success": true,
  "message": "Token refreshed",
  "data": {
    "token": "<new-access-jwt>",
    "refreshToken": "<new-refresh-jwt>",
    "user": {
      "id": "uuid",
      "email": "student@example.com",
      "status": "ACTIVE",
      "roles": ["STUDENT"]
    }
  }
}
```

### Status Codes
- `200` OK
- `401` Invalid/expired refresh token

---

## 4) Get Current Authenticated User
- Method: `GET`
- Endpoint: `/auth/me`
- Auth: Yes

### Success Response (`200`)
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "student@example.com",
    "status": "ACTIVE",
    "roles": ["STUDENT"],
    "student": {
      "studentNumber": "STU-2026-001",
      "firstName": "Jane",
      "lastName": "Doe"
    }
  }
}
```

### Status Codes
- `200` OK
- `401` Missing/invalid token or inactive user
- `404` User not found

---

## 5) Change Temporary Password (Privileged Onboarding)
- Method: `POST`
- Endpoint: `/auth/change-temporary-password`
- Auth: No (uses temporary credentials in body)

### Request Body
```json
{
  "email": "staff@example.com",
  "temporaryPassword": "Password123!",
  "newPassword": "NewPassword123!"
}
```

### Behavior
- Only applicable to privileged roles: `ADMIN`, `DORM_HEAD`, `MAINTENANCE`.
- Clears onboarding markers after successful change.
- New password must pass the strong password policy.

### Status Codes
- `200` Password changed
- `400` Unable to change temporary password

### Security Behavior
- Failure responses are intentionally normalized to prevent account/role enumeration.
- Detailed rejection reasons are recorded internally in audit logs.

---

## 6) Get Current User Profile
- Method: `GET`
- Endpoint: `/users/me`
- Auth: Yes

### Status Codes
- `200` OK
- `401` Unauthorized
- `404` User not found

---

## 7) Update Current User Profile
- Method: `PATCH`
- Endpoint: `/users/me`
- Auth: Yes

### Request Body (any subset)
```json
{
  "firstName": "Updated",
  "middleName": "M",
  "lastName": "Name",
  "phone": "0912555123",
  "department": "Software Engineering"
}
```

### Password Change Payload
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword123!"
}
```

### Validation Rule
- If `newPassword` is provided, `currentPassword` is required.

### Status Codes
- `200` OK
- `400` Validation failed
- `401` Current password is incorrect
- `404` User not found

---

## 8) Self Deactivate Current Student Account
- Method: `DELETE`
- Endpoint: `/users/me`
- Auth: Yes

### Behavior
- Only `STUDENT` users can self-deactivate.
- Sets:
  - `status = INACTIVE`
  - `deletedAt = now()`

### Status Codes
- `200` Account deactivated
- `400` Already inactive
- `401` Unauthorized
- `403` Only student accounts can self-deactivate
- `404` User not found

---

## 9) List Users (Admin)
- Method: `GET`
- Endpoint: `/users`
- Auth: Yes
- Required role: `ADMIN` or `SUPER_ADMIN`

### Query Params
- `page` (optional, integer >=1)
- `limit` (optional, integer 1..100)
- `search` (optional)
- `includeInactive` (optional: `true|false`)

### Example
`/users?page=1&limit=20&search=jane&includeInactive=true`

### Status Codes
- `200` OK
- `401` Unauthorized
- `403` Forbidden

---

## 10) Get User by ID (Admin)
- Method: `GET`
- Endpoint: `/users/:id`
- Auth: Yes
- Required role: `ADMIN` or `SUPER_ADMIN`

### Path Params
- `id` (user UUID)

### Query Params
- `includeInactive` (optional: `true|false`)

### Status Codes
- `200` OK
- `401` Unauthorized
- `403` Forbidden
- `404` User not found

---

## 11) Create User (Admin)
- Method: `POST`
- Endpoint: `/users`
- Auth: Yes
- Required role: `ADMIN` or `SUPER_ADMIN`

### Request Body
```json
{
  "email": "newuser@example.com",
  "password": "Password123!",
  "roleCodes": ["STUDENT"],
  "studentProfile": {
    "studentNumber": "STU-2026-010",
    "firstName": "New",
    "middleName": "",
    "lastName": "User",
    "gender": "MALE",
    "studyYear": 1,
    "department": "Mathematics",
    "phone": "0912000010",
    "guardianName": "Guardian",
    "guardianPhone": "0912000011",
    "emergencyContactName": "Emergency",
    "emergencyContactPhone": "0912000012",
    "hasDisability": false,
    "disabilityNotes": "",
    "scholarshipNotes": ""
  }
}
```

### Rules
- `roleCodes` is an array of role codes.
- If `roleCodes` includes `STUDENT`, `studentProfile` is required.
- Non-`SUPER_ADMIN` cannot assign `SUPER_ADMIN`.
- `ADMIN`, `DORM_HEAD`, and `MAINTENANCE` can only be created by `SUPER_ADMIN`.
- Privileged accounts are provisioned with temporary credentials and must change password before first login.

### Status Codes
- `201` Created
- `400` Validation error / missing student profile
- `401` Unauthorized
- `403` Forbidden
- `409` Email conflict

---

## 12) Update User by ID (Admin)
- Method: `PATCH`
- Endpoint: `/users/:id`
- Auth: Yes
- Required role: `ADMIN` or `SUPER_ADMIN`

### Path Params
- `id` (user UUID)

### Request Body (any subset)
```json
{
  "email": "updated@example.com",
  "roleCodes": ["MAINTENANCE"],
  "studentProfile": {
    "firstName": "Updated",
    "studyYear": 4
  }
}
```

### Important Behavior
- `status` is not accepted by this endpoint payload.
- Use `DELETE /users/:id` and `PATCH /users/:id/reactivate` to manage active/inactive state.
- Non-`SUPER_ADMIN` cannot assign `SUPER_ADMIN`, `ADMIN`, `DORM_HEAD`, or `MAINTENANCE`.
- Assigning privileged roles sets a temporary-password-change requirement.

### Status Codes
- `200` OK
- `400` Invalid operation/payload
- `401` Unauthorized
- `403` Forbidden
- `404` User not found
- `409` Email conflict

---

## 13) Deactivate User (Soft Delete)
- Method: `DELETE`
- Endpoint: `/users/:id`
- Auth: Yes
- Required role: `ADMIN` or `SUPER_ADMIN`

### Path Params
- `id` (user UUID)

### Behavior
- Sets:
  - `status = INACTIVE`
  - `deletedAt = now()`
- User can no longer authenticate.

### Status Codes
- `200` User deactivated
- `400` Invalid operation (e.g., self-deactivate)
- `401` Unauthorized
- `403` Forbidden
- `404` User not found

---

## 14) Reactivate User
- Method: `PATCH`
- Endpoint: `/users/:id/reactivate`
- Auth: Yes
- Required role: `ADMIN` or `SUPER_ADMIN`

### Path Params
- `id` (user UUID)

### Behavior
- Sets:
  - `status = ACTIVE`
  - `deletedAt = null`

### Status Codes
- `200` User reactivated
- `400` Already active
- `401` Unauthorized
- `403` Forbidden
- `404` User not found

---

## Common Error Shapes

### Validation (`400`)
```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "fieldName": ["message"]
  }
}
```

### Auth (`401`)
```json
{
  "success": false,
  "error": "Authentication token required"
}
```

### Forbidden (`403`)
```json
{
  "success": false,
  "error": "Insufficient permissions"
}
```
