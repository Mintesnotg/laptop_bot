import { Router } from "express";
import { recommendLaptops } from "../../services/recommendationService";
import { recommendationRequestSchema } from "../../shared/contracts";

export const recommendationRouter = Router();

recommendationRouter.post("/", async (req, res) => {
  const parsed = recommendationRequestSchema.safeParse(req.body);

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
    console.error("[api][recommendations] failed", error);
    return res.status(500).json({
      message: "Failed to generate recommendations. Please try again or adjust your filters."
    });
  }
});
