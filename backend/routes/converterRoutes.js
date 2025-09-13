// Converter Routes
const express = require('express');
const converterController = require('../controllers/converterController');

const router = express.Router();
router.get('/', converterController.convert);
module.exports = router;
