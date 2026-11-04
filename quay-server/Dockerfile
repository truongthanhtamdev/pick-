# Build từ thư mục gốc repo: docker build -f quay-server/Dockerfile .
FROM node:22-alpine
WORKDIR /app
COPY quay-server/server.mjs ./quay-server/server.mjs
COPY ban-hang/ ./ban-hang/
ENV NODE_ENV=production DATA_DIR=/data STATIC_DIR=/app/ban-hang PORT=8080
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/hello || exit 1
CMD ["node", "--experimental-sqlite", "--no-warnings", "quay-server/server.mjs"]
