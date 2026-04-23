# End-to-End API Flow: SMTP Setup -> Super Admin -> Student -> Dorm Application

This guide is a complete operational flow with concrete API steps.

## 0) Environment Setup

In `backend/.env` configure core values and SMTP:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/dorm_management
PORT=3002
NODE_ENV=development

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_sender@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=your_sender@gmail.com
```

Run:
```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:push
npm run dev
```

## 1) Bootstrap SUPER_ADMIN (one-time)

Use this one-liner from `backend`:
```bash
node -r dotenv/config -e 'const bcrypt=require("bcryptjs"); const {PrismaClient,RoleCode,UserStatus}=require("./generated/prisma"); const {PrismaPg}=require("@prisma/adapter-pg"); (async()=>{const adapter=new PrismaPg({connectionString:process.env.DATABASE_URL}); const prisma=new PrismaClient({adapter}); const email="superadmin@example.com"; const password="SuperAdmin#2026"; const role=await prisma.role.upsert({where:{code:RoleCode.SUPER_ADMIN},update:{},create:{code:RoleCode.SUPER_ADMIN,name:"SUPER_ADMIN",description:"System role: SUPER_ADMIN"}}); let user=await prisma.user.findUnique({where:{email}}); if(!user){user=await prisma.user.create({data:{email,passwordHash:await bcrypt.hash(password,12),status:UserStatus.ACTIVE}});} const existing=await prisma.userRole.findFirst({where:{userId:user.id,roleId:role.id}}); if(!existing){await prisma.userRole.create({data:{userId:user.id,roleId:role.id}});} console.log("SUPER_ADMIN ready", email, password); await prisma.$disconnect();})().catch((e)=>{console.error(e); process.exit(1);});'
```

## 2) Login as SUPER_ADMIN

`POST /api/v1/auth/login`
```json
{
  "email": "superadmin@example.com",
  "password": "SuperAdmin#2026"
}
```

Save:
- `adminAccessToken = data.token`

## 3) Create Student User (Admin Side)

`POST /api/v1/users`
Header: `Authorization: Bearer <adminAccessToken>`
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
    "phone": "0911223344"
  }
}
```

Backend sends generated temporary password to student email.

## 4) Student First Login (same endpoint)

`POST /api/v1/auth/login`
```json
{
  "studentNumber": "UGR/1243/13",
  "password": "TEMP_PASSWORD_FROM_EMAIL"
}
```

Expected:
```json
{
  "success": true,
  "data": {
    "requiresPasswordChange": true,
    "message": "First login requires password change."
  }
}
```

## 5) Student Changes Temporary Password

`POST /api/v1/auth/change-temporary-password`
```json
{
  "studentNumber": "UGR/1243/13",
  "temporaryPassword": "TEMP_PASSWORD_FROM_EMAIL",
  "newPassword": "MyStrongPass#2026"
}
```

## 6) Student Logs In Normally

`POST /api/v1/auth/login`
```json
{
  "studentNumber": "UGR/1243/13",
  "password": "MyStrongPass#2026"
}
```

Save:
- `studentAccessToken = data.token`

## 7) Student Updates Allowed Profile Extras (Authenticated)

`PATCH /api/v1/users/me`
Header: `Authorization: Bearer <studentAccessToken>`
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

## 8) Student Submits Dorm Application

`POST /api/v1/applications`
Header: `Authorization: Bearer <studentAccessToken>`
```json
{
  "semesterId": "uuid",
  "currentCity": "Addis Ababa",
  "currentSubcity": "BOLE",
  "currentWoreda": "08",
  "hasDisability": false,
  "medicalConditions": [],
  "reason": "Need proximity",
  "preferredDormIds": ["uuid"],
  "documents": [
    {"type":"ID_IMAGE","originalName":"id.jpg","storagePath":"uploads/id.jpg","mimeType":"image/jpeg","sizeBytes":120000},
    {"type":"HIGHSCHOOL_TRANSCRIPT","originalName":"hs.pdf","storagePath":"uploads/hs.pdf","mimeType":"application/pdf","sizeBytes":220000},
    {"type":"ENTRANCE_EXAM_RESULT","originalName":"entrance.pdf","storagePath":"uploads/entrance.pdf","mimeType":"application/pdf","sizeBytes":180000},
    {"type":"KEBELE_VERIFICATION","originalName":"kebele.pdf","storagePath":"uploads/kebele.pdf","mimeType":"application/pdf","sizeBytes":175000}
  ]
}
```

Result:
- Status is `PENDING`.
- Editable for first 24 hours (`canEditUntil`).

## 9) Student Updates Application Within 24 Hours

`PATCH /api/v1/applications/:id/my`
Header: `Authorization: Bearer <studentAccessToken>`
```json
{
  "currentSubcity": "YEKA",
  "documents": [
    {"type":"ID_IMAGE","originalName":"id-new.jpg","storagePath":"uploads/id-new.jpg","mimeType":"image/jpeg","sizeBytes":125000},
    {"type":"HIGHSCHOOL_TRANSCRIPT","originalName":"hs.pdf","storagePath":"uploads/hs.pdf","mimeType":"application/pdf","sizeBytes":220000},
    {"type":"ENTRANCE_EXAM_RESULT","originalName":"entrance.pdf","storagePath":"uploads/entrance.pdf","mimeType":"application/pdf","sizeBytes":180000},
    {"type":"KEBELE_VERIFICATION","originalName":"kebele.pdf","storagePath":"uploads/kebele.pdf","mimeType":"application/pdf","sizeBytes":175000}
  ]
}
```

If window expired and no override:
- `403 Application is no longer editable`

## 10) Admin Side (Later Logic)

- Admin review updates status via `PUT /applications/:id/review`.
- Dorm head/super admin can extend edit window via `PATCH /applications/:id/edit-override`.
- Allocation pipeline uses `POST /applications/run-allocation`.
