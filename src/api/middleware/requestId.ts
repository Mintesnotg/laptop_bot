import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id")?.trim();
  const id = incoming && incoming.length > 0 ? incoming : randomUUID();

  (req as Request & { requestId?: string }).requestId = id;
  res.setHeader("x-request-id", id);
  next();
}

