import cors from "cors";
import express from "express";
import path from "node:path";
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "./openapi";
import { adminRouter } from "./routes/adminRoutes";
import { healthRouter } from "./routes/healthRoutes";
import { recommendationRouter } from "./routes/recommendationRoutes";
import { userPreferenceRouter } from "./routes/userPreferenceRoutes";

const publicDir = path.resolve(process.cwd(), "public");

export function buildApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(publicDir));

  app.get("/admin", (_req, res) => {
    res.sendFile(path.join(publicDir, "admin.html"));
  });
  app.get("/openapi.json", (_req, res) => {
    res.json(openApiDocument);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use("/health", healthRouter);
  app.use("/api/recommendations", recommendationRouter);
  app.use("/api/user-preferences", userPreferenceRouter);
  app.use("/api/admin", adminRouter);

  return app;
}
