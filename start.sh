# #!/usr/bin/env sh
# set -eu

# # Render ka public port (Kong is par sunega), local dev me default 8000
# : "${PORT:=8000}"

# # ---------- Start Node locally on 4000 ----------
# # First boot pe deps install karo agar image me bake na kiye hon
# if [ -f package.json ] && [ ! -d node_modules ]; then
#   npm ci --omit=dev || npm install --omit=dev
# fi

# # Production env me Node ko 4000 par chalao (background)
# NODE_ENV=production PORT=4000 node server.js &

# # ---------- Start Kong on Render's $PORT ----------
# export KONG_DATABASE=off
# export KONG_DECLARATIVE_CONFIG=/etc/kong/kong.yml
# export KONG_PROXY_LISTEN="0.0.0.0:${PORT}"
# export KONG_ADMIN_LISTEN=off
# export KONG_NGINX_WORKER_PROCESSES=1
# export KONG_LOG_LEVEL=notice

# exec /docker-entrypoint.sh kong docker-start
