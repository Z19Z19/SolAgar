FROM node:22-bookworm-slim

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy shared types and server files
COPY shared ./shared
COPY server/package*.json ./server/
COPY server/prisma ./server/prisma/
COPY server/scripts ./server/scripts/

WORKDIR /app/server
RUN chmod +x scripts/start-prod.sh
RUN npm install
RUN npx prisma generate

COPY server/tsconfig.json ./
COPY server/src ./src

# Verify TypeScript compilation during image build
RUN npm run typecheck

ENV DATABASE_URL="file:./dev.db"

EXPOSE 4000

CMD ["sh", "./scripts/start-prod.sh"]
