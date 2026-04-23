# End-to-End API Flow

This document is the practical integration guide for the current backend flow, from environment setup and super-admin bootstrap through student onboarding and dorm application management.

## 1) Scope

This guide covers:

- backend startup and SMTP prerequisites
- one-time SUPER_ADMIN bootstrap
- admin-created student accounts
- first-login temporary-password flow
- authenticated student profile updates
- dorm application submission, viewing, and editing
- admin and dorm-head application actions

This guide reflects the current backend behavior in code.

## 2) Base URL and Common Conventions

Base URL:

- `http://localhost:3002/api/v1`

Common headers:

- `Content-Type: application/json`
- `Authorization: Bearer <access-token>` for protected endpoints

Success response wrapper:

```json
{
  "success": true,
  "message": "Optional message",
  "data": {}
}
```

Paginated response wrapper:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "total": 12,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

Error response wrapper:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

## 3) Environment Setup

In `backend/.env`, configure the database, JWT, and SMTP values required by your environment.

Minimal example:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/dorm_management
PORT=3002
NODE_ENV=development

JWT_SECRET=replace-with-long-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=replace-with-long-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_sender@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=your_sender@gmail.com
```

Start the backend:

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:push
npm run dev
```

Notes:

- `POST /auth/register` exists, but self-registration is currently disabled and returns `403`.
- Student onboarding is handled by administrators via `POST /users`.
- For real student onboarding emails, SMTP must be configured.

## 4) One-Time SUPER_ADMIN Bootstrap

If no SUPER_ADMIN exists yet, create one from the `backend` directory with:

```bash
node -r dotenv/config -e 'const bcrypt=require("bcryptjs"); const {PrismaClient,RoleCode,UserStatus}=require("./generated/prisma"); const {PrismaPg}=require("@prisma/adapter-pg"); (async()=>{const adapter=new PrismaPg({connectionString:process.env.DATABASE_URL}); const prisma=new PrismaClient({adapter}); const email="superadmin@example.com"; const password="SuperAdmin#2026"; const role=await prisma.role.upsert({where:{code:RoleCode.SUPER_ADMIN},update:{},create:{code:RoleCode.SUPER_ADMIN,name:"SUPER_ADMIN",description:"System role: SUPER_ADMIN"}}); let user=await prisma.user.findUnique({where:{email}}); if(!user){user=await prisma.user.create({data:{email,passwordHash:await bcrypt.hash(password,12),status:UserStatus.ACTIVE}});} const existing=await prisma.userRole.findFirst({where:{userId:user.id,roleId:role.id}}); if(!existing){await prisma.userRole.create({data:{userId:user.id,roleId:role.id}});} console.log("SUPER_ADMIN ready", email, password); await prisma.$disconnect();})().catch((e)=>{console.error(e); process.exit(1);});'
```

Then log in:

`POST /api/v1/auth/login`

```json
{
  "email": "superadmin@example.com",
  "password": "SuperAdmin#2026"
}
```

Typical success response:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "<access-token>",
    "refreshToken": "<refresh-token>",
    "user": {
      "id": "uuid",
      "email": "superadmin@example.com",
      "status": "ACTIVE",
      "roles": ["SUPER_ADMIN"],
      "student": null
    }
  }
}
```

Save:

- `adminAccessToken = data.token`

## 5) Authentication Flow Summary

The backend currently supports:

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/change-temporary-password`
- `GET /auth/me`

Login identifier rules:

- You may authenticate using `email + password`
- Students may also authenticate using `studentNumber + password`

Temporary-password behavior:

- student accounts created by admin are marked `mustChangePassword = true`
- first student login does not issue tokens
- instead it returns `requiresPasswordChange: true`
- the student must call `POST /auth/change-temporary-password`

Refresh-token behavior:

- refresh token rotation is enabled
- replayed or reused refresh tokens are rejected

Account lock behavior:

- repeated failed logins can suspend the account
- suspended or inactive accounts cannot log in

## 6) Student Onboarding Flow

### Step 1: Admin creates the student account

Endpoint:

- `POST /api/v1/users`

Auth:

- `ADMIN` or `SUPER_ADMIN`

Request:

```json
{
  "email": "student1@example.com",
  "roleCodes": ["STUDENT"],
  "studentProfile": {
    "studentNumber": "UGR/1243/13",
    "firstName": "Abebe",
    "fatherName": "Kebede",
    "grandfatherName": "Tadesse",
    "gender": "MALE",
    "studyYear": "I",
    "department": "Software Engineering",
    "phone": "0911223344",
    "guardianName": "Parent Name",
    "guardianPhone": "0911000001",
    "emergencyContactName": "Emergency Contact",
    "emergencyContactPhone": "0911000002",
    "hasDisability": false
  }
}
```

What the backend does:

- creates the `users` record
- creates the linked `students` record
- assigns the `STUDENT` role
- generates a temporary password automatically for student accounts
- stores only the hashed password
- marks the user for first-login password change
- sends the temporary password by email

Development note:

- in development mode the create-user response may include `temporaryPasswordPreview`
- do not rely on this in production

Success:

- `201 Created`

### Step 2: Student first login with temporary password

Endpoint:

- `POST /api/v1/auth/login`

Request:

```json
{
  "studentNumber": "UGR/1243/13",
  "password": "TEMP_PASSWORD_FROM_EMAIL"
}
```

Expected first-login response:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "requiresPasswordChange": true,
    "message": "First login requires password change.",
    "identifier": {
      "email": "student1@example.com",
      "studentNumber": "UGR/1243/13"
    }
  }
}
```

Important:

- no JWT tokens are issued in this step

### Step 3: Student changes temporary password

Endpoint:

- `POST /api/v1/auth/change-temporary-password`

Request:

```json
{
  "studentNumber": "UGR/1243/13",
  "temporaryPassword": "TEMP_PASSWORD_FROM_EMAIL",
  "newPassword": "MyStrongPass#2026"
}
```

Success response:

```json
{
  "success": true,
  "message": "Password changed successfully",
  "data": {
    "changed": true
  }
}
```

### Step 4: Student logs in normally

Endpoint:

- `POST /api/v1/auth/login`

Request:

```json
{
  "studentNumber": "UGR/1243/13",
  "password": "MyStrongPass#2026"
}
```

Save:

- `studentAccessToken = data.token`
- `studentRefreshToken = data.refreshToken`

### Step 5: Student checks authenticated profile

Endpoint:

- `GET /api/v1/auth/me`

Header:

- `Authorization: Bearer <studentAccessToken>`

Returns:

- sanitized user profile
- role list
- linked student profile if the user is a student

## 7) Student Self-Service Profile Update

Endpoint:

- `PATCH /api/v1/users/me`

Header:

- `Authorization: Bearer <studentAccessToken>`

Allowed fields:

- `phone`
- `department`
- `guardianName`
- `guardianPhone`
- `emergencyContactName`
- `emergencyContactPhone`
- `hasDisability`
- `disabilityNotes`
- `scholarshipNotes`

Request example:

```json
{
  "phone": "0911000000",
  "guardianName": "Parent Name",
  "guardianPhone": "0911000001",
  "emergencyContactName": "Emergency Contact",
  "emergencyContactPhone": "0911000002",
  "hasDisability": false,
  "department": "Software Engineering"
}
```

Success:

- `200 OK`

## 8) Dorm Application Prerequisites

Before a student submits an application:

- the student account and linked student profile must already exist
- the chosen academic year label must exist in `academic_years.label`
- the current date must be within that academic year's `applicationOpenDate` and `applicationCloseDate`

Current request model for applications:

- academic year is chosen by label string such as `2025/26`
- document uploads are represented by stored metadata in the request body
- `location.currentSubcity` is required
- `location.currentWoreda` is optional

## 9) Application Document Rules

Supported document types:

- `ID_IMAGE`
- `HIGHSCHOOL_TRANSCRIPT`
- `ENTRANCE_EXAM_RESULT`
- `KEBELE_VERIFICATION`
- `STAFF_RECOGNITION`
- `MEDICAL_DOCUMENT`

Required document types on create:

- `ID_IMAGE`
- `HIGHSCHOOL_TRANSCRIPT`
- `ENTRANCE_EXAM_RESULT`
- `KEBELE_VERIFICATION`

Allowed mime types:

- `application/pdf`
- `image/jpeg`
- `image/png`

Max file size:

- `10 MB` per document

## 10) Student Submits Dorm Application

Endpoint:

- `POST /api/v1/applications`

Auth:

- `STUDENT`

Request:

```json
{
  "studentFullName": "Abebe Kebede Tadesse",
  "studentNumber": "UGR/1243/13",
  "academicYear": "2025/26",
  "department": "Software Engineering",
  "guardianName": "Parent Name",
  "guardianPhone": "0911000001",
  "location": {
    "currentSubcity": "BOLE",
    "currentWoreda": "08"
  },
  "medicalCondition": "Asthma",
  "documents": [
    {
      "type": "ID_IMAGE",
      "originalName": "id.jpg",
      "storagePath": "uploads/id.jpg",
      "mimeType": "image/jpeg",
      "sizeBytes": 120000
    },
    {
      "type": "HIGHSCHOOL_TRANSCRIPT",
      "originalName": "hs.pdf",
      "storagePath": "uploads/hs.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 220000
    },
    {
      "type": "ENTRANCE_EXAM_RESULT",
      "originalName": "entrance.pdf",
      "storagePath": "uploads/entrance.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 180000
    },
    {
      "type": "KEBELE_VERIFICATION",
      "originalName": "kebele.pdf",
      "storagePath": "uploads/kebele.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 175000
    }
  ]
}
```

What the backend does:

- validates the payload and required document types
- resolves `academicYear` by label
- prevents duplicate applications for the same student and academic year
- writes the application as `PENDING`
- generates `referenceNumber` in the format `REQ-YYYY-NNNN`
- sets `canEditUntil = submittedAt + 24 hours`
- syncs some request fields back to the linked `students` row

Fields that are also written to the `students` table:

- `studentNumber`
- `department`
- `guardianName`
- `guardianPhone`

Fields that remain on the application record:

- `studentFullName`
- `academicYearId`
- `currentSubcity`
- `currentWoreda`
- `medicalCondition`
- `referenceNumber`
- `status`
- document metadata

Success response:

```json
{
  "success": true,
  "message": "Application submitted",
  "data": {
    "studentFullName": "Abebe Kebede Tadesse",
    "referenceNumber": "REQ-2026-0842",
    "submittedAt": "2026-04-24T09:31:00.000Z"
  }
}
```

Typical errors:

- `404` student profile not found
- `400` academic year not found
- `400` outside selected academic year application window
- `409` only one application is allowed per academic year

## 11) Student Views Own Applications

Endpoint:

- `GET /api/v1/applications/my`

Auth:

- `STUDENT`

Behavior:

- returns an array ordered by `submittedAt desc`
- includes scalar application fields such as:
  - `id`
  - `referenceNumber`
  - `status`
  - `submittedAt`
  - `canEditUntil`
- also includes:
  - selected academic year fields
  - linked student snapshot fields returned through the `student` relation
  - document records
  - allocation details when available

Example response shape:

```json
{
  "success": true,
  "data": [
    {
      "id": "application-uuid",
      "studentFullName": "Abebe Kebede Tadesse",
      "referenceNumber": "REQ-2026-0842",
      "status": "PENDING",
      "currentSubcity": "BOLE",
      "currentWoreda": "08",
      "medicalCondition": "Asthma",
      "submittedAt": "2026-04-24T09:31:00.000Z",
      "canEditUntil": "2026-04-25T09:31:00.000Z",
      "academicYear": {
        "id": "academic-year-uuid",
        "label": "2025/26"
      },
      "student": {
        "id": "student-uuid",
        "userId": "user-uuid",
        "studentNumber": "UGR/1243/13",
        "department": "Software Engineering",
        "guardianName": "Parent Name",
        "guardianPhone": "0911000001"
      },
      "documents": []
    }
  ]
}
```

## 12) Student Updates Application

Endpoint:

- `PATCH /api/v1/applications/:id/my`

Auth:

- `STUDENT`

Editable only when:

- `status === "PENDING"`
- and either:
  - `now < canEditUntil`
  - or `now < editOverrideUntil`

Allowed fields:

- `studentFullName`
- `studentNumber`
- `academicYear`
- `department`
- `guardianName`
- `guardianPhone`
- `location.currentSubcity`
- `location.currentWoreda`
- `medicalCondition`
- `documents`

Request example:

```json
{
  "studentFullName": "Abebe Kebede Tadesse",
  "academicYear": "2025/26",
  "department": "Software Engineering",
  "guardianName": "Updated Parent Name",
  "guardianPhone": "0911000002",
  "location": {
    "currentSubcity": "YEKA",
    "currentWoreda": "11"
  },
  "medicalCondition": "Asthma",
  "documents": [
    {
      "type": "ID_IMAGE",
      "originalName": "id-new.jpg",
      "storagePath": "uploads/id-new.jpg",
      "mimeType": "image/jpeg",
      "sizeBytes": 125000
    },
    {
      "type": "HIGHSCHOOL_TRANSCRIPT",
      "originalName": "hs.pdf",
      "storagePath": "uploads/hs.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 220000
    },
    {
      "type": "ENTRANCE_EXAM_RESULT",
      "originalName": "entrance.pdf",
      "storagePath": "uploads/entrance.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 180000
    },
    {
      "type": "KEBELE_VERIFICATION",
      "originalName": "kebele.pdf",
      "storagePath": "uploads/kebele.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 175000
    }
  ]
}
```

Update behavior:

- if `documents` is included, the payload must still contain at least the four required document types
- if `documents` is included, existing application documents are deleted and recreated
- `studentNumber`, `department`, `guardianName`, and `guardianPhone` are synced back to `students`
- `referenceNumber` and `submittedAt` are not editable

Typical errors:

- `404` application not found
- `403` application is no longer editable
- `409` only one application is allowed per academic year

## 13) Admin and Dorm Office Application Endpoints

### A) List applications

Endpoint:

- `GET /api/v1/applications`

Auth:

- `ADMIN` or `SUPER_ADMIN`

Supported query params:

- `page`
- `limit`
- `status`
- `academicYearId`

Behavior:

- paginated response
- ordered by `finalPriorityScore desc`

### B) Get one application by id

Endpoint:

- `GET /api/v1/applications/:id`

Current route protection:

- authenticated user required

Note:

- the route currently does not add role restrictions beyond authentication

### C) Review application

Endpoint:

- `PUT /api/v1/applications/:id/review`

Auth:

- `ADMIN` or `SUPER_ADMIN`

Request:

```json
{
  "status": "APPROVED",
  "reviewNote": "All required documents are valid."
}
```

Allowed review statuses:

- `APPROVED`
- `REJECTED`
- `WAITLISTED`

Rule:

- only `PENDING` applications can be reviewed

### D) Extend edit window

Endpoint:

- `PATCH /api/v1/applications/:id/edit-override`

Auth:

- `DORM_HEAD` or `SUPER_ADMIN`

Request:

```json
{
  "editOverrideUntil": "2026-06-01T12:00:00.000Z"
}
```

### E) Run allocation

Endpoint:

- `POST /api/v1/applications/run-allocation`

Auth:

- `ADMIN` or `SUPER_ADMIN`

Current behavior:

- loads the active academic year
- requires an active semester under that academic year
- processes applications with `status = APPROVED`
- assigns the first available bed
- updates application status to `ALLOCATED`
- marks unassigned applications as `WAITLISTED`

## 14) Application Status Lifecycle

Current application statuses:

- `PENDING`
- `APPROVED`
- `REJECTED`
- `WAITLISTED`
- `ALLOCATED`
- `CANCELLED`

Typical flow:

1. student submits application -> `PENDING`
2. admin reviews -> `APPROVED`, `REJECTED`, or `WAITLISTED`
3. allocation run may move approved applications to `ALLOCATED`

## 15) Common Error Reference

Common statuses you should expect in frontend/Postman flows:

- `400` validation failure or business-rule failure
- `401` invalid or expired token, invalid credentials, inactive account
- `403` self-registration disabled, password change required, insufficient permission, or edit window closed
- `404` user, student, or application not found
- `409` duplicate user/application conflict
- `423` account locked due to repeated failed login attempts

Validation failures use this shape:

```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "fieldName": [
      "Error message"
    ]
  }
}
```

## 16) Practical Notes

- `POST /auth/register` is intentionally disabled even though the route exists.
- Student onboarding is admin-driven, not public-signup-driven.
- Application academic year is selected by label string such as `2025/26`, not by UUID in the student request body.
- `/applications/my` already returns `status`.
- Editing an application currently updates both the application record and selected fields in the `students` table.
- Document requests currently store upload metadata such as `storagePath`; this guide does not define a separate file-upload endpoint.
