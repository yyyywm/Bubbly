# Bubbly 信令服务器 · 云端部署指南

> 服务器是一个**无状态**的 Node.js WebSocket 进程：配对关系仅存于内存（全局单房间，最多 2 人），不落盘、无数据库。因此部署极轻 —— **1 核 1G 的最低配云主机即可**，升级/回滚也只是换一个容器实例。

---

## 部署方式一览

| 方式 | 适用场景 | 推荐度 |
|------|----------|--------|
| **Docker Compose** | 有 SSH 的云主机（阿里云/腾讯云/AWS 等） | ⭐⭐⭐ 推荐 |
| **GHCR 镜像直跑** | 不想 clone 代码，只要跑起来 | ⭐⭐⭐ 推荐 |
| **裸机 systemd** | 无法使用 Docker 的环境 | ⭐⭐ 备选 |

此外可叠加**自动部署**（见下方专节）：配置 GitHub Webhook 后，push 到 `main` 即自动拉取并重启，无需登录服务器。

---

## 方式一：Docker Compose（推荐）

### 1. 前置条件

- 一台云主机（1C1G 起步），已安装 Docker 与 Docker Compose 插件
  ```bash
  # 官方脚本安装 Docker（国内服务器可用阿里源，见 Docker 文档）
  curl -fsSL https://get.docker.com | sh
  sudo systemctl enable --now docker
  ```

### 2. 启动

```bash
git clone https://github.com/yyyywm/Bubbly.git
cd Bubbly
docker compose up -d
```

### 3. 验证

```bash
curl http://127.0.0.1:8080/health
# {"status":"ok","clients":0,"version":"1.0.0","uptime":12}
```

容器内置 `HEALTHCHECK`，`docker ps` 中状态显示 `(healthy)` 即正常。

### 4. 放行端口

在云厂商控制台的**安全组 / 防火墙**中放行 TCP `8080`（或自定义端口）。

### 5. 自定义端口

```bash
# 宿主机使用 9000 端口对外
BUBBLY_PORT=9000 docker compose up -d
```

---

## 方式二：GHCR 镜像直跑（免 clone）

每次发版，Release 流水线会自动构建镜像并推送到 GHCR：

```bash
docker run -d \
  --name bubbly-server \
  --restart unless-stopped \
  -p 8080:8080 \
  ghcr.io/yyyywm/bubbly-server:latest
```

> 首次拉取 GHCR 公共镜像无需登录；若仓库为私有，需先 `docker login ghcr.io`。

---

## 方式三：裸机 systemd（无 Docker 环境）

```bash
# 1. 需要 Node.js >= 18，代码部署到 /opt/Bubbly（与下方 systemd 配置对应）
sudo git clone https://github.com/yyyywm/Bubbly.git /opt/Bubbly
cd /opt/Bubbly
sudo npm ci --omit=dev
```

`/etc/systemd/system/bubbly.service`：

```ini
[Unit]
Description=Bubbly Signaling Server
After=network.target

[Service]
Type=simple
User=nobody
WorkingDirectory=/opt/Bubbly
Environment=PORT=8080
ExecStart=/usr/bin/node src/server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bubbly
systemctl status bubbly
```

---

## 自动部署：GitHub Webhook（push main 自动拉取并重启）

> 依托**方式一（Docker Compose）**：在宿主机上运行一个零依赖的 Node 监听器
> [`scripts/deploy-webhook.js`](scripts/deploy-webhook.js)。GitHub 仓库 `main`
> 收到 push 时，监听器自动完成"拉取代码 → 重建镜像 → 重启容器 → 健康检查"，
> 全程无需登录服务器。裸机 systemd 部署同样适用（见第 7 步自定义命令）。

### 1. 前置条件

- 已按方式一完成部署（服务器上有仓库目录，容器正在运行）
- 宿主机已安装 Node.js >= 18（仅监听器需要，Docker 内的服务不依赖宿主机 Node）：

  ```bash
  # Debian/Ubuntu，NodeSource 源
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

### 2. 生成 Secret 并配置监听器

```bash
# 生成随机密钥（妥善保存，第 4 步 GitHub 配置里还要用同一值）
openssl rand -hex 32

# 仓库目录以 /opt/Bubbly 为例
cd /opt/Bubbly
sudo cp deploy/webhook.env.example deploy/webhook.env
sudo chmod 600 deploy/webhook.env
sudo nano deploy/webhook.env   # 将生成的密钥填入 WEBHOOK_SECRET
```

**监听端口可自定义**：`webhook.env` 中的 `WEBHOOK_PORT` 决定监听端口（默认 `9000`，本文档以默认值为例）。如需修改，改完记得同步三处：

1. `sudo systemctl restart bubbly-webhook` 使配置生效；
2. 云安全组 / 防火墙放行的端口；
3. 第 4 步 GitHub Payload URL 中的端口号。

### 3. 安装监听器的 systemd 服务

```bash
sudo cp deploy/bubbly-webhook.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bubbly-webhook

# 自检：监听器存活（端口号以你的 WEBHOOK_PORT 为准）
curl http://127.0.0.1:9000/health
# {"ok":true,"deploying":false,"pending":false,"lastDeploy":null}
```

### 4. 配置 GitHub Webhook

仓库页面 → **Settings → Webhooks → Add webhook**：

| 配置项 | 填写值 |
|--------|--------|
| Payload URL | `http://<服务器公网IP>:<WEBHOOK_PORT>/webhook`（如默认 9000） |
| Content type | `application/json` |
| Secret | 与 `deploy/webhook.env` 中 `WEBHOOK_SECRET` **完全一致** |
| SSL verification | 直连 IP + http 时选 **Disable**（套反向代理后可启用，见下） |
| 触发事件 | 选 **Just the push event** |

保存后 GitHub 会立即发送一条 `ping` 事件，监听器日志出现
`收到 GitHub ping` 且页面显示绿色 ✓ 即表示打通。

### 5. 放行端口（注意收敛来源）

在云厂商安全组放行 TCP `9000`（即你的 `WEBHOOK_PORT`）。该端口只应被 GitHub 访问，两种收敛方式任选：

- **按来源 IP 放行**：仅对 GitHub Webhook 来源网段放行（列表见
  `https://api.github.com/meta` 返回 JSON 的 `hooks` 字段）；
- **走反向代理**：由 Caddy/Nginx 在 443 上转发 `/webhook` 到 `127.0.0.1:<WEBHOOK_PORT>`，
  安全组不放行监听端口（顺带解决 SSL verification 问题）。

### 6. 工作流程与验证

push 到 `main` 后，监听器自动执行（`journalctl -u bubbly-webhook -f` 观察）：

```text
1. 校验 X-Hub-Signature-256 签名（HMAC-SHA256，防伪造请求）
2. 仅响应 main 分支 push（其他分支/标签/PR 事件一律忽略）
3. git fetch origin main && git reset --hard origin/main
   ⚠ 服务器仓库本地的任何改动都会被丢弃，服务器上不要手改代码
4. docker compose up -d --build（重建镜像并重启容器）
5. 轮询 http://127.0.0.1:8080/health 直到新版本就绪
```

要点：

- **先回执后执行**：监听器校验签名后立即向 GitHub 返回 `202`，部署在后台进行，
  结果以监听器日志为准（GitHub 页面上的 Recent Deliveries 只显示受理成功）；
- **合并连续 push**：部署进行中再次收到 push 会排队，本轮结束后自动补跑一次，
  不会并发执行两个部署；
- **幂等**：远端无新提交时仅做 fetch 比对，跳过重建。

### 7. 自定义部署命令（可选）

监听器默认执行 `docker compose up -d --build`。在 `webhook.env` 中设置
`WEBHOOK_DEPLOY_CMD` 可整条替换，例如裸机 systemd 部署：

```bash
WEBHOOK_DEPLOY_CMD=npm ci --omit=dev && systemctl restart bubbly
```

> 监听器默认以 root 运行（见 `deploy/bubbly-webhook.service` 注释），
> 直接调用 `systemctl` 无需 sudo。

### 8. 常见问题

| 现象 | 原因与处理 |
|------|-----------|
| Webhook 页面 401 | `webhook.env` 的 Secret 与 GitHub 配置不一致；改后 `sudo systemctl restart bubbly-webhook` |
| 页面 ✓ 但服务没更新 | 部署是后台执行的，看 `journalctl -u bubbly-webhook -f`：可能构建失败或健康检查超时 |
| 返回 ignored | 非 push 事件或非 `main` 分支，属预期过滤 |
| 健康检查 60 秒未通过 | 容器可能起在了其他端口，核对 `WEBHOOK_HEALTH_URL` 与 `BUBBLY_PORT` |

---

## 公网接入：务必启用 WSS

客户端直连 `ws://` 为**明文传输**，公网强烈建议套一层 TLS 反向代理，客户端改填 `wss://` 地址。

### 方案 A：Caddy（最简，自动 HTTPS）

```text
# /etc/caddy/Caddyfile
bubbly.example.com {
    reverse_proxy localhost:8080
}
```

```bash
sudo systemctl reload caddy
```

### 方案 B：Nginx + certbot

```nginx
server {
    listen 443 ssl;
    server_name bubbly.example.com;

    ssl_certificate     /etc/letsencrypt/live/bubbly.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bubbly.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;   # 心跳间隔 30s，超时放宽即可
    }
}
```

**客户端设置面板填写：`wss://bubbly.example.com`**（不带端口，走 443）。

---

## 安全须知（私人部署必读）

1. **服务器无鉴权**：协议设计为"知道地址即可连接"，且全局限 2 人。若地址泄露，陌生人可占满房间导致你们连不上。
   - 缓解：安全组仅放行你们两人的出口 IP；或改用非标准端口；或仅在需要时启动服务器。
2. **消息为内存暂存、明文传输**（未启用 WSS 时）：请勿通过 Bubbly 发送密码等敏感信息。
3. **单条消息上限 64KB**（`MAX_PAYLOAD`），超限连接会被 ws 库直接断开，无需额外防护。

---

## 运维速查

| 操作 | Docker Compose | 裸机 systemd |
|------|----------------|--------------|
| 查看状态 | `docker compose ps` | `systemctl status bubbly` |
| 查看日志 | `docker compose logs -f` | `journalctl -u bubbly -f` |
| 重启 | `docker compose restart` | `sudo systemctl restart bubbly` |
| 停止 | `docker compose down` | `sudo systemctl stop bubbly` |
| 自动部署日志 | `journalctl -u bubbly-webhook -f` | `journalctl -u bubbly-webhook -f` |

### 升级到新版本

> 已配置上方 Webhook 自动部署的，push 到 `main` 即自动完成升级，跳过本节。

```bash
# Docker Compose（本地构建方式）
cd Bubbly && git pull && docker compose up -d --build

# GHCR 镜像方式
docker pull ghcr.io/yyyywm/bubbly-server:latest
docker stop bubbly-server && docker rm bubbly-server
docker run -d --name bubbly-server --restart unless-stopped \
  -p 8080:8080 ghcr.io/yyyywm/bubbly-server:latest
```

```bash
# 裸机
cd /opt/Bubbly && git pull && npm ci --omit=dev && sudo systemctl restart bubbly
```

> 升级会中断当前连接，客户端 5 秒内自动重连，无需手动操作。

### 回滚

```bash
# 服务器：换用旧版本镜像 tag
docker run -d --name bubbly-server --restart unless-stopped \
  -p 8080:8080 ghcr.io/yyyywm/bubbly-server:1.0.0

# 客户端：到 GitHub Releases 下载旧版安装包重装
```

---

## 健康检查端点

`GET /health`，用于拨测、负载均衡与容器探针：

```json
{
  "status": "ok",      // 固定值，进程存活即可响应
  "clients": 1,        // 当前房间人数（0~2）
  "version": "1.0.0",  // 服务版本，与 package.json 一致
  "uptime": 86400      // 进程运行秒数
}
```
