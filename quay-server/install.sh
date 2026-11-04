#!/usr/bin/env bash
# Cài Quầy lên VPS Ubuntu/Debian. Chạy: sudo bash install.sh
set -euo pipefail
cd "$(dirname "$0")"
if [ "$(id -u)" -ne 0 ]; then echo "Hãy chạy bằng sudo: sudo bash install.sh"; exit 1; fi

if ! command -v docker >/dev/null 2>&1; then
  echo "→ Đang cài Docker..."
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo
  read -rp "Tên miền cho app (vd: book.lumi-nails.com.au), bỏ trống nếu chưa có: " DOMAIN
  while true; do
    read -rsp "Đặt mật khẩu đăng nhập cho tiệm (ít nhất 8 ký tự): " PW; echo
    [ ${#PW} -ge 8 ] && break; echo "Mật khẩu quá ngắn."
  done
  IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
  if [ -n "$DOMAIN" ]; then SITE="$DOMAIN"; URL="https://$DOMAIN"; else SITE=":80"; URL="http://$IP"; fi
  PW_ESC=$(printf '%s' "$PW" | sed 's/[&/\]/\\&/g')
  sed -i "s|^SHOP_PASSWORD=.*|SHOP_PASSWORD=$PW_ESC|; s|^PUBLIC_URL=.*|PUBLIC_URL=$URL|; s|^SITE_ADDRESS=.*|SITE_ADDRESS=$SITE|" .env
  chmod 600 .env
fi
mkdir -p data && chown -R 1000:1000 data

# Mở cổng web nếu đang bật tường lửa ufw
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q active; then ufw allow 80/tcp; ufw allow 443/tcp; fi

docker compose up -d --build
sleep 3
URL=$(grep ^PUBLIC_URL= .env | cut -d= -f2-)
echo
echo "✅ Quầy đã chạy: $URL"
echo "   Trang khách đặt lịch: $URL/#dat-lich"
echo "   Sửa cấu hình SMS / Stripe: nano $(pwd)/.env  rồi chạy: docker compose up -d"
