FROM node:22-bookworm-slim

# Install system dependencies for headless Electron, go2rtc, and build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    xauth \
    unzip \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libx11-xcb1 \
    libxcb1 \
    libxshmfence1 \
    libgl1 \
    libgl1-mesa-dri \
    libgtk-3-0 \
    libxss1 \
    libdbus-1-3 \
    libxtst6 \
    libxcursor1 \
    libxi6 \
    libsecret-1-0 \
    libnotify4 \
    libxrender1 \
    fonts-liberation \
    ca-certificates \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

# Copy package manifests, vendor libraries, and scripts required for postinstall
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY vendor ./vendor
COPY scripts ./scripts

# Install dependencies (runs postinstall script: scripts/download-go2rtc.cjs)
RUN pnpm install --no-frozen-lockfile

# Copy the remaining project sources
COPY . .

# Ensure vendored slicer-meta dist is present in node_modules even if layer was cached
RUN mkdir -p node_modules/@parallel-7/slicer-meta && cp -r vendor/slicer-meta/* node_modules/@parallel-7/slicer-meta/ || true

# Build the WebUI and Electron bundle
RUN pnpm build

# Ensure executable permissions for go2rtc binaries and entrypoint
RUN chmod -R +x resources/bin/ || true
RUN mkdir -p out/main && cp -r resources out/main/resources || true
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

# WebUI port
EXPOSE 3000

ENV NODE_ENV=production
ENV WEBUI_PORT=3000
ENV PRINTER_SPEC=""
ENV WEBUI_PASSWORD=""

ENTRYPOINT ["/app/docker-entrypoint.sh"]
