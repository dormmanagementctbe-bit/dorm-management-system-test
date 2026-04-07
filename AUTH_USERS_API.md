# Auth and User Management API

This document reflects the **current code and schema** (`RoleCode`, `UserStatus`, `user_roles`, `studentNumber`, soft delete via `status + deletedAt`).

## Base URL
- `http://localhost:3001/api/v1`
- Backward-compatible alias: `http://localhost:3001/api`

## Common Headers
- `Content-Type: application/json`
- `Authorization: Bearer <token>` for protected routes

## Authentication Notes
- `POST /auth/register` and `POST /auth/login` are rate-limited.
- Auth middleware validates token and then checks DB user status:
  - must be `status=ACTIVE`
  - must have `deletedAt=null`
- Login security policy:
  - Progressive backoff is applied after each failed login attempt.
  - Account is auto-suspended after `AUTH_MAX_FAILED_LOGINS` consecutive failed attempts.
  - Locked account login may return `423` on lock event; subsequent attempts return inactive/blocked response.

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
- `password` (min 8)
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

## 3) Get Current Authenticated User
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

## 4) Get Current User Profile
- Method: `GET`
- Endpoint: `/users/me`
- Auth: Yes

### Status Codes
- `200` OK
- `401` Unauthorized
- `404` User not found

---

## 5) Update Current User Profile
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

## 6) List Users (Admin)
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

## 7) Get User by ID (Admin)
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

## 8) Create User (Admin)
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

### Status Codes
- `201` Created
- `400` Validation error / missing student profile
- `401` Unauthorized
- `403` Forbidden
- `409` Email conflict

---

## 9) Update User by ID (Admin)
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
- `status` field is accepted by DTO but intentionally blocked by service.
- Use `DELETE /users/:id` and `PATCH /users/:id/reactivate` to manage active/inactive state.

### Status Codes
- `200` OK
- `400` Invalid operation/payload
- `401` Unauthorized
- `403` Forbidden
- `404` User not found
- `409` Email conflict

---

## 10) Deactivate User (Soft Delete)
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

## 11) Reactivate User
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
