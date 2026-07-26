require('dotenv').config();

const express = require('express');
const cors = require('cors');

const marineRoutes = require('./routes/marineRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const meteoRoutes = require('./routes/meteoRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

const cleanOrigin = (url) => {
  if (!url) return null;
  return url.replace(/['"]/g, "").trim().replace(/\/$/, "");
};

const allowedOrigins = [
  cleanOrigin(process.env.ALLOWED_ORIGIN),
  cleanOrigin(process.env.FRONTEND_URL),
  ...(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => cleanOrigin(o))
    .filter(Boolean),
  'http://localhost:3000',
  'https://wavelanka.up.railway.app',
].filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const cleaned = origin.replace(/\/$/, '');
  if (allowedOrigins.includes(cleaned) || allowedOrigins.includes('*')) return true;
  // Allow Railway-hosted frontends without requiring perfect env wiring
  try {
    const host = new URL(cleaned).hostname;
    if (host === 'wavelanka.up.railway.app' || host.endsWith('.up.railway.app')) return true;
  } catch {
    return false;
  }
  return false;
}

app.use(cors({
  origin: function(origin, callback) {
    console.log(`[CORS] Request from origin: "${origin}". Allowed:`, allowedOrigins);
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: "${origin}"`);
      // Do not pass an Error — that becomes HTTP 500 and breaks browser clients.
      callback(null, false);
    }
  }
}));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    service: 'Wave Lanka API',
    phase: 2,
    status: 'ok',
    message: 'Marine fishing safety API for Sri Lanka coastal zones.',
    endpoints: {
      health: 'GET /health',
      zones: 'GET /api/zones',
      marine: 'GET /api/marine/:zone',
      weather: 'GET /api/weather/:zone',
      safety: 'GET /api/safety/:zone',
      safetyAll: 'GET /api/safety/all',
      meteo: 'GET /api/meteo',
    },
    zones: ['bay-of-bengal', 'indian-ocean', 'gulf-of-mannar', 'palk-strait', 'lakshadweep-sea'],
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Wave Lanka API',
    phase: 2,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', marineRoutes);
app.use('/api', weatherRoutes);
app.use('/api', meteoRoutes);

app.use((_req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'Endpoint does not exist. See /health for service status.',
  });
});

app.use((err, _req, res, _next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

const server = app.listen(PORT, () => {
  console.log(`Wave Lanka API running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  GET /');
  console.log('  GET /health');
  console.log('  GET /api/zones');
  console.log('  GET /api/marine/:zone');
  console.log('  GET /api/weather/:zone');
  console.log('  GET /api/safety/:zone');
  console.log('  GET /api/safety/all');
  console.log('  GET /api/meteo');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use.`);
    console.error('Another Wave Lanka instance is probably still running.');
    console.error('\nTo fix on Windows PowerShell:');
    console.error(`  Get-NetTCPConnection -LocalPort ${PORT} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`);
    console.error('\nOr use a different port:');
    console.error(`  $env:PORT=5001; npm start`);
    process.exit(1);
  }
  throw err;
});

module.exports = app;
