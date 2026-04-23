# Dorm Application Submission API (Current)

## Base URL
- `http://localhost:3002/api/v1`

## Student Submission Flow Endpoints
- `POST /applications` submit application
- `GET /applications/my` view own applications
- `PATCH /applications/:id/my` update own application (time/status restricted)

## Create Application
- `POST /applications`
- Role: `STUDENT`
- Auth required

Request:
```json
{
  "semesterId": "uuid",
  "currentCity": "Addis Ababa",
  "currentSubcity": "BOLE",
  "currentWoreda": "08",
  "hasDisability": false,
  "medicalConditions": [],
  "preferredDormIds": ["uuid"],
  "reason": "Need proximity",
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

On submit:
- Status is `PENDING`.
- `canEditUntil` is set to `submittedAt + 24 hours`.
- One application per student per active academic year is enforced.

Possible errors:
- `404` student profile not found
- `400` no active academic year
- `400` invalid/inactive semester
- `400` outside application open/close window
- `409` already submitted this academic year

## Update Own Application
- `PATCH /applications/:id/my`
- Role: `STUDENT`
- Auth required

Allowed fields:
- `currentSubcity`
- `currentWoreda`
- `hasDisability`
- `disabilityType`
- `medicalConditions`
- `reason`
- `preferredDormIds`
- `documents`

Restrictions:
- Application must be `PENDING`.
- Update allowed only until `canEditUntil`.
- `editOverrideUntil` can extend window when set by dorm head/super admin.

Not editable here:
- student identity/name/id fields
- admin review fields/status transitions (handled by admin routes)

## Student View Own Applications
- `GET /applications/my`
- Role: `STUDENT`

Returns own applications with academic year, semester, preferences, documents, allocation.

## Admin/Dorm Head Related
- `GET /applications` admin list
- `PUT /applications/:id/review` admin review (`APPROVED|REJECTED|WAITLISTED`)
- `PATCH /applications/:id/edit-override` dorm head/super admin extend edit window
- `POST /applications/run-allocation` admin allocation

## Application Status Enum
```prisma
enum ApplicationStatus {
  PENDING
  APPROVED
  REJECTED
  WAITLISTED
  ALLOCATED
  CANCELLED

  @@map("application_status")
}
```
