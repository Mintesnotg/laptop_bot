import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../env";

export type AdminJwtPayload = {
  sub: string;
  username: string;
  type: "admin";
};

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();

    try {
      const payload = jwt.verify(token, env.ADMIN_JWT_SECRET) as AdminJwtPayload;
      if (!payload?.sub || payload.type !== "admin") {
        return res.status(401).json({ message: "Unauthorized" });
      }

      (req as Request & { adminUserId?: string; adminUsername?: string }).adminUserId = payload.sub;
      (req as Request & { adminUserId?: string; adminUsername?: string }).adminUsername = payload.username;
      return next();
    } catch {
      return res.status(401).json({ message: "Unauthorized: invalid token" });
    }
  }

  const apiKey = req.header("x-admin-api-key") ?? req.query.apiKey;
  if (apiKey && apiKey === env.ADMIN_API_KEY) {
    return next();
  }

  return res.status(401).json({ message: "Unauthorized: login required" });
}
