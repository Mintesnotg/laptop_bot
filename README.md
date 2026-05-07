# Telegram Laptop Recommendation Bot (MVP)

This project sets up a full development environment for a Telegram chatbot that suggests laptops based on user criteria.

## Architecture

1. Telegram User interacts with bot (`/start`, inline keyboard choices).
2. Telegraf Bot layer manages conversation state + validations.
3. Bot sends `POST /api/recommendations` to Express backend.
4. Recommendation service filters + ranks laptops.
5. PostgreSQL stores products, user preferences, request logs, and recommendation results.
6. Admin dashboard (`/admin`) allows adding/editing products and checking analytics.

## Database Design (from your whiteboard + prompt)

Core data modeled in Prisma:

- `Product`
- `ProductImage`
- `TelegramUser`
- `UserPreference`
- `RecommendationRequest`
- `RecommendationResult`
- `UserActivityLog`

### Why this schema matches your flow

- **Product fields** include: brand, model, price, RAM, storage, CPU, GPU, usage tags, images.
- **Budget/usage/spec input** is captured as `RecommendationRequest`.
- **Top 3-5 results** are stored with rank/score in `RecommendationResult`.
- **Analytics** can be built from request + result logs.

### Table breakdown

1. `Product`
   `id`, `brand`, `model`, `price`, `ramGb`, `storageGb`, `storageType`, `cpu`, `gpu`, `usageTags[]`, `description`, `isActive`, timestamps.
2. `ProductImage`
   `id`, `productId`, `imageUrl`, `sortOrder`.
3. `TelegramUser`
   `id`, `telegramUserId`, `username`, `firstName`, `lastName`, `languageCode`, timestamps.
4. `UserPreference`
   `id`, `userId`, `budgetMin`, `budgetMax`, `usageTag`, `ramGb`, `storageGb`, `createdAt`.
5. `RecommendationRequest`
   `id`, `telegramUserId`, `budgetMin`, `budgetMax`, `usageTag`, `ramGb`, `storageGb`, `createdAt`.
6. `RecommendationResult`
   `id`, `requestId`, `productId`, `score`, `rank`.
7. `UserActivityLog`
   `id`, `userId`, `action`, `payload (JSON)`, `createdAt`.

## Phase 1 MVP Task Breakdown

### 1. Bot Interaction Flow

- `/start` command
- Budget selection via inline keyboard
- Usage selection
- RAM selection
- Storage selection
- Back navigation and "Back to Home"
- Result card output (model/spec/price/CTA)

Implemented in `src/bot/index.ts` and `src/bot/keyboards.ts`.

### 2. Backend API

- `POST /api/recommendations`
- `POST /api/user-preferences`
- Admin APIs:
  - `GET /api/admin/products`
  - `POST /api/admin/products`
  - `PUT /api/admin/products/:id`
  - `GET /api/admin/analytics`

Implemented in `src/api/routes`.

### 3. Recommendation Engine

- Rule-based filtering on budget, usage, RAM, storage.
- Ranking score based on budget proximity + hardware + usage fit.
- Returns top 3-5 (configurable by `limit`, default 5).

Implemented in `src/services/recommendationService.ts`.

### 4. Admin Dashboard

- Simple admin page to add products and load analytics.
- Uses API key header (`x-admin-api-key`).

Implemented in `public/admin.html` and `/api/admin/*` routes.

### 5. Database + ORM

- PostgreSQL in Docker (`docker-compose.yml`).
- Prisma schema and seed data ready.

Implemented in `prisma/schema.prisma` and `prisma/seed.ts`.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Start PostgreSQL:

```bash
docker compose up -d
```

3. Configure `.env`:

- set `TELEGRAM_BOT_TOKEN`
- set secure `ADMIN_API_KEY`

4. Run Prisma setup:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

5. Start app:

```bash
npm run dev
```

6. Open admin UI:

- `http://localhost:3000/admin`

## Prisma TLS Note (for this machine)

If Prisma engine download fails with certificate chain errors, run command session with TLS override in your terminal:

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"
npm run db:generate
npm run db:migrate
```

Then close terminal and reopen for normal secure behavior.

## Future Phase 2 Suggestions

- Admin authentication (JWT + login) instead of API key.
- Product inventory/availability + seller contact records.
- Saved user sessions in Redis/PostgreSQL for multi-device continuity.
- Better ranking strategy with weighted preference profiles.
- Webhook deployment to cloud (Render/Fly/Railway/AWS).
