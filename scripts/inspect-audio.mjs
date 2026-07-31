import { writeFile } from "node:fs/promises";

const port = Number(process.argv[2] || 9223);
const waitMs = Number(process.argv[3] || 12000);
const screenshotPath = process.argv[4];
const endpoint = `http://127.0.0.1:${port}/json`;

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

let pages;

for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    const response = await fetch(endpoint);
    pages = await response.json();
    if (pages.length > 0) break;
  } catch {
    // Chrome may still be starting.
  }

  await sleep(250);
}

const page = pages?.find((item) => item.type === "page");
if (!page) throw new Error(`No Chrome page found at ${endpoint}`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const consoleMessages = [];
let commandId = 0;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }

  if (message.method === "Runtime.consoleAPICalled") {
    consoleMessages.push(
      message.params.args.map((argument) => argument.value).join(" ")
    );
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

const command = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++commandId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });

await command("Runtime.enable");
await command("Page.enable");
await sleep(waitMs);

const result = await command("Runtime.evaluate", {
  expression: `JSON.stringify({
    audio: window.__PHASEFLOOR_AUDIO__ || null,
    status: document.querySelector('.audio-status')?.textContent || null,
    canvas: Boolean(document.querySelector('canvas'))
  })`,
  returnByValue: true,
});

console.log(result.result.result.value);

if (consoleMessages.length > 0) {
  console.log(JSON.stringify({ consoleMessages }));
}

if (screenshotPath) {
  const screenshot = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(screenshotPath, screenshot.result.data, "base64");
}

await command("Browser.close");
socket.close();
