/**
 * ============================================================
 *  Bubbly - 本地双开联调脚本
 * ============================================================
 *  运行: npm run start:pair
 *
 *  一条命令同时启动：
 *    1. 信令服务器（src/server/index.js，默认端口 8080）
 *    2. 客户端实例 A
 *    3. 客户端实例 B（--no-single-instance 跳过单实例锁）
 *
 *  两个客户端的设置面板都填 ws://localhost:8080，
 *  各填不同昵称，连接后即可互发消息。
 *  Ctrl+C 会同时关闭全部三个进程。
 * ============================================================
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

// require('electron') 在 Node 环境下返回 electron 可执行文件路径
const electronBin = require('electron');
const rootDir = path.join(__dirname, '..');
const serverEntry = path.join(rootDir, 'src', 'server', 'index.js');

const children = [];
let clientsAlive = 0;

function start(name, command, args, isClient = false) {
  const child = spawn(command, args, { stdio: 'inherit', cwd: rootDir });
  child.on('error', (err) => {
    console.error(`[dev-pair] ${name} 启动失败:`, err.message);
  });
  child.on('exit', (code) => {
    console.log(`[dev-pair] ${name} 已退出 (code=${code})`);
    if (isClient) {
      clientsAlive--;
      // 两个客户端都关了 → 连服务器一起收尾
      if (clientsAlive === 0) shutdown();
    }
  });
  children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(0);
}

console.log('==================================================');
console.log('  💕  Bubbly 本地双开联调');
console.log('  服务器: ws://localhost:8080');
console.log('  客户端 A / B 分别填不同昵称连接即可互发');
console.log('  Ctrl+C 或关闭两个客户端窗口即全部退出');
console.log('==================================================\n');

start('信令服务器', process.execPath, [serverEntry]);
clientsAlive++;
start('客户端 A', electronBin, ['.'], true);
clientsAlive++;
start('客户端 B', electronBin, ['.', '--no-single-instance'], true);

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
