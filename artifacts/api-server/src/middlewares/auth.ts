import { Request, Response, NextFunction } from "express";
import { verifyAdminToken } from "../routes/admin-auth.js";
import { verifyInstructorToken } from "../routes/instructor-auth.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET || "lms-secret-key";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.headers["authorization"];
    if (!auth?.startsWith("Bearer "))
      return res.status(401).json({ error: "Unauthorized" });
    const payload = verifyAdminToken(auth.slice(7));
    // ✅ حط الـ tenantId من الـ token على الـ req
    if (!req.tenantId) req.tenantId = payload.tenantId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// middleware للطالب — بيتحقق من student token أو يسمح بالمرور لو مفيش token (public routes)
export function allowStudent(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.headers["authorization"];
    if (!auth?.startsWith("Bearer "))
      return res.status(401).json({ error: "Unauthorized" });
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { id: number; email: string };
    (req as any).student = { id: payload.id, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireInstructor(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = req.headers["authorization"];
    if (!auth?.startsWith("Bearer "))
      return res.status(401).json({ error: "Unauthorized" });
    const payload = verifyInstructorToken(auth.slice(7));
    (req as any).instructorId = payload.id;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}