## Bot → API debugging (local)

### Run
- `npm run dev`
- Open Admin UI: `http://localhost:3000/admin`

### Bot → API request flow (what calls what)
- Bot builds keyboards: `src/bot/keyboards.ts`
- Bot collects session state + triggers request: `src/bot/index.ts` (`showRecommendations()`)
- Bot calls API: `src/bot/recommendationClient.ts` (`fetchRecommendations()`)
- API validates request: `src/api/routes/recommendationRoutes.ts`
- Recommendation logic + DB queries: `src/services/recommendationService.ts` (`recommendLaptops()`)

### Best breakpoint / log points
- **Bot payload**: `src/bot/recommendationClient.ts` in `fetchRecommendations(payload)`
  - Inspect: `payload`, `response.status`, `await response.text()` on failure
- **Bot session state**: `src/bot/index.ts` in `showRecommendations(ctx)`
  - Inspect: `ctx.session` (`budgetKey`, `usage`, `ramGb`, `storageGb`)
- **API validation**: `src/api/routes/recommendationRoutes.ts`
  - Inspect: `parsed.success`, `parsed.error.flatten()`
- **DB query + ranking**: `src/services/recommendationService.ts` in `recommendLaptops(filters)`
  - Inspect: `budget`, `products.length`, `ranked[0..]`, `topResults`

### Correlation ID
The API assigns an `x-request-id` to every request and logs one line per request.
- If you send an `x-request-id` header from the bot, the API will reuse it.
- This makes it easy to grep logs for one end-to-end run.

