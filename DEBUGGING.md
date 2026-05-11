## Bot -> API debugging (local)

### Recommended VS Code debug profile
- Open Run and Debug in VS Code.
- Start `Debug API + Bot (tsx)` from `.vscode/launch.json`.
- This runs `npm run dev` through `tsx`, so breakpoints in `src/**/*.ts` are hit correctly.

### Attach mode (optional)
If you already started the app in terminal and want to attach:
1. Start with inspector enabled:
   - PowerShell: `$env:NODE_OPTIONS="--inspect=9229"; npm run dev`
2. In VS Code run `Attach API + Bot (9229)`.

### Run without debugger
- `npm run dev`
- Open Admin UI: `http://localhost:3000/admin`

### Bot -> API request flow (what calls what)
- Bot keyboards and callbacks: `src/bot/index.ts`, `src/bot/keyboards.ts`
- Bot API client: `src/bot/recommendationClient.ts`
- API input validation: `src/api/routes/recommendationRoutes.ts`
- Recommendation logic and ranking: `src/services/recommendationService.ts`

### Best breakpoint points
- Bot multi-usage selection handling:
  - `src/bot/index.ts` at `bot.action(/^usage_toggle:(.+)$/i, ...)`
  - `src/bot/index.ts` at `bot.action("usage_done", ...)`
- Bot outbound recommendation payload:
  - `src/bot/recommendationClient.ts` at `fetchRecommendations(payload)`
- API validation boundary:
  - `src/api/routes/recommendationRoutes.ts` at `safeParse(req.body)`
- Ranking and usage match behavior:
  - `src/services/recommendationService.ts` at `recommendLaptops(filters)`

### Correlation ID
The API logs each request with `x-request-id`.
- Bot calls set `x-request-id` as `bot-rec:<uuid>`.
- Use this ID to trace one request end-to-end in logs.
