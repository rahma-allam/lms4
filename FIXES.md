# 🛠️ LMS Fixes — Complete Changelog

## ملخص المشاكل المكتشفة والإصلاحات

---

## 1. 📊 Progress Bar للطالب

**المشكلة:** Progress Bar في `StudentPortal` كان شغال، لكن التحديث يحتاج إلى أن الطالب يكمّل درس.

**الإصلاح:** تحقق إن:
- `POST /api/lessons/:id/complete` بيحسب `progress` صح ويحدّث `students.progress` في الداتابيز
- `/api/auth/me` بيرجّع `progress` في الـ response
- `StudentPortal.tsx` بيعرض `student.progress` في الـ Progress Bar بشكل animated

**لا يحتاج تعديل** — الكود صح، بس تأكد من الـ `lessonCompletionsTable` موجودة في الداتابيز.

---

## 2. 📸 صورة الطالب (Avatar) — Cloudinary Upload

**المشكلة:**
- مفيش حقل `avatar_url` في جدول `students`
- `POST /api/auth/register` مكانش بيقبل صورة
- الـ Dashboard مكانش بيعرض صورة الطالب

**الإصلاحات:**

### `lib/db/src/schema/students.ts`
أضفنا حقل:
```ts
avatarUrl: text("avatar_url"),
```

### `lib/db/drizzle/0002_add_avatar_url.sql` ← **شغّل الـ migration ده**
```sql
ALTER TABLE students ADD COLUMN IF NOT EXISTS avatar_url text;
```

### `artifacts/api-server/src/routes/auth.ts`
- استخدمنا `multer` لاستقبال صورة كـ `multipart/form-data`
- رفع الصورة على Cloudinary قبل إنشاء الطالب
- حفظ `avatarUrl` في الداتابيز
- `/api/auth/me` يرجّع `avatarUrl` دلوقتي

### `artifacts/landing-page/src/pages/RegisterPage.tsx`
- أضفنا زرار رفع صورة مع Preview دائري
- لو الطالب اختار صورة، بنبعت `FormData` بدل JSON
- لو مفيش صورة، بنبعت JSON كالعادة

### `artifacts/lms-platform/src/pages/Students.tsx`
- الأفاتار بيظهر في جدول الطلاب — صورة لو موجودة، أول حرف من الاسم لو لا

### `artifacts/lms-platform/src/pages/StudentDetail.tsx`
- صفحة تفاصيل الطالب بتعرض الصورة بشكل دائري

---

## 3. 🏷️ Categories في الكورسات

**المشكلة:** الكورسات في الـ Dashboard بتتعرض بـ `categoryId` فقط بدون اسم الـ Category.

**الإصلاحات:**

### `artifacts/api-server/src/routes/courses.ts`
- أضفنا `import categoriesTable`
- في الـ `enriched` map، بنعمل lookup على اسم الـ category:
```ts
categoryName: string | null
categoryNameAr: string | null
```

### `artifacts/lms-platform/src/pages/Courses.tsx`
- بيعرض badge أخضر صغير بالاسم العربي للـ category تحت عنوان الكورس

---

## 4. 🎟️ الكوبونات (Coupons)

**المشكلتان:**

### Bug 1: `Coupons.tsx` كانت بتجيب بيانات من endpoint غلط
```ts
// ❌ كان:
fetchWithAuth("/api/categories")

// ✅ بقى:
fetchWithAuth("/api/coupons")
```

### Bug 2: `CheckoutPage.tsx` كانت بتقرأ حقل غلط من الـ API response
```ts
// ❌ كان:
setCouponData({ code: data.code, discountAmount: data.discountAmount })

// ✅ بقى:
setCouponData({ code: couponInput.trim(), discountAmount: data.discountValue })
// + بيتحقق من data.valid قبل القبول
```

---

## 5. ⚙️ Settings تظهر في صفحة الـ Main

**المشكلتان:**

### Bug 1: `academy-profile` route لم يكن مسجّلاً في `routes/index.ts`
```ts
// ✅ أضفنا:
import academyProfileRouter from "./academy-profile";
router.use("/academy-profile", requireAdmin, academyProfileRouter);
```

### Bug 2: `SettingsPage.tsx` كانت بتبعت `POST` بس الـ route بيقبل `PUT` فقط
```ts
// ❌ كان:
method: "POST"

// ✅ بقى:
method: "PUT"
```

### Bug 3: `Hero.tsx` كانت بتجيب hero content من `/api/storefront/settings` لكن الحقول مش موجودة هناك
```ts
// ✅ بقى:
// Hero title/subtitle/CTA من: /api/storefront/profile (academy_profile table)
// Academy name من: /api/storefront/settings (settings table)
```

### إضافة Endpoint جديد في `storefront.ts`:
```ts
GET /api/storefront/profile → academy_profile table
```

---

## 6. 💳 بوابات الدفع — إضافة InstaPay

**الإضافة:**

### `artifacts/landing-page/src/pages/CheckoutPage.tsx`
```ts
const PAYMENT_METHODS = [
  { id: "vodafone_cash", label: "Vodafone Cash", labelAr: "فودافون كاش", ... },
  { id: "instapay",     label: "InstaPay",       labelAr: "إنستاباي",   ... },  // ← جديد
  { id: "bank",         label: "Bank Transfer",  labelAr: "تحويل بنكي", ... },
];
```
- Icon مخصص لـ InstaPay (`Zap` icon)
- تعليمات مخصصة: "ارسل المبلغ عبر تطبيق إنستاباي ثم ارفع صورة الإيصال"

لإضافة بوابة دفع جديدة في المستقبل، أضف عنصر جديد في `PAYMENT_METHODS` array.

---

## 🚀 خطوات التشغيل بعد التحديث

```bash
# 1. شغّل الـ migration
psql $DATABASE_URL -f lib/db/drizzle/0002_add_avatar_url.sql

# 2. تأكد من متغيرات البيئة في .env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# 3. Install multer if not already installed
cd artifacts/api-server
npm install multer @types/multer

# 4. Build & start
npm run build
npm run dev
```

---

## 📁 الملفات المعدّلة

| الملف | التعديل |
|-------|---------|
| `lib/db/src/schema/students.ts` | أضاف `avatarUrl` column |
| `lib/db/drizzle/0002_add_avatar_url.sql` | **Migration جديد** |
| `artifacts/api-server/src/routes/index.ts` | سجّل `academy-profile` route |
| `artifacts/api-server/src/routes/auth.ts` | Cloudinary upload + avatarUrl في register & me |
| `artifacts/api-server/src/routes/courses.ts` | أضاف `categoryName` و `categoryNameAr` |
| `artifacts/api-server/src/routes/storefront.ts` | أضاف `GET /api/storefront/profile` |
| `artifacts/lms-platform/src/pages/Coupons.tsx` | **Bug fix**: endpoint غلط |
| `artifacts/lms-platform/src/pages/Courses.tsx` | عرض category badge |
| `artifacts/lms-platform/src/pages/Students.tsx` | عرض avatar في الجدول |
| `artifacts/lms-platform/src/pages/StudentDetail.tsx` | عرض avatar في التفاصيل |
| `artifacts/lms-platform/src/pages/SettingsPage.tsx` | **Bug fix**: POST → PUT |
| `artifacts/landing-page/src/pages/RegisterPage.tsx` | Avatar upload UI + FormData |
| `artifacts/landing-page/src/pages/CheckoutPage.tsx` | InstaPay + coupon bug fix |
| `artifacts/landing-page/src/components/Hero.tsx` | تحميل hero content من profile |
