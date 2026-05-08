import type { NextFunction, Request, Response } from "express";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const id = (req as Request & { requestId?: string }).requestId;

  res.on("finish", () => {
    const ms = Date.now() - start;
    const line = [
      id ? `rid=${id}` : undefined,
      `${req.method} ${req.originalUrl}`,
      `status=${res.statusCode}`,
      `ms=${ms}`
    ]
      .filter(Boolean)
      .join(" ");
    console.log(line);
  });

  next();
}

