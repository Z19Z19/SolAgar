FROM node:22-alpine

WORKDIR /app

# Copy shared types and server files
COPY shared ./shared
COPY server/package*.json ./server/
COPY server/prisma ./server/prisma/

WORKDIR /app/server
RUN npm install
RUN npx prisma generate

COPY server/tsconfig.json ./
COPY server/src ./src

# Verify TypeScript compilation during image build
RUN npm run typecheck

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
