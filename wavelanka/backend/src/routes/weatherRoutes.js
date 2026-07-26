const express = require('express');
const weatherService = require('../services/weatherService');
const { findZone } = require('../services/zoneService');

const router = express.Router();

router.get('/weather/:zone', async (req, res) => {
  try {
    const zone = findZone(req.params.zone);
    if (!zone) {
      return res.status(404).json({
        error: 'Zone not found',
        message: `No zone matching "${req.params.zone}". Valid zone ids: bay-of-bengal, indian-ocean, gulf-of-mannar, palk-strait, lakshadweep-sea (aliases: east, south, west, north, southwest)`,
      });
    }

    const data = await weatherService.fetchWeather(zone);
    res.json({ success: true, data });
  } catch (error) {
    console.error(`[weatherRoutes] /weather/${req.params.zone}:`, error.message);
    const status = error.response?.status || 502;
    res.status(status).json({
      error: 'Upstream data source error',
      context: 'weather forecast',
      message: error.message,
      details: error.response?.data || undefined,
    });
  }
});

module.exports = router;
