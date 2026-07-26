const zones = require('../data/zones.json');

const ZONE_ALIASES = {
  east: 'bay-of-bengal',
  'bay-of-bengal': 'bay-of-bengal',
  'bay_of_bengal': 'bay-of-bengal',
  south: 'indian-ocean',
  'indian-ocean': 'indian-ocean',
  'indian_ocean': 'indian-ocean',
  west: 'gulf-of-mannar',
  'gulf-of-mannar': 'gulf-of-mannar',
  'gulf_of_mannar': 'gulf-of-mannar',
  north: 'palk-strait',
  'palk-strait': 'palk-strait',
  'palk_strait': 'palk-strait',
  palk: 'palk-strait',
  southwest: 'lakshadweep-sea',
  'lakshadweep-sea': 'lakshadweep-sea',
  'lakshadweep_sea': 'lakshadweep-sea',
};

function normalizeZoneId(id) {
  return String(id || '').trim().toLowerCase().replace(/_/g, '-');
}

function resolveZoneId(id) {
  const normalized = normalizeZoneId(id);
  return ZONE_ALIASES[normalized] || ZONE_ALIASES[normalized.replace(/-/g, '_')] || normalized;
}

function findZone(zoneId) {
  const resolved = resolveZoneId(zoneId);
  return zones.find(
    (zone) =>
      normalizeZoneId(zone.id) === resolved ||
      normalizeZoneId(zone.name) === normalizeZoneId(zoneId)
  );
}

function getAllZones() {
  return zones;
}

module.exports = {
  findZone,
  getAllZones,
  normalizeZoneId,
  resolveZoneId,
};
