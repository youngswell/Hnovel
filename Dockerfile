# Hnovel — 多阶段构建：先在 Node 环境中构建前端与后端，再产出精简的运行时镜像。
# 部署目标：群晖 Container Manager（x86_64 / aarch64 均可）。
# 说明：不使用 "# syntax=docker/dockerfile:1"，避免构建时从 Docker Hub 拉取 BuildKit 前端镜像（国内网络易 i/o timeout）。
# 本文件只用标准 Dockerfile 语法，删除该指令完全安全。

# ---------- Stage 1: builder ----------
ARG BASE_IMAGE=node:22-slim
FROM ${BASE_IMAGE} AS builder
WORKDIR /app

# better-sqlite3 是原生模块，需要编译工具链（prebuilt 下载失败时会现场编译）
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# 1) 根目录依赖
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 2) 构建前端（React + Vite）
COPY web/package.json web/package-lock.json web/
WORKDIR /app/web
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# 3) 构建后端（Express + TypeScript）
WORKDIR /app
COPY server/package.json server/package-lock.json server/
WORKDIR /app/server
# 国内网络下载 better-sqlite3 预编译包经常超时：
# 构建时传 --build-arg BETTER_SQLITE3_BINARY_HOST=https://npmmirror.com/mirrors/better-sqlite3/ 走镜像；
# 未传时用官方源，若下载失败会退化为源码编译（本阶段已装 python3/make/g++，可兜底）。
ARG BETTER_SQLITE3_BINARY_HOST=""
RUN if [ -n "$BETTER_SQLITE3_BINARY_HOST" ]; then \
      export npm_config_better_sqlite3_binary_host="$BETTER_SQLITE3_BINARY_HOST"; \
    fi \
    && npm ci --no-audit --no-fund
COPY server/ ./
RUN npm run build

# ---------- Stage 2: runner ----------
FROM ${BASE_IMAGE} AS runner
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

WORKDIR /app

# 后端依赖（含已编译好的 better-sqlite3 原生模块）
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/dist ./server/dist
# 前端静态产物，由后端 Express 统一托管（index.ts 会按 cwd 相对路径找 ../web/dist）
COPY --from=builder /app/web/dist ./web/dist

# 创作数据（SQLite、章节、角色、app-settings.json 等）全部放在持久化卷 /data
VOLUME /data

# index.ts 用 process.cwd() 相对路径解析 web/dist，因此运行目录固定在 server 下
WORKDIR /app/server
EXPOSE 4000

CMD ["node", "dist/index.js"]
