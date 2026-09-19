# Bubbly 信令服务器 · 云端部署指南

> 服务器是一个**无状态**的 Node.js WebSocket 进程：配对关系仅存于内存（全局单房间，最多 2 人），不落盘、无数据库。因此部署极轻 —— **1 核 1G 的最低配云主机即可**，升级/回滚也只是换一个容器实例。

---

## 部署方式一览

| 方式 | 适用场景 | 推荐度 |
|------|----------|--------|
| **Docker Compose** | 有 SSH 的云主机（阿里云/腾讯云/AWS 等） | ⭐⭐⭐ 推荐 |
| **GHCR 镜像直跑** | 不想 clone 代码，只要跑起来 | ⭐⭐⭐ 推荐 |
| **裸机 systemd** | 无法使用 Docker 的环境 | ⭐⭐ 备选 |

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

### 升级到新版本

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
