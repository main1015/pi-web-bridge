#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"
WORKSPACE="${PI_WORKSPACE:-}"
MODE="dev"
FORCE_INSTALL=0
FORCE_BUILD=0
API_KEY="${GEMINI_API_KEY:-}"

print_help() {
  cat <<'EOF'
Pi Web 本地启动脚本

用法:
  ./start.sh [选项]

选项:
  -p, --port <端口>        指定 HTTP 服务端口 (默认: 3000)
  -H, --host <地址>        指定监听地址 (默认: 0.0.0.0，仅本机访问可用 127.0.0.1)
  -w, --workspace <路径>   指定要管理的本地项目目录 (默认: ./pi-workspace)
  -k, --api-key <密钥>     直接传入 GEMINI_API_KEY (不传则读取 .env 或当前环境变量)
      --prod               以生产模式启动 (自动检查或构建 dist/)
      --build              配合 --prod 强制重新执行一次前端构建
      --install            启动前执行一次 npm install
  -h, --help               显示此帮助信息并退出

示例:
  ./start.sh
  ./start.sh -p 8080
  ./start.sh -p 4000 -H 127.0.0.1 -w ~/code/my-project
  ./start.sh --prod -p 3000
  ./start.sh -k "AIza..." -p 3000
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      print_help
      exit 0
      ;;
    -p|--port)
      [[ $# -lt 2 ]] && { echo "错误: $1 缺少端口参数" >&2; exit 1; }
      PORT="$2"
      shift 2
      ;;
    --port=*)
      PORT="${1#*=}"
      shift
      ;;
    -H|--host)
      [[ $# -lt 2 ]] && { echo "错误: $1 缺少地址参数" >&2; exit 1; }
      HOST="$2"
      shift 2
      ;;
    --host=*)
      HOST="${1#*=}"
      shift
      ;;
    -w|--workspace)
      [[ $# -lt 2 ]] && { echo "错误: $1 缺少目录参数" >&2; exit 1; }
      WORKSPACE="$2"
      shift 2
      ;;
    --workspace=*)
      WORKSPACE="${1#*=}"
      shift
      ;;
    -k|--api-key)
      [[ $# -lt 2 ]] && { echo "错误: $1 缺少 API Key 参数" >&2; exit 1; }
      API_KEY="$2"
      shift 2
      ;;
    --api-key=*)
      API_KEY="${1#*=}"
      shift
      ;;
    --prod)
      MODE="prod"
      shift
      ;;
    --build)
      FORCE_BUILD=1
      shift
      ;;
    --install)
      FORCE_INSTALL=1
      shift
      ;;
    *)
      echo "未知选项: $1" >&2
      echo "运行 ./start.sh --help 查看可用选项。" >&2
      exit 1
      ;;
  esac
done

# 校验端口为 1-65535 整数
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "错误: 无效端口号 '$PORT'，请输入 1 到 65535 之间的整数。" >&2
  exit 1
fi

# 检查 Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "错误: 未检测到 Node.js，请先安装 Node.js 20+。" >&2
  exit 1
fi

# 安装依赖
if [[ "$FORCE_INSTALL" -eq 1 || ! -d "node_modules" ]]; then
  echo "正在安装项目依赖..."
  npm install
fi

# 检查 API Key 提示（从命令行、环境变量或 .env 检查）
if [[ -n "$API_KEY" ]]; then
  export GEMINI_API_KEY="$API_KEY"
elif [[ -f ".env" ]]; then
  if ! grep -qE '^GEMINI_API_KEY=.+' .env; then
    echo "提示: .env 中未检测到有效的 GEMINI_API_KEY，启动后调用模型可能会报错。"
  fi
elif [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "提示: 未检测到 GEMINI_API_KEY。可复制 .env.example 为 .env 并填入密钥，或使用 -k 参数传入。"
fi

SERVER_ARGS=(--port "$PORT" --host "$HOST")
if [[ -n "$WORKSPACE" ]]; then
  SERVER_ARGS+=(--workspace "$WORKSPACE")
fi

if [[ "$MODE" == "prod" ]]; then
  if [[ "$FORCE_BUILD" -eq 1 || ! -d "dist" ]]; then
    echo "正在构建前端生产产物..."
    npm run build
  fi
  export NODE_ENV=production
  exec npx tsx server.ts "${SERVER_ARGS[@]}" --prod
else
  exec npx tsx server.ts "${SERVER_ARGS[@]}"
fi
