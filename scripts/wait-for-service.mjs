#!/usr/bin/env node

import net from 'node:net';

const [host, rawPort, rawTimeout = '60000'] = process.argv.slice(2);
const port = Number(rawPort);
const timeoutMs = Number(rawTimeout);

if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Usage: wait-for-service.mjs <host> <port> [timeout-ms]');
  process.exit(2);
}

const deadline = Date.now() + timeoutMs;

function attempt() {
  const socket = net.createConnection({ host, port });
  socket.setTimeout(1000);
  socket.once('connect', () => {
    socket.destroy();
    console.log(`${host}:${port} is available.`);
  });
  const retry = () => {
    socket.destroy();
    if (Date.now() >= deadline) {
      console.error(`Timed out waiting for ${host}:${port}.`);
      process.exit(1);
    }
    setTimeout(attempt, 500);
  };
  socket.once('error', retry);
  socket.once('timeout', retry);
}

attempt();
