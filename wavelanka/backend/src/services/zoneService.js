const zones = require('../data/zones.json');

function normalizeZoneId(id) {
  return String(id || '').trim().toLowerCase();
}

function findZone(zoneId) {
  const normalized = normalizeZoneId(zoneId);
  return zones.find(
    (zone) =>
      normalizeZoneId(zone.id) === normalized ||
      normalizeZoneId(zone.name) === normalized
  );
}

function getAllZones() {
  return zones;
}

module.exports = {
  findZone,
  getAllZones,
  normalizeZoneId,
};
