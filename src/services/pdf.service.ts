import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface AllocationData {
  student: {
    firstName: string;
    lastName: string;
    studentId: string;
    user?: { email: string } | null;
  };
  room: {
    roomNumber: string;
    roomType: string;
    monthlyRate: unknown; // Decimal from Prisma
    dorm: {
      name: string;
      location: string;
    };
  };
  academicYear: {
    label: string;
  };
  startDate: Date;
  endDate: Date;
  id: string;
}

export async function generateAllocationPdf(allocation: AllocationData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4

  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const { width, height } = page.getSize();
  const margin = 50;
  const primaryColor = rgb(0.13, 0.29, 0.53); // dark blue
  const gray = rgb(0.4, 0.4, 0.4);
  const black = rgb(0, 0, 0);

  // ── Header bar ──────────────────────────────────────────────────────────
  page.drawRectangle({
    x: 0,
    y: height - 80,
    width,
    height: 80,
    color: primaryColor,
  });

  page.drawText("DORM MANAGEMENT SYSTEM", {
    x: margin,
    y: height - 40,
    size: 20,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  page.drawText("Official Room Allocation Letter", {
    x: margin,
    y: height - 62,
    size: 11,
    font,
    color: rgb(0.85, 0.85, 0.85),
  });

  // ── Title ────────────────────────────────────────────────────────────────
  page.drawText("ROOM ALLOCATION CONFIRMATION", {
    x: margin,
    y: height - 120,
    size: 16,
    font: boldFont,
    color: primaryColor,
  });

  page.drawLine({
    start: { x: margin, y: height - 130 },
    end: { x: width - margin, y: height - 130 },
    thickness: 1,
    color: primaryColor,
  });

  // ── Student information ───────────────────────────────────────────────────
  let y = height - 160;

  const drawField = (label: string, value: string) => {
    page.drawText(label, { x: margin, y, size: 10, font: boldFont, color: gray });
    page.drawText(value, { x: 220, y, size: 10, font, color: black });
    y -= 20;
  };

  page.drawText("STUDENT INFORMATION", {
    x: margin,
    y: y + 10,
    size: 12,
    font: boldFont,
    color: primaryColor,
  });
  y -= 25;

  drawField("Student Name:", `${allocation.student.firstName} ${allocation.student.lastName}`);
  drawField("Student ID:", allocation.student.studentId);
  if (allocation.student.user?.email) {
    drawField("Email:", allocation.student.user.email);
  }

  y -= 10;
  page.drawText("ALLOCATION DETAILS", {
    x: margin,
    y,
    size: 12,
    font: boldFont,
    color: primaryColor,
  });
  y -= 25;

  drawField("Academic Year:", allocation.academicYear.label);
  drawField("Dormitory:", allocation.room.dorm.name);
  drawField("Location:", allocation.room.dorm.location);
  drawField("Room Number:", allocation.room.roomNumber);
  drawField("Room Type:", allocation.room.roomType);
  drawField("Monthly Rate:", `ETB ${Number(allocation.room.monthlyRate).toLocaleString()}`);
  drawField("Check-in Date:", allocation.startDate.toLocaleDateString("en-US", { dateStyle: "long" }));
  drawField("Check-out Date:", allocation.endDate.toLocaleDateString("en-US", { dateStyle: "long" }));

  // ── Notice box ───────────────────────────────────────────────────────────
  y -= 20;
  page.drawRectangle({
    x: margin,
    y: y - 60,
    width: width - margin * 2,
    height: 70,
    color: rgb(0.95, 0.97, 1),
    borderColor: primaryColor,
    borderWidth: 1,
  });

  page.drawText("Important Notice", {
    x: margin + 10,
    y: y - 15,
    size: 10,
    font: boldFont,
    color: primaryColor,
  });
  page.drawText("Please report to the Dorm Office within 3 days of check-in date to collect your keys.", {
    x: margin + 10,
    y: y - 30,
    size: 9,
    font,
    color: black,
  });
  page.drawText("Failure to check in may result in cancellation of your allocation.", {
    x: margin + 10,
    y: y - 45,
    size: 9,
    font,
    color: gray,
  });

  // ── Footer ───────────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: margin, y: 80 },
    end: { x: width - margin, y: 80 },
    thickness: 0.5,
    color: gray,
  });

  page.drawText(`Allocation ID: ${allocation.id}`, {
    x: margin,
    y: 65,
    size: 8,
    font,
    color: gray,
  });

  page.drawText(`Generated: ${new Date().toLocaleString()}`, {
    x: margin,
    y: 52,
    size: 8,
    font,
    color: gray,
  });

  page.drawText("This is a system-generated document and does not require a signature.", {
    x: margin,
    y: 38,
    size: 8,
    font,
    color: gray,
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
