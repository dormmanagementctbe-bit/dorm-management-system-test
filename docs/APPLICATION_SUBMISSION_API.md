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
  "hasDisability": false,
  "hasMedicalCondition": true,
  "disabilityTags": ["VISION_IMPAIRMENT"],
  "medicalConditionTags": ["ASTHMA"],
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

On submit:
- Status is `PENDING`.
- A request reference number is generated, e.g. `REQ-2026-0842`.
- `canEditUntil` is set to `submittedAt + 24 hours`.
- The selected academic year label is resolved against `academic_years.label`.
- One application per student per selected academic year is enforced.
- The linked student profile is synced for `studentNumber`, `department`, `guardianName`, and `guardianPhone`.

Success response data:
```json
{
  "studentFullName": "Abebe Kebede Tadesse",
  "referenceNumber": "REQ-2026-0842",
  "submittedAt": "2026-04-24T09:31:00.000Z"
}
```

Possible errors:
- `404` student profile not found
- `400` academic year not found
- `400` outside selected academic year application open/close window
- `409` already submitted for this academic year

Academic year setup note:
- `academicYear` is not created automatically from the student request body.
- A matching row must already exist in `academic_years.label`.
- If you are bootstrapping locally, you can create one with:

```bash
npm run seed:academic-year -- \
  --label 2025/26 \
  --start-date 2025-09-01 \
  --end-date 2026-06-30 \
  --open-date 2026-04-01 \
  --close-date 2026-06-30 \
  --active
```

- If you also want allocation to work later for that same academic year, create an active semester too:

```bash
npm run seed:academic-year -- \
  --label 2025/26 \
  --start-date 2025-09-01 \
  --end-date 2026-06-30 \
  --open-date 2026-04-01 \
  --close-date 2026-06-30 \
  --active \
  --semester-name "Semester 2" \
  --semester-start-date 2026-02-01 \
  --semester-end-date 2026-06-30 \
  --semester-open-date 2026-04-01 \
  --semester-close-date 2026-06-30 \
  --semester-active
```

## Update Own Application
- `PATCH /applications/:id/my`
- Role: `STUDENT`
- Auth required

Allowed fields:
- `studentFullName`
- `studentNumber`
- `academicYear`
- `department`
- `guardianName`
- `guardianPhone`
- `location.currentSubcity`
- `location.currentWoreda`
- `hasDisability`
- `hasMedicalCondition`
- `disabilityTags`
- `medicalConditionTags`
- `medicalCondition`
- `documents`

Restrictions:
- Application must be `PENDING`.
- Update allowed only until `canEditUntil`.
- `editOverrideUntil` can extend window when set by dorm head/super admin.

Not editable here:
- `referenceNumber`
- `submittedAt`
- admin review fields/status transitions (handled by admin routes)

## Student View Own Applications
- `GET /applications/my`
- Role: `STUDENT`

Returns own applications with `status`, academic year, submitted applicant snapshot, synced student profile fields, documents, and allocation.

## Uploading Documents (Local Storage)

The backend supports local uploads for application documents.

### `POST /uploads`
**Auth required**

Send `multipart/form-data` with a single file field named `file`.

#### Success Response
```json
{
  "success": true,
  "data": {
    "originalName": "id.jpg",
    "storagePath": "uploads/1714387200000-123456789.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 120000
  }
}
```

Use the returned `storagePath` in the application `documents` payload.

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
