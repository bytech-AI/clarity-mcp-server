#!/usr/bin/env node

/**
 * JWT Token Generator for Clarity MCP Server
 *
 * 使い方:
 *   JWT_SECRET="..." JWT_SALT="..." node scripts/generate-token.js
 *
 * 初回の鍵生成:
 *   openssl rand -base64 32  # JWT_SECRET
 *   openssl rand -base64 16  # JWT_SALT
 *
 * 有効期限: 2週間
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_LOCAL = path.resolve(__dirname, '../.env');

// ============================================
// 設定
// ============================================

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_SALT = process.env.JWT_SALT || '';

if (!JWT_SECRET || !JWT_SALT) {
  console.error('\n❌ エラー: JWT_SECRET と JWT_SALT を環境変数で設定してください\n');
  console.log('秘密鍵の生成コマンド:');
  console.log('  openssl rand -base64 32  # JWT_SECRET');
  console.log('  openssl rand -base64 16  # JWT_SALT\n');
  console.log('実行例:');
  console.log('  JWT_SECRET="..." JWT_SALT="..." node scripts/generate-token.js\n');
  process.exit(1);
}

// ============================================
// JWT 生成
// ============================================

const TWO_WEEKS = 60 * 60 * 24 * 14;
const now = Math.floor(Date.now() / 1000);

const header = { alg: 'HS256', typ: 'JWT' };
const payload = {
  sub: 'mcp-client',
  iat: now,
  exp: now + TWO_WEEKS,
  salt: JWT_SALT,
  jti: crypto.randomUUID(),
};

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

const headerB64 = base64url(header);
const payloadB64 = base64url(payload);
const message = `${headerB64}.${payloadB64}`;

const signature = crypto
  .createHmac('sha256', JWT_SECRET)
  .update(message)
  .digest('base64')
  .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const token = `${message}.${signature}`;

// ============================================
// .env 自動更新
// ============================================

if (fs.existsSync(ENV_LOCAL)) {
  let content = fs.readFileSync(ENV_LOCAL, 'utf-8');
  if (/^MCP_SERVER_AUTH_TOKEN=.*/m.test(content)) {
    content = content.replace(/^MCP_SERVER_AUTH_TOKEN=.*/m, `MCP_SERVER_AUTH_TOKEN=${token}`);
  } else {
    content += `\nMCP_SERVER_AUTH_TOKEN=${token}\n`;
  }
  fs.writeFileSync(ENV_LOCAL, content);
  console.log('\n✅ .env を更新しました');
}

// ============================================
// 出力
// ============================================

const issuedDate = new Date(payload.iat * 1000);
const expiryDate = new Date(payload.exp * 1000);
const toJST = (d) => d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

console.log('\n' + '='.repeat(70));
console.log('🔑 JWT Token Generated Successfully');
console.log('='.repeat(70));

console.log('\n📋 Token (以下をコピーしてください):');
console.log('-'.repeat(70));
console.log(token);
console.log('-'.repeat(70));

console.log('\n📅 Token Details:');
console.log(`  • 発行日時: ${toJST(issuedDate)} (JST)`);
console.log(`  • 有効期限: ${toJST(expiryDate)} (JST)`);
console.log(`  • 有効期間: 2週間`);
console.log(`  • JWT ID:   ${payload.jti}`);

console.log('\n📝 Claude Desktop / mcp-remote 設定例:');
console.log('-'.repeat(70));
console.log(`{
  "mcpServers": {
    "clarity": {
      "command": "mcp-remote",
      "args": [
        "https://your-app.vercel.app/api/mcp",
        "--header",
        "Authorization: Bearer ${token}"
      ]
    }
  }
}`);
console.log('-'.repeat(70));

console.log('\n⚠️  注意事項:');
console.log('  • このトークンは2週間後に失効します');
console.log('  • 失効前に再度このスクリプトを実行して新しいトークンを生成してください');
console.log('  • JWT_SECRET / JWT_SALT は Vercel 環境変数に設定し、外部に漏らさないでください');
console.log('\n' + '='.repeat(70) + '\n');

if (process.argv.includes('--token-only')) {
  process.stdout.write(token + '\n');
}
