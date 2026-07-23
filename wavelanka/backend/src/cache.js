const NodeCache = require('node-cache');

const ttl = parseInt(process.env.CACHE_TTL_SECONDS || '600', 10);

const cache = new NodeCache({
  stdTTL: ttl,
  checkperiod: 120,
  useClones: false,
});

module.exports = cache;
