import { Router } from "express";
import { db, modulesTable, studentsTable, lessonsTable, courseSessionsTable } from "@workspace/db";
import { coursesTable, settingsTable, categoriesTable, tenantsTable, paymentsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET || "lms-secret-key";

const router = Router();

async function getDefaultTenantId(): Promise<number> {
  const slug =
    (router as any).__tenantSlug ||
    process.env.DEFAULT_TENANT_SLUG ||
    "default";
  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug))
    .limit(1);
  if (!tenant) throw new Error("Default tenant not found");
  return tenant.id;
}

// GET /api/storefront/settings
router.get("/settings", async (req, res) => {
  try {
    const tenantId = req.tenantId ?? (await getDefaultTenantId());
    const [settings] = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.tenantId, tenantId))
      .limit(1);
    if (!settings) return res.json({});
    // Strip sensitive payment gateway credentials — only expose safe flags
    const { paymobApiKey: _a, paymobHmacSecret: _h, ...safe } = settings as any;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/storefront/courses
router.get("/courses", async (req, res) => {
  try {
    const tenantId = req.tenantId ?? (await getDefaultTenantId());
    const courses = await db
      .select()
      .from(coursesTable)
      .where(
        and(
          eq(coursesTable.tenantId, tenantId),
          eq(coursesTable.status, "active")
        )
      );
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/storefront/categories
router.get("/categories", async (req, res) => {
  try {
    const tenantId = req.tenantId ?? (await getDefaultTenantId());
    const categories = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.tenantId, tenantId));
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/storefront/profile — hero title/subtitle/cta for landing page
router.get("/profile", async (req, res) => {
  try {
    const tenantId = req.tenantId ?? (await getDefaultTenantId());
    const { academyProfileTable } = await import("@workspace/db");
    const [profile] = await db
      .select()
      .from(academyProfileTable)
      .where(eq(academyProfileTable.tenantId, tenantId))
      .limit(1);
    res.json(profile ?? {});
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});
router.get("/courses/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId ?? (await getDefaultTenantId());
    const courseId = parseInt(req.params.id!);

    const [course] = await db
      .select()
      .from(coursesTable)
      .where(and(
        eq(coursesTable.id, courseId),
        eq(coursesTable.tenantId, tenantId),
        eq(coursesTable.status, "active")
      ));

    if (!course) return res.status(404).json({ error: "Course not found" });

    const [studentCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(studentsTable)
      .where(and(eq(studentsTable.courseId, courseId), eq(studentsTable.tenantId, tenantId)));

    // جيب الـ modules مع الـ lessons كاملة (بما فيها videoUrl)
    const modulesRaw = await db
      .select()
      .from(modulesTable)
      .where(eq(modulesTable.courseId, courseId))
      .orderBy(modulesTable.order);

    const modules = await Promise.all(
      modulesRaw.map(async (mod) => {
        const lessons = await db
          .select({
            id: lessonsTable.id,
            title: lessonsTable.title,
            titleAr: lessonsTable.titleAr,
            type: lessonsTable.type,
            videoUrl: lessonsTable.videoUrl,
            pdfUrl: lessonsTable.pdfUrl,
            duration: lessonsTable.duration,
            order: lessonsTable.order,
          })
          .from(lessonsTable)
          .where(eq(lessonsTable.moduleId, mod.id))
          .orderBy(lessonsTable.order);

        return {
          id: mod.id,
          title: mod.title,
          titleAr: mod.titleAr ?? null,
          order: mod.order,
          lessons,
        };
      })
    );

    // جيب الجلسات لو كورس مباشر
    const sessions = course.courseType === "live"
      ? await db
          .select()
          .from(courseSessionsTable)
          .where(eq(courseSessionsTable.courseId, courseId))
          .orderBy(courseSessionsTable.scheduledAt)
      : [];

    res.json({
      id: course.id,
      title: course.title,
      titleAr: course.titleAr ?? null,
      description: course.description ?? null,
      price: Number(course.price),
      status: course.status,
      courseType: course.courseType ?? "recorded",
      thumbnailUrl: course.thumbnailUrl ?? null,
      categoryId: course.categoryId ?? null,
      level: course.level ?? null,
      language: course.language ?? null,
      totalHours: course.totalHours ? Number(course.totalHours) : null,
      isFeatured: course.isFeatured ?? false,
      studentCount: studentCount?.count ?? 0,
      moduleCount: modules.length,
      modules,
      sessions,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});
// GET /api/storefront/my-payments — مدفوعات الطالب المتحقق منه بالـ JWT
router.get("/my-payments", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const studentId: number = decoded.id;
    const tenantId = req.tenantId ?? (await getDefaultTenantId());

    // تحقق إن الطالب ينتمي لنفس الـ tenant
    const [student] = await db
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId)))
      .limit(1);

    if (!student) return res.status(403).json({ error: "Forbidden" });

    const payments = await db
      .select({
        id: paymentsTable.id,
        courseId: paymentsTable.courseId,
        courseName: coursesTable.title,
        amount: paymentsTable.amount,
        status: paymentsTable.status,
        method: paymentsTable.method,
        receiptUrl: paymentsTable.receiptUrl,
        notes: paymentsTable.notes,
        paidAt: paymentsTable.paidAt,
        createdAt: paymentsTable.createdAt,
      })
      .from(paymentsTable)
      .leftJoin(coursesTable, eq(paymentsTable.courseId, coursesTable.id))
      .where(eq(paymentsTable.studentId, studentId))
      .orderBy(sql`${paymentsTable.createdAt} desc`);

    res.json(
      payments.map((p) => ({
        id: p.id,
        courseId: p.courseId ?? null,
        courseName: p.courseName ?? null,
        amount: Number(p.amount),
        status: p.status,
        method: p.method,
        receiptUrl: p.receiptUrl ?? null,
        notes: p.notes ?? null,
        paidAt: p.paidAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;