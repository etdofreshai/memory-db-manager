FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN apk add --no-cache tzdata && \
    VITE_BUILD_DATE="$(TZ='America/Chicago' date '+%Y-%m-%d %I:%M %p CDT')" \
    VITE_BUILD_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" \
    npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY server.js ./
CMD ["node", "server.js"]
