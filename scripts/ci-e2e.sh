#!/usr/bin/env bash
# รัน E2E แบบเดียวกับ CI: migrate + seed → build production → เริ่มเซิร์ฟเวอร์ standalone → Playwright
# ใช้ได้ทั้งใน GitHub Actions และในเครื่อง (ต้องมี PostgreSQL ที่ DATABASE_URL ชี้ไป — เช่น `docker compose up -d db`)
#
# ตัวแปรที่ต้องมี : DATABASE_URL, AUTH_SECRET
# อีเมล (E2E ที่ตรวจอีเมลต้องใช้): SMTP_HOST, SMTP_PORT, MAILPIT_URL — ชี้ไป Mailpit (docker compose up -d mailpit)
# ตัวแปรเสริม     : PORT (3000) · SEED_PASSWORD (servicehub-demo) · E2E_BROWSER (chromium) · SKIP_BUILD=1
#
# หมายเหตุ: การรันนี้ล้างและ seed ฐานข้อมูลที่ DATABASE_URL ชี้ไป — อย่าชี้ไปฐานข้อมูลที่มีข้อมูลจริง
set -euo pipefail

: "${DATABASE_URL:?ต้องกำหนด DATABASE_URL}"
: "${AUTH_SECRET:?ต้องกำหนด AUTH_SECRET}"

PORT="${PORT:-3000}"
export SEED_PASSWORD="${SEED_PASSWORD:-servicehub-demo}"
export E2E_BROWSER="${E2E_BROWSER:-chromium}"
# ใช้ localhost (ไม่ใช่ 127.0.0.1): Next production แปลงโฮสต์ loopback เป็น localhost ในลิงก์ redirect ทำให้ cookie หลุดโดเมน
export E2E_BASE_URL="http://localhost:${PORT}"
export E2E_RESET_CMD="${E2E_RESET_CMD:-npx prisma db seed}"
# ลิงก์ในอีเมลสร้างจาก APP_URL (ไม่ใช่ Host header) — ต้องชี้มาที่เซิร์ฟเวอร์ทดสอบ
export APP_URL="${APP_URL:-${E2E_BASE_URL}}"
export NEXT_TELEMETRY_DISABLED=1
export AUTH_TRUST_HOST=true
LOG_DIR="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
SERVER_LOG="${LOG_DIR}/servicehub-server.log"

echo "::group::migrate + seed"
npx prisma migrate deploy
npx prisma db seed
echo "::endgroup::"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "::group::build"
  npm run build
  echo "::endgroup::"
fi

# output: 'standalone' → ต้องคัดลอกไฟล์ static เข้าไปเอง แล้วรันด้วย node โดยตรง (เหมือน Dockerfile)
rm -rf .next/standalone/.next/static
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static

(
  cd .next/standalone
  # exec: ให้ PID ที่เก็บไว้เป็นตัว node เอง (ไม่งั้น kill ฆ่าได้แค่ subshell แล้ว node ค้าง)
  NODE_ENV=production HOSTNAME=0.0.0.0 PORT="${PORT}" exec node server.js > "${SERVER_LOG}" 2>&1
) &
SERVER_PID=$!
cleanup() { kill "${SERVER_PID}" 2>/dev/null || true; }
trap cleanup EXIT

echo "รอเซิร์ฟเวอร์ที่ ${E2E_BASE_URL} ..."
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null "${E2E_BASE_URL}/login"; then break; fi
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then echo "เซิร์ฟเวอร์หยุดทำงานก่อนพร้อม:"; cat "${SERVER_LOG}"; exit 1; fi
  sleep 1
  if [ "$i" = 60 ]; then echo "เซิร์ฟเวอร์ไม่ตอบสนองใน 60 วินาที:"; cat "${SERVER_LOG}"; exit 1; fi
done

STATUS=0
npx playwright test || STATUS=$?
echo "--- server log (ท้ายไฟล์) ---"
tail -n 20 "${SERVER_LOG}" || true
exit "${STATUS}"
