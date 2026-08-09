# 群晖（Synology）内网部署指南

本仓库已包含容器化部署所需的全部文件：

| 文件 | 作用 |
| --- | --- |
| `Dockerfile` | 多阶段构建镜像（前端 + 后端 + 原生模块） |
| `docker-compose.yml` | 编排：端口、环境变量、数据卷、健康检查 |
| `.dockerignore` | 排除 `node_modules`、`dist`、本地数据（防泄密） |

生产架构：**单一容器 = Express 后端 + 托管前端静态文件**，内网访问 `http://群晖IP:4000` 即可，无需单独部署前端。

---

## 0. 前置条件

- 群晖 **DSM 7.2+**，并安装套件 **Container Manager**（套件中心 → 搜索 "Container Manager"）。
- 群晖 **x86_64** 或 **aarch64（ARM）** 均可（镜像按当前平台构建）。
- 群晖能访问外网（LLM 默认走 `api.deepseek.com`；若用内网模型服务则只需内网通）。

> 确认架构：`控制面板 → 信息中心 → 常规` 可看 CPU 型号。

---

## 1. 数据迁移（重要）

所有创作数据默认在本地 `story-output/` 目录：

```
story-output/
├─ app-settings.json   ← 含 LLM API Key，注意保密
├─ hnovel.db           ← SQLite 主库
├─ be690dee-.../       ← 各故事章节/角色数据
└─ fbdfdfbd-.../
```

部署后容器会读写 `/data`（对应宿主机 `./data`）。把现有数据迁过去：

1. 在项目文件夹（即 `docker-compose.yml` 所在目录）下新建 `data` 文件夹。
2. 把本地 `story-output/` **里面的所有内容**拷贝到 `data/`（是内容，不是套一层 `story-output`）。
   - 可通过 SMB 共享、File Station 上传，或 `scp -r story-output/* 用户@群晖IP:/路径/Hnovel/data/`。
3. 如果 `story-output/` 里没有文件（全新部署），跳过即可，容器首次启动会自动创建。

> ⚠️ `app-settings.json` 里存了 API Key，请走安全的传输通道，别明文暴露。

---

## 2. 上传项目到群晖

把整个项目目录（根目录含 `Dockerfile`、`docker-compose.yml`、`web/`、`server/`、`package.json`）放到群晖任意共享文件夹，例如：

```
/volume1/hnovel/
├─ Dockerfile
├─ docker-compose.yml
├─ data/          ← 迁移后的数据
├─ web/
├─ server/
└─ ...
```

上传方式任选：

- **SMB 共享**：Windows 资源管理器输入 `\\群晖IP`，复制到共享文件夹。
- **File Station**：网页端上传/拖拽。
- **SSH/scp**：`scp -r E:\Project\Hnovel 用户@群晖IP:/volume1/hnovel/`（注意排除 node_modules 等大目录，或用 git 拉取）。

> 建议用 git 管理代码，在群晖上 `git clone`，后续更新只需 `git pull`。

---

## 3. 构建并启动

### 方式 A：Container Manager 图形界面（推荐新手）

1. 打开 **Container Manager → 项目 → 新增**。
2. 项目名称填 `hnovel`；路径选择上面上传的文件夹（需能读到 `docker-compose.yml`）。
3. 来源选「使用现有的 docker-compose.yml」，下一步 → 完成。
4. Container Manager 会自动执行 `docker compose up -d --build`，耐心等待镜像构建（首次构建需下载依赖，约几分钟到十几分钟，取决于网速）。
5. 构建完成后在「容器」里能看到 `hnovel` 处于运行状态。

### 方式 B：SSH 命令行

```bash
# 开启群晖 SSH：控制面板 → 终端机和 SNMP → 启用 SSH 功能
ssh 用户@群晖IP
cd /volume1/hnovel
sudo docker compose up -d --build
```

---

## 4. 验证

1. 浏览器访问 `http://群晖IP:4000`，应能看到写作工作台首页。
2. 健康检查：
   ```bash
   curl http://127.0.0.1:4000/api/health        # → {"status":"ok",...}
   curl http://127.0.0.1:4000/api/health/llm    # → 模型连通性（需先配置 LLM）
   ```
3. 进入网页「应用设置」填入 `API Key / Base URL / 模型`，保存后点健康检查确认 LLM 可用。
4. 确认旧数据可见（迁移过的话能看到原有故事）。

---

## 5. 可选：反向代理（HTTPS / 域名 / 端口 80/443）

群晖自带反向代理，可以让你用 `https://小说.example.com` 或 `http://群晖IP`（不加端口）访问：

1. `控制面板 → 登录门户 → 高级 → 反向代理 → 新增`。
2. 源：协议 `HTTPS`（或 HTTP），主机名填域名或 `*`，端口 `443`（或 80）。
3. 目的地：协议 `HTTP`，主机名 `localhost`，端口 `4000`。
4. HTTPS 需要先有证书：`控制面板 → 安全性 → 证书`。

---

## 6. 日常维护

### 查看日志
```bash
docker logs -f hnovel
```
或 Container Manager → 容器 → `hnovel` → 日志。

### 重启 / 停止
```bash
docker compose restart   # 重启
docker compose stop      # 停止
docker compose up -d     # 重新拉起
```

### 升级到新版本
```bash
# 1. 上传/拉取新代码到项目目录
# 2. 重新构建（数据在 ./data，不受影响）
docker compose up -d --build
```

---

## 7. 备份

只需备份宿主机的 `data/` 目录（数据库 + 章节 + 设置）：

```bash
# 最稳妥：先停容器再拷贝，保证 SQLite 一致性
docker compose stop
tar czf hnovel-backup-$(date +%F).tar.gz data/
docker compose start
```

> SQLite 使用 WAL 模式，直接拷贝时请带上 `hnovel.db-wal` / `hnovel.db-shm`；推荐用上面的"停容器再拷"方式。可用群晖 Hyper Backup 定期备份该目录。

---

## 8. 常见问题

### 内网其他设备访问不到
- 确认容器已监听 `0.0.0.0`（本项目默认已是），`HOST=0.0.0.0`。
- 确认防火墙/端口转发没拦截 4000 端口。
- 确认访问地址是 `http://群晖IP:4000` 而非 localhost。

### 端口被占用
改 `docker-compose.yml` 里的 `ports: "4000:4000"` 左边为其他端口（如 `"8080:4000"`），再重新构建。

### 构建很慢 / better-sqlite3 下载超时（国内网络常见）
- `better-sqlite3` 是原生模块，构建时 `prebuild-install` 默认从 GitHub 下载预编译包，国内经常超时。
- 解法一：走 npmmirror 镜像。编辑 `docker-compose.yml`，在 `build.args` 里加上：
  ```yaml
  build:
    context: .
    args:
      BETTER_SQLITE3_BINARY_HOST: https://npmmirror.com/mirrors/better-sqlite3/
  ```
  然后重新构建。
- 解法二（兜底）：本仓库 `Dockerfile` 构建阶段已安装 `python3 / make / g++`，即使预编译包下载失败也会自动从源码现场编译，只是耗时更长。
- Docker 基础镜像（`node:22-slim`）拉取慢的话，可在 Container Manager → 注册表设置里配置国内镜像加速器。

### 容器启动失败 / better-sqlite3 相关报错
- 查看日志 `docker logs hnovel`。
- 确认镜像按当前 CPU 架构构建（ARM 机型要用 arm64 的 node 基础镜像，本项目 Dockerfile 会自动匹配）。
- 重新构建清缓存：`docker compose build --no-cache`。

### AI 生成报错 / 无法连接模型
- 群晖需能访问 `LLM_BASE_URL`（外网则需出网，内网模型则需内网可达）。
- 在网页「应用设置」确认 `Base URL` 结尾带 `/v1` 且模型名正确，用 `/api/health/llm` 验证。

### 数据丢了 / 想换存储位置
- 数据永远在宿主机 `./data`（compose 里挂载的目录），容器重建不丢。
- 想换位置就改 `volumes` 挂载路径后重新部署。

---

## 9. 项目相关代码改动说明

为支持内网部署，`server/src/index.ts` 已做如下改动：

```ts
const HOST = process.env.HOST || '0.0.0.0'   // 原为写死 '127.0.0.1'
app.listen(PORT, HOST, () => { ... })
```

即：**默认监听所有网卡**，内网其他设备可通过群晖 IP 访问；本地开发不受影响。如需收紧，可通过环境变量 `HOST` 覆盖。
