// Converter Controller
const { convertUnits } = require('../tools/converter');

module.exports = {
  convert: (req, res) => {
    try {
      const value = Number(req.query.value);
      const from = String(req.query.from || '');
      const to = String(req.query.to || '');
      if (!Number.isFinite(value) || !from || !to) return res.status(400).json({ error: 'Invalid params' });
      const result = convertUnits(value, from, to);
      if (result == null) return res.status(400).json({ error: 'Unsupported conversion' });
      res.json({ result });
    } catch (err) {
      res.status(500).json({ error: 'Conversion failed', details: err?.message || String(err) });
    }
  }
};
