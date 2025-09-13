// YouTube Routes
const express = require('express');
const youtubeController = require('../controllers/youtubeController');

const router = express.Router();
router.get('/search', youtubeController.search);
module.exports = router;
