// Timer Routes
const express = require('express');
module.exports = (timerManager) => {
  const router = express.Router();
  const timerController = require('../controllers/timerController')(timerManager);
  router.get('/', timerController.listTimers);
  router.post('/start', timerController.startTimer);
  router.post('/stop', timerController.stopTimer);
  return router;
};
