import { Router } from "express";
import { db, pool } from "@workspace/db";
import { settingsTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import multer from "multer";
import { uploadToCloudinary } from "../lib/cloudinary.js";

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Image files only"));
  },
});

const router = Router();

async function getDefaultTenantId(): Promise<number> {
  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, "default"))
    .limit(1);
  if (!tenant) throw new Error("Default tenant not found. Run the migration first.");
  return tenant.id;
}

async function ensureSettings(tenantId: number) {
  const existing = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.tenantId, tenantId))
    .limit(1);
  if (existing.length === 0) {
    const [row] = await db
      .insert(settingsTable)
      .values({ tenantId })
      .returning();
    return row!;
  }
  return existing[0]!;
}

function settingsToJson(s: typeof settingsTable.$inferSelect) {
  return {
    id: s.id,
    academyName: s.academyName,
    academyNameAr: s.academyNameAr ?? null,
    logoUrl: s.logoUrl ?? null,
    metaPixelId: s.metaPixelId ?? null,
    metaConversionToken: s.metaConversionToken ?? null,
    googleTagId: s.googleTagId ?? null,
    googleApiSecret: s.googleApiSecret ?? null,
    tiktokPixelId: s.tiktokPixelId ?? null,
    tiktokAccessToken: s.tiktokAccessToken ?? null,
    defaultLanguage: s.defaultLanguage,
    currency: s.currency,
    manualPaymentInstructions: s.manualPaymentInstructions ?? null,
    paymobEnabled: s.paymobEnabled ?? "false",
    paymobIntegrationId: s.paymobIntegrationId ?? null,
    paymobIframeId: s.paymobIframeId ?? null,
  };
}

router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId ?? (await getDefaultTenantId());
    const s = await ensureSettings(tenantId);
    // Admin route — return ALL fields including sensitive paymob credentials
    res.json({
      ...settingsToJson(s),
      paymobApiKey: s.paymobApiKey ?? "",
      paymobIntegrationId: s.paymobIntegrationId ?? "",
      paymobIframeId: s.paymobIframeId ?? "",
      paymobHmacSecret: s.paymobHmacSecret ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/settings/upload-logo — رفع شعار الأكاديمية على Cloudinary
router.post("/upload-logo", uploadLogo.single("logo"), async (req, res) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: "No image provided" });
    }
    const result = await uploadToCloudinary(file.buffer, {
      folder: "lms/logos",
      resource_type: "image",
    });
    res.json({ logoUrl: result.secure_url });
  } catch (err: any) {
    req.log.error({ err }, "Error uploading logo");
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

router.put("/", async (req, res) => {
  try {
    const body = req.body as Record<string, any>;
    const {
      academyName, academyNameAr, logoUrl, metaPixelId,
      metaConversionToken, googleTagId, googleApiSecret,
      tiktokPixelId, tiktokAccessToken, defaultLanguage, currency,
      paymobEnabled, paymobApiKey, paymobIntegrationId, paymobIframeId, paymobHmacSecret,
      manualPaymentInstructions,
    } = body;

    if (!academyName) return res.status(400).json({ error: "academyName is required" });

    const tenantId = req.tenantId ?? (await getDefaultTenantId());
    const existing = await ensureSettings(tenantId);

    const updateData: Record<string, unknown> = {
      academyName,
      academyNameAr: academyNameAr ?? null,
      logoUrl: logoUrl ?? null,
      metaPixelId: metaPixelId ?? null,
      metaConversionToken: metaConversionToken ?? null,
      googleTagId: googleTagId ?? null,
      googleApiSecret: googleApiSecret ?? null,
      tiktokPixelId: tiktokPixelId ?? null,
      tiktokAccessToken: tiktokAccessToken ?? null,
      defaultLanguage: (defaultLanguage === "ar" ? "ar" : "en") as "en" | "ar",
      currency: currency ?? "USD",
      manualPaymentInstructions: manualPaymentInstructions ?? null,
      paymobEnabled: paymobEnabled ?? null,
      paymobApiKey: paymobApiKey ?? null,
      paymobIntegrationId: paymobIntegrationId ?? null,
      paymobIframeId: paymobIframeId ?? null,
      paymobHmacSecret: paymobHmacSecret ?? null,
    };

    // Use pg pool directly to bypass Drizzle pgEnum type mismatch
    const { rows } = await pool.query(
      `UPDATE settings SET
        academy_name        = $1,
        academy_name_ar     = $2,
        logo_url            = $3,
        meta_pixel_id       = $4,
        meta_conversion_token = $5,
        google_tag_id       = $6,
        google_api_secret   = $7,
        tiktok_pixel_id     = $8,
        tiktok_access_token = $9,
        default_language    = $10::default_language,
        currency            = $11,
        manual_payment_instructions = $12,
        paymob_enabled      = $13,
        paymob_api_key      = $14,
        paymob_integration_id = $15,
        paymob_iframe_id    = $16,
        paymob_hmac_secret  = $17
      WHERE id = $18
      RETURNING *`,
      [
        updateData.academyName        ?? null,
        updateData.academyNameAr      ?? null,
        updateData.logoUrl            ?? null,
        updateData.metaPixelId        ?? null,
        updateData.metaConversionToken ?? null,
        updateData.googleTagId        ?? null,
        updateData.googleApiSecret    ?? null,
        updateData.tiktokPixelId      ?? null,
        updateData.tiktokAccessToken  ?? null,
        updateData.defaultLanguage    ?? "en",
        updateData.currency           ?? "USD",
        updateData.manualPaymentInstructions ?? null,
        updateData.paymobEnabled      ?? "false",
        updateData.paymobApiKey       ?? null,
        updateData.paymobIntegrationId ?? null,
        updateData.paymobIframeId     ?? null,
        updateData.paymobHmacSecret   ?? null,
        existing.id,
      ]
    );
    const settings = rows[0];

    res.json({
      id: settings.id,
      academyName: settings.academy_name,
      academyNameAr: settings.academy_name_ar ?? null,
      logoUrl: settings.logo_url ?? null,
      metaPixelId: settings.meta_pixel_id ?? null,
      metaConversionToken: settings.meta_conversion_token ?? null,
      googleTagId: settings.google_tag_id ?? null,
      googleApiSecret: settings.google_api_secret ?? null,
      tiktokPixelId: settings.tiktok_pixel_id ?? null,
      tiktokAccessToken: settings.tiktok_access_token ?? null,
      defaultLanguage: settings.default_language,
      currency: settings.currency,
      manualPaymentInstructions: settings.manual_payment_instructions ?? null,
      paymobEnabled: settings.paymob_enabled ?? "false",
      paymobIntegrationId: settings.paymob_integration_id ?? null,
      paymobIframeId: settings.paymob_iframe_id ?? null,
    });
  } catch (err: any) {
    console.error("[Settings PUT error]", err?.message, err?.detail, err?.code);
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

export default router;