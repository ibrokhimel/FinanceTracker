FROM node:20-alpine

# Build deps for better-sqlite3 + canvas (Pango, Cairo, libjpeg, pixman)
RUN apk add --no-cache python3 make g++ pkgconfig cairo-dev jpeg-dev pango-dev giflib-dev pixman-dev

WORKDIR /app

# Install deps first (better caching)
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Persisted data lives here
VOLUME ["/app/data"]
ENV DB_PATH=/app/data/finance.db
ENV LOG_FORMAT=json
ENV HEALTH_PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "index.js"]
