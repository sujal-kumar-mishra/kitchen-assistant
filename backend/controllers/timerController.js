// Timer Controller
module.exports = (timerManager) => ({
  listTimers: (req, res) => {
    res.json({ timers: timerManager.listTimers() });
  },
  startTimer: (req, res) => {
    const { seconds } = req.body;
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return res.status(400).json({ error: 'seconds must be positive' });
    }
    const id = timerManager.startTimer(seconds);
    res.json({ id, seconds });
  },
  stopTimer: (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    timerManager.stopTimer(id);
    res.json({ success: true });
  }
});
