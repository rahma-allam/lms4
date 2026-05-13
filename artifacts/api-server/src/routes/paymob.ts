/**
 * POST /api/paymob/intention   → initiate Paymob checkout, return iframe URL
 * POST /api/paymob/webhook     → receive Paymob transaction callback
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable, paymentsTable, studentsTable, coursesTable, enrollmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { allowStudent } from "../middlewares/auth.js";
import { createPaymobCheckout, verifyPaymobHmac } from "../lib/paymob.js";

const router = Router();

async function getTenantSettings(tenantId: number) {
  const [settings] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.tenantId, tenantId));
  return settings;
}

// ─── POST /api/paymob/intention ───────────────────────────────────────────────
// Body: { courseId: number }
// Auth: student JWT required
router.post("/intention", allowStudent, async (req: any, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant not found" });

    const settings = await getTenantSettings(tenantId);
    if (!settings) return res.status(404).json({ error: "Settings not found" });

    // Check Paymob is configured and enabled
    if (
      settings.paymobEnabled !== "true" ||
      !settings.paymobApiKey ||
      !settings.paymobIntegrationId ||
      !settings.paymobIframeId
    ) {
      return res.status(503).json({ error: "Paymob gateway is not configured or disabled" });
    }

    const { courseId } = req.body;
    if (!courseId) return res.status(400).json({ error: "courseId is required" });

    const studentId = req.student.id;

    // Get student info
    const [student] = await db
      .select()
      .from(studentsTable)
      .where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId)));
    if (!student) return res.status(404).json({ error: "Student not found" });

    // Get course info
    const [course] = await db
      .select()
      .from(coursesTable)
      .where(and(eq(coursesTable.id, courseId), eq(coursesTable.tenantId, tenantId)));
    if (!course) return res.status(404).json({ error: "Course not found" });

    const amountCents = Math.round(Number(course.price) * 100); // EGP cents

    // Split student name
    const nameParts = student.name.trim().split(" ");
    const firstName = nameParts[0] ?? student.name;
    const lastName = nameParts.slice(1).join(" ") || "N/A";

    const paymobSettings = {
      apiKey: settings.paymobApiKey,
      integrationId: settings.paymobIntegrationId,
      iframeId: settings.paymobIframeId,
      hmacSecret: settings.paymobHmacSecret ?? "",
    };

    const { iframeUrl, paymobOrderId } = await createPaymobCheckout(
      paymobSettings,
      amountCents,
      {
        first_name: firstName,
        last_name: lastName,
        email: student.email,
        phone_number: student.phone ?? "N/A",
        country: "EG",
        city: "Cairo",
        street: "N/A",
        building: "N/A",
        floor: "N/A",
        apartment: "N/A",
      },
      [
        {
          name: course.title,
          amount_cents: amountCents,
          description: course.description ?? course.title,
          quantity: 1,
        },
      ]
    );

    // Create a pending payment record so we can match on webhook
    const [payment] = await db
      .insert(paymentsTable)
      .values({
        tenantId,
        studentId,
        courseId,
        amount: course.price.toString(),
        status: "pending",
        method: "online",
        notes: `paymob_order:${paymobOrderId}`,
        paidAt: new Date(),
      })
      .returning();

    res.json({
      iframeUrl,
      paymobOrderId,
      paymentId: payment!.id,
    });
  } catch (err: any) {
    console.error("[Paymob] intention error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ─── POST /api/paymob/webhook ─────────────────────────────────────────────────
// Paymob calls this after every transaction (success or failure)
// No auth required — Paymob sends the request
router.post("/webhook", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "Tenant not found" });

    const settings = await getTenantSettings(tenantId);
    const body = req.body;

    // Verify HMAC if secret is configured
    if (settings?.paymobHmacSecret) {
      const isValid = verifyPaymobHmac(settings.paymobHmacSecret, body.obj ?? body);
      if (!isValid) {
        console.warn("[Paymob] Invalid HMAC signature");
        return res.status(401).json({ error: "Invalid HMAC" });
      }
    }

    const txn = body.obj ?? body;
    const success = txn.success === true || txn.success === "true";
    const paymobOrderId = txn.order?.id;

    if (!paymobOrderId) {
      return res.status(200).json({ received: true }); // acknowledge but skip
    }

    // Find the payment by paymob_order note
    const payments = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.tenantId, tenantId));

    const payment = payments.find(
      (p) => p.notes === `paymob_order:${paymobOrderId}`
    );

    if (!payment) {
      console.warn(`[Paymob] No matching payment for order ${paymobOrderId}`);
      return res.status(200).json({ received: true });
    }

    const newStatus = success ? "completed" : "failed";

    await db
      .update(paymentsTable)
      .set({ status: newStatus, paidAt: new Date() })
      .where(eq(paymentsTable.id, payment.id));

    // If payment succeeded → auto-approve student & create enrollment
    if (success && payment.studentId && payment.courseId) {
      // Update student status to active
      await db
        .update(studentsTable)
        .set({ status: "active", paymentStatus: "completed", courseId: payment.courseId })
        .where(eq(studentsTable.id, payment.studentId));

      // Create enrollment if not exists
      const [existing] = await db
        .select()
        .from(enrollmentsTable)
        .where(
          and(
            eq(enrollmentsTable.studentId, payment.studentId),
            eq(enrollmentsTable.courseId, payment.courseId)
          )
        );
      if (!existing) {
        await db.insert(enrollmentsTable).values({
          studentId: payment.studentId,
          courseId: payment.courseId,
          status: "active",
        });
      }

      console.log(
        `[Paymob] ✅ Payment ${payment.id} completed → student ${payment.studentId} enrolled in course ${payment.courseId}`
      );
    }

    res.status(200).json({ received: true, status: newStatus });
  } catch (err: any) {
    console.error("[Paymob] webhook error:", err);
    // Always return 200 to Paymob so it doesn't retry
    res.status(200).json({ received: true });
  }
});

export default router;
