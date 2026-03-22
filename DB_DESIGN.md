# Database Design — Dorm Management System

## Overview

PostgreSQL database for a university Dorm Management System. The schema manages student dorm applications, room allocations, maintenance workflows, and in-app notifications across academic years.

**ORM:** Prisma
**Database:** PostgreSQL 14+
**Total models:** 10

---

## ER Diagram

```mermaid
erDiagram
    USER {
        uuid id PK
        string email UK
        string password_hash
        enum role "STUDENT | ADMIN | SUPER_ADMIN"
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    STUDENT {
        uuid id PK
        uuid user_id FK
        string student_id UK
        string first_name
        string last_name
        int academic_year
        string department
        string phone
        float distance_km
        boolean cost_sharing_eligible
        timestamp created_at
    }
    ADMIN {
        uuid id PK
        uuid user_id FK
        string first_name
        string last_name
        string phone
        enum admin_level "STAFF | MANAGER | SUPER"
        timestamp created_at
    }
    ACADEMIC_YEAR {
        uuid id PK
        string label UK
        date start_date
        date end_date
        boolean is_active
        date application_open
        date application_close
    }
    DORM {
        uuid id PK
        string name
        string location
        enum gender_policy "MALE | FEMALE | MIXED"
        int total_rooms
        boolean is_active
        timestamp created_at
    }
    ROOM {
        uuid id PK
        uuid dorm_id FK
        string room_number
        int capacity
        enum room_type "SINGLE | DOUBLE | TRIPLE | QUAD"
        enum status "AVAILABLE | OCCUPIED | MAINTENANCE | RESERVED"
        decimal monthly_rate
        timestamp created_at
    }
    DORM_APPLICATION {
        uuid id PK
        uuid student_id FK
        uuid academic_year_id FK
        uuid preferred_dorm_id FK
        enum status
        float priority_score
        text reason
        timestamp submitted_at
        timestamp reviewed_at
        uuid reviewed_by_id FK
        string review_note
    }
    ALLOCATION {
        uuid id PK
        uuid student_id FK
        uuid room_id FK
        uuid application_id FK UK
        uuid academic_year_id FK
        date start_date
        date end_date
        enum status "PENDING_CHECKIN | ACTIVE | EXPIRED | CANCELLED"
        uuid allocated_by_id FK
        timestamp created_at
    }
    MAINTENANCE_REQUEST {
        uuid id PK
        uuid room_id FK
        uuid reported_by_id FK
        enum category
        enum priority
        enum status
        string title
        text description
        uuid assigned_to_id FK
        timestamp resolved_at
        timestamp created_at
        timestamp updated_at
    }
    NOTIFICATION {
        uuid id PK
        uuid user_id FK
        string title
        text message
        enum type
        boolean is_read
        timestamp created_at
    }

    USER ||--o| STUDENT : "profile"
    USER ||--o| ADMIN : "profile"
    STUDENT ||--o{ DORM_APPLICATION : "submits"
    STUDENT ||--o{ ALLOCATION : "receives"
    DORM ||--o{ ROOM : "contains"
    ROOM ||--o{ ALLOCATION : "assigned in"
    ROOM ||--o{ MAINTENANCE_REQUEST : "subject of"
    DORM_APPLICATION }o--|| ACADEMIC_YEAR : "for"
    DORM_APPLICATION }o--o| DORM : "prefers"
    DORM_APPLICATION }o--o| ADMIN : "reviewed by"
    ALLOCATION }|--|| DORM_APPLICATION : "results from"
    ALLOCATION }o--|| ACADEMIC_YEAR : "in"
    ALLOCATION }o--|| ADMIN : "allocated by"
    MAINTENANCE_REQUEST }|--|| USER : "reported by"
    MAINTENANCE_REQUEST }o--o| ADMIN : "assigned to"
    USER ||--o{ NOTIFICATION : "receives"
```

---

## Table Descriptions

### `users`
Central auth identity table. Every person in the system (student or admin) has a User row.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `email` | TEXT UNIQUE | Login identifier |
| `password_hash` | TEXT | bcrypt-hashed |
| `role` | ENUM | `STUDENT`, `ADMIN`, `SUPER_ADMIN` |
| `is_active` | BOOLEAN | Soft-disable accounts |
| `created_at` | TIMESTAMPTZ | Auto-set |
| `updated_at` | TIMESTAMPTZ | Auto-updated |

---

### `students`
Profile for users with role `STUDENT`. Stores academic and geographic data used in priority scoring.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | CASCADE delete |
| `student_id` | TEXT UNIQUE | University-issued ID |
| `first_name` | TEXT | |
| `last_name` | TEXT | |
| `academic_year` | INT | 1–5 |
| `department` | TEXT | |
| `phone` | TEXT | Nullable |
| `distance_km` | FLOAT | Distance from home to campus |
| `cost_sharing_eligible` | BOOLEAN | Affects priority score |
| `created_at` | TIMESTAMPTZ | |

---

### `admins`
Profile for users with role `ADMIN` or `SUPER_ADMIN`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | CASCADE delete |
| `first_name` | TEXT | |
| `last_name` | TEXT | |
| `phone` | TEXT | Nullable |
| `admin_level` | ENUM | `STAFF`, `MANAGER`, `SUPER` |
| `created_at` | TIMESTAMPTZ | |

---

### `academic_years`
Represents a single academic year period. Controls when applications are open.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `label` | TEXT UNIQUE | e.g. `"2025-2026"` |
| `start_date` | DATE | Year start |
| `end_date` | DATE | Year end |
| `is_active` | BOOLEAN | Only one should be `true` at a time |
| `application_open` | DATE | Window opens |
| `application_close` | DATE | Window closes |

---

### `dorms`
Dormitory buildings.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | TEXT | Building name |
| `location` | TEXT | Campus area or address |
| `gender_policy` | ENUM | `MALE`, `FEMALE`, `MIXED` |
| `total_rooms` | INT | Informational count |
| `is_active` | BOOLEAN | Hide decommissioned dorms |
| `created_at` | TIMESTAMPTZ | |

---

### `rooms`
Individual rooms within a dorm.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `dorm_id` | UUID FK → dorms | |
| `room_number` | TEXT | e.g. `"101A"` |
| `capacity` | INT | Max occupants |
| `room_type` | ENUM | `SINGLE`, `DOUBLE`, `TRIPLE`, `QUAD` |
| `status` | ENUM | `AVAILABLE`, `OCCUPIED`, `MAINTENANCE`, `RESERVED` |
| `monthly_rate` | DECIMAL(10,2) | Monthly cost in local currency |
| `created_at` | TIMESTAMPTZ | |

**Constraint:** `UNIQUE(dorm_id, room_number)`

---

### `dorm_applications`
Student applications for dorm accommodation in a given academic year.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `student_id` | UUID FK → students | |
| `academic_year_id` | UUID FK → academic_years | |
| `preferred_dorm_id` | UUID FK → dorms | Nullable |
| `status` | ENUM | `PENDING`, `APPROVED`, `REJECTED`, `WAITLISTED`, `ALLOCATED` |
| `priority_score` | FLOAT | Computed at submission time |
| `reason` | TEXT | Nullable — student's stated reason |
| `submitted_at` | TIMESTAMPTZ | |
| `reviewed_at` | TIMESTAMPTZ | Nullable |
| `reviewed_by_id` | UUID FK → admins | Nullable |
| `review_note` | TEXT | Nullable |

**Constraint:** `UNIQUE(student_id, academic_year_id)` — one application per student per year

---

### `allocations`
Confirmed room assignments.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `student_id` | UUID FK → students | |
| `room_id` | UUID FK → rooms | |
| `application_id` | UUID FK → dorm_applications UNIQUE | 1:1 |
| `academic_year_id` | UUID FK → academic_years | |
| `start_date` | DATE | |
| `end_date` | DATE | |
| `status` | ENUM | `PENDING_CHECKIN`, `ACTIVE`, `EXPIRED`, `CANCELLED` |
| `allocated_by_id` | UUID FK → admins | |
| `created_at` | TIMESTAMPTZ | |

---

### `maintenance_requests`
Issue tracking for room/building problems.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `room_id` | UUID FK → rooms | |
| `reported_by_id` | UUID FK → users | Any authenticated user |
| `category` | ENUM | `PLUMBING`, `ELECTRICAL`, `HVAC`, `FURNITURE`, `CLEANING`, `OTHER` |
| `priority` | ENUM | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| `status` | ENUM | `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`, `REJECTED` |
| `title` | TEXT | Short summary |
| `description` | TEXT | Full description |
| `assigned_to_id` | UUID FK → admins | Nullable |
| `resolved_at` | TIMESTAMPTZ | Set when status → `RESOLVED` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-updated |

---

### `notifications`
In-app notification feed per user.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | CASCADE delete |
| `title` | TEXT | |
| `message` | TEXT | |
| `type` | ENUM | `ALLOCATION`, `APPLICATION`, `MAINTENANCE`, `SYSTEM`, `REMINDER` |
| `is_read` | BOOLEAN | Default `false` |
| `created_at` | TIMESTAMPTZ | |

---

## Relationships & Foreign Keys

| Relationship | FK Column | References | On Delete |
|-------------|-----------|------------|-----------|
| Student → User | `students.user_id` | `users.id` | CASCADE |
| Admin → User | `admins.user_id` | `users.id` | CASCADE |
| Room → Dorm | `rooms.dorm_id` | `dorms.id` | RESTRICT |
| Application → Student | `dorm_applications.student_id` | `students.id` | RESTRICT |
| Application → AcademicYear | `dorm_applications.academic_year_id` | `academic_years.id` | RESTRICT |
| Application → Dorm (pref) | `dorm_applications.preferred_dorm_id` | `dorms.id` | SET NULL |
| Application → Admin (review) | `dorm_applications.reviewed_by_id` | `admins.id` | SET NULL |
| Allocation → Student | `allocations.student_id` | `students.id` | RESTRICT |
| Allocation → Room | `allocations.room_id` | `rooms.id` | RESTRICT |
| Allocation → Application | `allocations.application_id` | `dorm_applications.id` | RESTRICT |
| Allocation → AcademicYear | `allocations.academic_year_id` | `academic_years.id` | RESTRICT |
| Allocation → Admin | `allocations.allocated_by_id` | `admins.id` | RESTRICT |
| Maintenance → Room | `maintenance_requests.room_id` | `rooms.id` | RESTRICT |
| Maintenance → User | `maintenance_requests.reported_by_id` | `users.id` | RESTRICT |
| Maintenance → Admin | `maintenance_requests.assigned_to_id` | `admins.id` | SET NULL |
| Notification → User | `notifications.user_id` | `users.id` | CASCADE |

---

## Indexing Strategy

| Table | Index | Columns | Reason |
|-------|-------|---------|--------|
| `users` | UNIQUE | `email` | Login lookup |
| `students` | UNIQUE | `user_id` | 1:1 join |
| `students` | UNIQUE | `student_id` | University ID lookup |
| `students` | INDEX | `academic_year` | Filter by year |
| `students` | INDEX | `cost_sharing_eligible` | Priority scoring filter |
| `rooms` | UNIQUE | `(dorm_id, room_number)` | Prevent duplicate rooms |
| `rooms` | INDEX | `(dorm_id, status)` | Find available rooms in a dorm |
| `dorm_applications` | UNIQUE | `(student_id, academic_year_id)` | One application per year |
| `dorm_applications` | INDEX | `(academic_year_id, status)` | Admin dashboard filters |
| `allocations` | UNIQUE | `application_id` | 1:1 application→allocation |
| `allocations` | INDEX | `(student_id, status)` | Student's current allocation |
| `allocations` | INDEX | `(room_id, status)` | Room occupancy check |
| `allocations` | INDEX | `academic_year_id` | Year-scoped queries |
| `maintenance_requests` | INDEX | `(status, priority)` | Admin work queue ordering |
| `maintenance_requests` | INDEX | `reported_by_id` | User's own requests |
| `notifications` | INDEX | `(user_id, is_read)` | Unread count + inbox |
| `notifications` | INDEX | `created_at DESC` | Chronological feed |

---

## Priority Scoring Algorithm

The `calculatePriorityScore()` function in `src/services/priority.service.ts` computes a score
out of **100 points** at application submission time and stores it on `dorm_applications.priority_score`.

```
score = 0

// Distance from campus (40 pts max)
if distance_km > 100:  score += 40
elif distance_km > 50: score += 30
elif distance_km > 20: score += 20
elif distance_km > 10: score += 10
else:                  score += 5

// Cost-sharing eligibility (25 pts)
if cost_sharing_eligible: score += 25

// Academic year seniority (25 pts)
score += min(academic_year, 5) * 5   // Year 1=5pts, Year5=25pts

// Early submission bonus (10 pts, decays over time)
days_since_open = days_between(application_open_date, submitted_at)
score += max(0, 10 - floor(days_since_open / 3))

return score
```

During auto-allocation (`POST /api/applications/run-allocation`), applications are processed
in **descending priority score order**. Higher-scoring students are assigned rooms first.

---

## Database Setup

### Local Development

```bash
# 1. Create the database
createdb dorm_management

# 2. Configure environment
cp .env.example .env
# Edit DATABASE_URL in .env:
# DATABASE_URL=postgresql://postgres:password@localhost:5432/dorm_management

# 3. Generate Prisma client
npm run prisma:generate

# 4. Push schema (dev — no migration files)
npm run prisma:push

# 5. Start server
npm run dev
```

### Production (with migrations)

```bash
# Generate migration files (run once per schema change)
npx prisma migrate dev --name init

# Deploy migrations in CI/CD
npx prisma migrate deploy

# Generate client after deployment
npx prisma generate
```

---

## Scaling Considerations

### Short-term (< 10,000 students)
- Single PostgreSQL instance is sufficient
- All indexes defined in schema handle common query patterns
- Prisma connection pooling handles concurrent requests

### Medium-term (10,000–100,000 students)

**Connection pooling**
```
DATABASE_URL=postgresql://...?connection_limit=20&pool_timeout=10
```
Use [PgBouncer](https://www.pgbouncer.org/) as a connection pooler between the app and PostgreSQL.

**Read replicas**
Direct heavy read queries (student lists, allocation dashboards) to a read replica:
```ts
const prismaRead = new PrismaClient({ datasources: { db: { url: READ_REPLICA_URL } } });
```

**Notifications table archival**
Old `is_read = true` notifications older than 90 days can be archived or deleted:
```sql
DELETE FROM notifications WHERE is_read = true AND created_at < NOW() - INTERVAL '90 days';
```

### Long-term (100,000+ students)

**Partition `allocations` by `academic_year_id`**
Each year's allocations are queried independently — range partitioning reduces scan cost:
```sql
CREATE TABLE allocations PARTITION BY LIST (academic_year_id);
```

**Redis caching**
- Cache unread notification counts per user (invalidate on new notification)
- Cache active academic year record (rarely changes)

**Full-text search**
Add `pg_trgm` index for student name/ID search:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX students_name_trgm ON students USING gin(first_name gin_trgm_ops, last_name gin_trgm_ops);
```

**Queue auto-allocation**
The `runAllocation` operation is CPU/DB intensive. Move it to a background job queue (BullMQ + Redis) for large cohorts to avoid request timeouts.
