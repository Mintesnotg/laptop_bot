import { NextFunction, Request, Response } from "express";
import { env } from "../../env";

export function requireAdminApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.header("x-admin-api-key") ?? req.query.apiKey;

  if (!apiKey || apiKey !== env.ADMIN_API_KEY) {
    return res.status(401).json({ message: "Unauthorized: missing or invalid admin API key" });
  }

  next();
}
