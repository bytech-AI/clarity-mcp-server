#!/usr/bin/env bash
# Vercel デプロイ後の動作確認スクリプト
# 使い方: ./scripts/check-deployment.sh [BASE_URL] [AUTH_TOKEN]
#   BASE_URL    例: https://your-app.vercel.app  (デフォルト: http://localhost:3000)
#   AUTH_TOKEN  MCP_SERVER_AUTH_TOKEN の値

BASE_URL="${1:-http://localhost:3000}"
AUTH_TOKEN="${2:-${MCP_SERVER_AUTH_TOKEN:-}}"
ENDPOINT="${BASE_URL}/api/mcp"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RESET='\033[0m'

pass() { echo -e "${GREEN}[PASS]${RESET} $1"; }
fail() { echo -e "${RED}[FAIL]${RESET} $1"; }
info() { echo -e "${YELLOW}[INFO]${RESET} $1"; }

if [[ -z "$AUTH_TOKEN" ]]; then
  echo "使い方: $0 <BASE_URL> <AUTH_TOKEN>"
  echo "       または環境変数 MCP_SERVER_AUTH_TOKEN を設定してください"
  exit 1
fi

echo ""
info "対象: ${ENDPOINT}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# -------------------------------------------------------------------
# 1. 認証なしで 401 が返るか
# -------------------------------------------------------------------
echo ""
info "[1/4] 認証なしリクエスト → 401 期待"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}')

if [[ "$STATUS" == "401" ]]; then
  pass "401 Unauthorized を確認"
else
  fail "期待: 401 / 実際: ${STATUS}"
fi

# -------------------------------------------------------------------
# 2. 無効トークンで 401 が返るか
# -------------------------------------------------------------------
echo ""
info "[2/4] 無効トークンリクエスト → 401 期待"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid-token-xyz" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}')

if [[ "$STATUS" == "401" ]]; then
  pass "401 Unauthorized を確認"
else
  fail "期待: 401 / 実際: ${STATUS}"
fi

# -------------------------------------------------------------------
# 3. initialize — サーバー情報の取得
# -------------------------------------------------------------------
echo ""
info "[3/4] initialize リクエスト → 200 期待"
BODY=$(curl -s -w "\n%{http_code}" \
  -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": { "name": "check-deployment", "version": "1.0" }
    }
  }')

STATUS=$(echo "$BODY" | tail -1)
RESPONSE=$(echo "$BODY" | head -n -1)

if [[ "$STATUS" == "200" ]]; then
  pass "200 OK を確認"
  echo "       $(echo "$RESPONSE" | grep -o '"serverInfo":{[^}]*}' || echo "$RESPONSE" | head -c 200)"
else
  fail "期待: 200 / 実際: ${STATUS}"
  echo "       ${RESPONSE}" | head -c 300
fi

# -------------------------------------------------------------------
# 4. tools/list — get-clarity-data ツールが存在するか
# -------------------------------------------------------------------
echo ""
info "[4/4] tools/list → get-clarity-data の存在確認"
BODY=$(curl -s -w "\n%{http_code}" \
  -X POST "${ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }')

STATUS=$(echo "$BODY" | tail -1)
RESPONSE=$(echo "$BODY" | head -n -1)

if [[ "$STATUS" == "200" ]] && echo "$RESPONSE" | grep -q '"get-clarity-data"'; then
  pass "get-clarity-data ツールを確認"
elif [[ "$STATUS" != "200" ]]; then
  fail "期待: 200 / 実際: ${STATUS}"
  echo "       ${RESPONSE}" | head -c 300
else
  fail "get-clarity-data ツールが見つかりません"
  echo "       ${RESPONSE}" | head -c 300
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
info "手動確認用コマンド（tools/call）:"
cat <<EXAMPLE
curl -s \\
  -X POST "${ENDPOINT}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer \${MCP_SERVER_AUTH_TOKEN}" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get-clarity-data",
      "arguments": { "numOfDays": 1 }
    }
  }' | jq .
EXAMPLE
echo ""
