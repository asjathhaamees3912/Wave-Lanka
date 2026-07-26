const express = require('express');
const marineService = require('../services/marineService');
const safetyService = require('../services/safetyService');
const { findZone } = require('../services/zoneService');

const router = express.Router();

function zoneNotFound(res, zoneId) {
  return res.status(404).json({
    error: 'Zone not found',
    message: `No zone matching "${zoneId}". Valid zone ids: bay-of-bengal, indian-ocean, gulf-of-mannar, palk-strait, lakshadweep-sea (aliases: east, south, west, north, southwest)`,
  });
}

function handleUpstreamError(res, error, context) {
  const status = error.response?.status || 502;
  return res.status(status).json({
    error: 'Upstream data source error',
    context,
    message: error.message,
    details: error.response?.data || error.details || undefined,
  });
}

router.get('/marine/:zone', async (req, res) => {
  try {
    const zone = findZone(req.params.zone);
    if (!zone) return zoneNotFound(res, req.params.zone);

    const data = await marineService.fetchMarineForecast(zone);
    res.json({ success: true, data });
  } catch (error) {
    console.error(`[marineRoutes] /marine/${req.params.zone}:`, error.message);
    return handleUpstreamError(res, error, 'marine forecast');
  }
});

router.get('/safety/all', async (req, res) => {
  try {
    const { getAllZones } = require('../services/zoneService');
    const zones = getAllZones();

    const results = await Promise.all(
      zones.map(async (zone) => {
        try {
          const assessment = await safetyService.assessZoneSafety(zone);
          return { success: true, ...assessment };
        } catch (error) {
          return {
            success: false,
            zone: { id: zone.id, name: zone.name },
            error: error.message,
          };
        }
      })
    );

    res.json({
      success: true,
      assessed_at: new Date().toISOString(),
      zones: results,
    });
  } catch (error) {
    console.error('[marineRoutes] /safety/all:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

router.get('/safety/:zone', async (req, res) => {
  try {
    const zone = findZone(req.params.zone);
    if (!zone) return zoneNotFound(res, req.params.zone);

    const assessment = await safetyService.assessZoneSafety(zone);
    // Always return 200 with a valid response, never throw
    res.json({ success: true, data: assessment });
  } catch (error) {
    console.error(`[marineRoutes] /safety/${req.params.zone}:`, error.message);
    // Return fallback response with 200 status instead of 500
    const zone = findZone(req.params.zone);
    res.status(200).json({
      success: false,
      data: {
        zone: zone?.name || req.params.zone,
        level: 'UNKNOWN',
        reason: 'Live marine data temporarily unavailable. Please refresh in a few minutes.',
        current_conditions: {
          wave_height: null,
          wave_height_unit: 'm',
          wind_speed_10m: null,
          wind_speed_10m_unit: 'km/h',
          wind_gusts_10m: null,
          weather_code: null,
          weather_label: null,
        },
        best_safe_window: null,
        data_available: false,
        partial_data: false,
        assessed_at: new Date().toISOString(),
        error: error.message,
      },
    });
  }
});

router.get('/marine/:zone/lag', async (req, res) => {
  try {
    const zone = findZone(req.params.zone);
    if (!zone) return zoneNotFound(res, req.params.zone);

    const lagData = await marineService.getLagData(zone.lat, zone.lon);
    res.json({ success: true, data: lagData });
  } catch (error) {
    console.error(`[marineRoutes] /marine/${req.params.zone}/lag:`, error.message);
    return handleUpstreamError(res, error, 'marine lag data');
  }
});

module.exports = router;
