// Reasonable cooking conversions; extend as needed
function convertUnits(value, from, to) {
  const TABLE = {
    cup: { tablespoon: 16, teaspoon: 48, ml: 240, liter: 0.24, ounce: 8 },
    tablespoon: { cup: 1 / 16, teaspoon: 3, ml: 15, ounce: 0.5 },
    teaspoon: { tablespoon: 1 / 3, ml: 5 },
    ml: { cup: 1 / 240, tablespoon: 1 / 15, teaspoon: 1 / 5, liter: 1 / 1000 },
    liter: { cup: 4.22675, ml: 1000 },
    ounce: { gram: 28.3495, cup: 1 / 8 }
  };
  const f = String(from || '').toLowerCase();
  const t = String(to || '').toLowerCase();
  if (!TABLE[f] || TABLE[f][t] == null) return null;
  return Number((value * TABLE[f][t]).toFixed(6));
}

module.exports = { convertUnits };
