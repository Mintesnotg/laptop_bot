import { Router } from "express";
import { recommendLaptops } from "../../services/recommendationService";
import { env } from "../../env";
import { recommendationRequestSchema } from "../../shared/contracts";

export const recommendationRouter = Router();

function formatErrorDetail(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

recommendationRouter.post("/", async (req, res) => {
  const parsed = recommendationRequestSchema.safeParse(req.body);
  const requestId = (req as typeof req & { requestId?: string }).requestId;

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid recommendation request",
      errors: parsed.error.flatten().fieldErrors
    });
  }

  try {
    const result = await recommendLaptops(parsed.data);

    return res.json(result);
  } catch (error) {
    const detail = formatErrorDetail(error);
    console.error("[api][recommendations] failed", {
      requestId: requestId ?? "-",
      detail,
      error
    });

    const body: { message: string; detail?: string } = {
      message: "Failed to generate recommendations. Please try again or adjust your filters."
    };

    if (env.NODE_ENV === "development") {
      body.detail = detail;
    }

    return res.status(500).json(body);
  }
});
