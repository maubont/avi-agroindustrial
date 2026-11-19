FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Python 3 + openpyxl para inyectar gráficos nativos editables en exportaciones AV-1/AV-2
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-openpyxl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "server/index.js"]
