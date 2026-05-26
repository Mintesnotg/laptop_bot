FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY src ./src
COPY public ./public

RUN npm run db:generate
RUN npm run build

RUN mkdir -p uploads

EXPOSE 3000

CMD ["npm", "run", "start"]
