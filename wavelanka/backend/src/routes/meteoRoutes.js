const express = require('express');
const meteoService = require('../services/meteoService');
const { getAllZones } = require('../services/zoneService');

const router = express.Router();

router.get('/meteo', async (req, res) => {
  try {
    const data = await meteoService.fetchMetDeptForecast();
    res.json({ success: true, data });
  } catch (error) {
    console.error('[meteoRoutes] /meteo:', error.message);
    const status = error.response?.status || 502;
    res.status(status).json({
      error: 'Upstream data source error',
      context: 'met department forecast',
      message: error.message,
      details: error.details || error.response?.data || undefined,
    });
  }
});

router.get('/zones', (_req, res) => {
  try {
    const zones = getAllZones();
    res.json({
      success: true,
      count: zones.length,
      data: zones,
    });
  } catch (error) {
    console.error('[meteoRoutes] /zones:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

module.exports = router;
