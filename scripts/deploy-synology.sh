#!/bin/bash
# ============================================================
# Hnovel 群晖一键部署 / 定时自动部署脚本
#
# 适用：群晖上是通过 `git clone` 得到的完整仓库。
#
# 部署到群晖「控制面板 → 任务计划 → 新增 → 计划的任务 → 自定义脚本」：
#   1) 常规    ：用户选 root（执行 docker 需要）
#   2) 计划    ：二选一
#        - 手动运行  → 以后发布后点「运行」= 一键部署
#        - 按计划运行（如每 5 分钟）→ git push 后自动部署（无需公网 webhook）
#   3) 任务设置 → 运行命令填：
#        bash /volume1/web_packages/docker/hnovel/scripts/deploy-synology.sh
# ============================================================
set -euo pipefail

PROJECT_DIR="/volume1/web_packages/docker/hnovel"
IMAGE="hnovel:latest"
# 与 docker-compose.yml 的 build.args.BASE_IMAGE 保持一致（国内可直连的镜像代理）
BASE_IMAGE="docker.m.daocloud.io/library/node:22-slim"

cd "$PROJECT_DIR"

echo "==> [1/4] 检查远程更新"
git fetch origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "$LOCAL")
if [ "$LOCAL" = "$REMOTE" ]; then
  echo "无新提交，跳过部署"
  exit 0
fi

echo "==> [2/4] 拉取最新代码"
git pull --ff-only

echo "==> [3/4] 构建镜像"
docker build -t "$IMAGE" --build-arg BASE_IMAGE="$BASE_IMAGE" .

echo "==> [4/4] 重建容器"
docker rm -f hnovel 2>/dev/null || true
docker run -d --name hnovel \
  --restart unless-stopped \
  -p 8888:4000 \
  -e NODE_ENV=production \
  -e PORT=4000 \
  -e HOST=0.0.0.0 \
  -e DATA_DIR=/data \
  -v "$PROJECT_DIR/data:/data" \
  "$IMAGE"

echo "==> 部署完成，访问 http://<群晖IP>:8888"
