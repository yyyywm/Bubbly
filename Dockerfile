# ============================================================
#  Bubbly 信令服务器生产镜像
# ============================================================
#  构建:  docker build -t bubbly-server .
#  运行:  docker run -d -p 8080:8080 bubbly-server
#  说明:  多阶段构建，仅包含生产依赖与 src/server 运行所需文件，
#         以非 root 用户运行，内置 /health 健康检查。
# ============================================================

# ---------- 阶段 1: 安装生产依赖 ----------
FROM node:22-alpine AS deps
WORKDIR /app

# 先复制清单文件，利用 Docker 层缓存：依赖未变时跳过安装
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- 阶段 2: 运行镜像 ----------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

# 非 root 用户运行
RUN addgroup -S bubbly && adduser -S bubbly -G bubbly

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/server ./src/server

USER bubbly

EXPOSE 8080

# 健康检查：探测 /health 端点（Node 22 内置 fetch）
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# SIGTERM 优雅关闭（docker stop 默认信号）
STOPSIGNAL SIGTERM

CMD ["node", "src/server/index.js"]
