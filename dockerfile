# # Base: Kong image (Debian) + add Node.js
# FROM kong:3.6

# USER root

# # Install Node.js LTS
# RUN apt-get update && \
#     apt-get install -y curl ca-certificates gnupg && \
#     mkdir -p /etc/apt/keyrings && \
#     curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
#     echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
#     apt-get update && apt-get install -y nodejs && \
#     apt-get clean && rm -rf /var/lib/apt/lists/*

# # Kong declarative config
# COPY kong.yml /etc/kong/kong.yml

# # App code
# WORKDIR /app
# COPY package*.json ./
# # (Optional) Bake deps at build time for faster boots; ok if it fails in dev
# RUN npm ci --omit=dev || true
# COPY . .

# # Startup script
# COPY start.sh /usr/local/bin/start.sh
# RUN chmod 755 /usr/local/bin/start.sh && chown -R kong:0 /app

# # Drop back to kong user
# USER kong

# # Run both: Node(4000) + Kong($PORT)
# ENTRYPOINT ["/usr/local/bin/start.sh"]
