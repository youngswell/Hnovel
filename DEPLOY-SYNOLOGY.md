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

### 从 git 一键部署 / 定时自动部署（推荐）
> 适用：群晖上是通过 `git clone` 得到的完整仓库。配套脚本 `scripts/deploy-synology.sh` 已提供（纯 docker 命令，无需 compose 插件）。

**配置步骤**：
1. 把 `scripts/deploy-synology.sh` 上传到群晖 `/volume1/web_packages/docker/hnovel/scripts/`，右键属性确认有执行权限（或 SSH `chmod +x`）。
2. 群晖「控制面板 → 任务计划 → 新增 → 计划的任务 → 自定义脚本」：
   - 常规：用户选 `root`（执行 docker 需要）。
   - 计划：二选一
     - **手动运行** → 以后发布后点「运行」= 一键部署。
     - **按计划运行**（如每 5 分钟）→ git push 后自动部署，无需公网 webhook。
   - 任务设置 → 运行命令：
     ```
     bash /volume1/web_packages/docker/hnovel/scripts/deploy-synology.sh
     ```

**脚本行为**：
- `git fetch` 对比本地/远程提交，无新提交则跳过（定时轮询不浪费）。
- 有更新 → `git pull --ff-only` → `docker build`（带 `BASE_IMAGE` 国内代理）→ 重建容器。
- 端口 8888、挂载 `./data` 与 `docker-compose.yml` 保持一致；数据不受影响。

> 说明：脚本里 `docker run` 的参数需与 `docker-compose.yml` 保持同步。若装了 docker compose 插件，也可改用 `docker compose build --pull && docker compose up -d --force-recreate`（配置单一来源，更省心）。

**想要 git push 后即时触发（webhook）**：
- 云端仓库（GitHub/Gitee）的 webhook 需要群晖有公网地址或内网穿透，内网部署一般不具备，不推荐。
- 若用内网自建 Gitea/GitLab，可配 webhook 指向群晖触发部署（需额外跑一个 webhook 监听服务）。
- **内网场景推荐直接用上面的「按计划运行」定时轮询**，效果接近自动部署且零额外服务。

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
> 关键前提：容器是用**群晖项目目录里的代码**构建的。改完代码后，必须先同步到群晖，再触发重新构建。

1. **同步新代码到群晖**：
   - 用 git：SSH 进入项目目录执行 `git pull`。
   - 不用 git：把改动后的文件重新上传覆盖到 `/volume1/web_packages/docker/hnovel/`。
2. **触发重新构建**（注意：群晖「项目」里的按钮叫「**构建**」，不是「重新构建」）：
   - Container Manager → 项目 → 选中 `hnovel` → 操作 →「构建」。
   - **关键行为**：当镜像 `hnovel:latest` 已存在时，「构建」可能**不强制重建**（表现为秒完成、内容没更新）。
   - **强制更新**：先到「映像」里删除 `hnovel:latest`，再回「项目」点「构建」，必然全量重建。容器不必手动删，构建时会自动替换。
3. 数据在 `./data`，不受影响。

#### 更可靠的替代：命令行一键发布（推荐长期用）
装好 docker compose 插件后，用命令行（或做成群晖任务计划）强制构建 + 重建容器：
```bash
cd /volume1/web_packages/docker/hnovel
docker compose build --pull
docker compose up -d --force-recreate
```

#### 构建了但内容没更新？按顺序排查
- ❌ 是不是在「容器」页签点的重建/重启？那是用**旧镜像**重建，秒完成、内容不变。→ 必须走「项目」的「构建」。
- ❌ 镜像还在导致「构建」没强制重建？→ 删除 `hnovel:latest` 镜像后再「构建」。
- ❌ 群晖上的源码是不是最新的？本地改 ≠ 群晖改，检查 `/volume1/web_packages/docker/hnovel/web/src`、`server/src` 是否含新代码。
- ✅ 验证：浏览器**强制刷新（Ctrl+F5）**后确认新功能/新页面出现。

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

### `docker compose` 报 unknown shorthand flag: 'd'
群晖自带的 docker CLI **没有安装 Compose v2 插件**，不支持 `docker compose` 子命令。
- 首选：改用 Container Manager → 项目 → 新增 → 选择代码文件夹 →「使用现有的 docker-compose.yml」，群晖图形界面自带 Compose 能力。
- 或安装 Compose 插件后用命令行：
  ```bash
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" -o /usr/local/lib/docker/cli-plugins/docker-compose   # ARM 换成 linux-aarch64
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  sudo docker compose version   # 验证
  ```

### 构建报 `registry-1.docker.io ... i/o timeout`（Docker Hub 拉取失败，国内网络常见）
群晖访问不了 Docker Hub 时会卡在「拉取镜像/构建前端」这一步。
- 本项目 `Dockerfile` 已移除 `# syntax=docker/dockerfile:1`（避免额外拉取构建前端镜像）。
- **根本解法：配置 Docker 镜像加速器**：
  1. 打开 Container Manager → 左侧「**注册表**」→ 右上角「**设置**」。
  2. 找到「注册表加速器 / Registry mirror」，添加以下一个或多个地址后保存：
     - `https://docker.m.daocloud.io`
     - `https://docker.1ms.run`
     - `https://docker.1panel.live`
     - `https://hub.rat.dev`
  3. 回到「项目」→ 选中 hnovel → 点「**重新构建**」（或先删除该项目再重新新增）。
- 本项目已内置「基础镜像走国内代理」机制：`docker-compose.yml` 的 `build.args.BASE_IMAGE` 默认 `docker.m.daocloud.io/library/node:22-slim`，构建时直接走国内可直连的代理，不再强依赖 Docker Hub。若该地址不通，把 `BASE_IMAGE` 换成 `docker.1ms.run/library/node:22-slim` 或 `docker.1panel.live/library/node:22-slim` 再构建。

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

### 容器启动失败：`Bind mount failed: '.../data' does not exists`
`docker-compose.yml` 挂载了 `./data:/data`，但**宿主机上还没有 `data` 文件夹**（bind mount 要求目录先存在，群晖不会自动创建）。
- 在 File Station 里，到 `docker-compose.yml` 同目录下新建文件夹 `data`，再回 Container Manager 点「启动」即可。
- 全新部署时请先建好 `data` 再启动；有旧数据时把内容放进这个 `data` 目录再启动。

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
