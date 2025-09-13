// YouTube Controller
const { youtubeSearch } = require('../tools/youtube');

module.exports = {
  search: async (req, res) => {
    try {
      const q = String(req.query.q || '');
      if (!q) return res.status(400).json({ error: 'Missing query' });
      const items = await youtubeSearch(q);
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: 'YouTube search failed', details: err?.message || String(err) });
    }
  }
};
