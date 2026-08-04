# ---- deps: install node_modules ----
FROM node:22-alpine AS deps
WORKDIR /app

# Alpine needs this for Prisma's engine binaries
RUN apk add --no-cache libc6-compat openssl

ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DIRECT_URL="postgresql://build:build@localhost:5432/build"
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Prisma client is GENERATED, not shipped — postinstall handles it
RUN npm ci

# ---- builder: build the Next.js app ----
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Regenerate to be certain the client matches the schema in this build
# prisma generate ko DB ki zaroorat nahi, sirf schema padhta hai.
# Par prisma.config.ts DATABASE_URL maangti hai, isliye build-time dummy.
# Runtime pe asli URL ECS Secrets Manager se aayegi.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DIRECT_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# ---- runner: minimal runtime image ----
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Don't run as root
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# standalone output = only what's needed to run
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma engines + generated client must come along
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
