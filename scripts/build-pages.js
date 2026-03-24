const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DATA_DIR = path.join(DIST, 'data');
const SERVER_URL = 'http://127.0.0.1:8787';
const PAGES_URL = 'https://vikrantsingh29.github.io/flightSearch/';
const START_OFFSET_DAYS = -3;
const END_OFFSET_DAYS = 14;

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildDateRange() {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = START_OFFSET_DAYS; offset <= END_OFFSET_DAYS; offset += 1) {
    const value = new Date(today);
    value.setDate(today.getDate() + offset);
    dates.push(formatDate(value));
  }

  return dates;
}

async function ensureCleanDist() {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function waitForHealth(serverProcess) {
  const startedAt = Date.now();
  const timeoutMs = 30000;

  while (Date.now() - startedAt < timeoutMs) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Local scraper exited early with code ${serverProcess.exitCode}.`);
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Wait and retry until timeout.
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Timed out waiting for the local scraper health check.');
}

async function fetchTrackerPayload(date) {
  const response = await fetch(`${SERVER_URL}/api/tracker?date=${date}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || `Tracker request failed for ${date}.`);
  }

  return payload;
}

async function writeStaticApp(generatedAt, dates) {
  const htmlPath = path.join(ROOT, 'flight-tracker-fixed.html');
  const appJsPath = path.join(ROOT, 'tracker-app.js');
  const html = await fs.readFile(htmlPath, 'utf8');
  const appJs = await fs.readFile(appJsPath, 'utf8');

  const configScript = [
    '<script>',
    "window.TRACKER_MODE = 'static-pages';",
    "window.TRACKER_DATA_BASE = './data';",
    `window.TRACKER_PAGES_URL = '${PAGES_URL}';`,
    '</script>'
  ].join('');

  const configuredHtml = html.replace(
    '<script src="tracker-app.js"></script>',
    `${configScript}<script src="tracker-app.js"></script>`
  );

  const manifest = {
    generatedAt,
    pagesUrl: PAGES_URL,
    dates
  };

  await fs.writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(DIST, 'index.html'), configuredHtml);
  await fs.writeFile(path.join(DIST, '404.html'), configuredHtml);
  await fs.writeFile(path.join(DIST, 'flight-tracker-fixed.html'), configuredHtml);
  await fs.writeFile(path.join(DIST, 'tracker-app.js'), appJs);
  await fs.writeFile(path.join(DIST, '.nojekyll'), '');
}

async function main() {
  await ensureCleanDist();

  const serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  serverProcess.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });

  try {
    await waitForHealth(serverProcess);

    const dates = buildDateRange();
    const generatedAt = new Date().toISOString();

    for (const date of dates) {
      const payload = await fetchTrackerPayload(date);
      payload.snapshotGeneratedAt = generatedAt;
      payload.pagesUrl = PAGES_URL;
      await fs.writeFile(path.join(DATA_DIR, `${date}.json`), JSON.stringify(payload, null, 2));
    }

    await writeStaticApp(generatedAt, dates);
    console.log(`Built GitHub Pages bundle in ${DIST}`);
  } finally {
    serverProcess.kill();
    if (stderr.trim()) {
      console.error(stderr.trim());
    }
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
