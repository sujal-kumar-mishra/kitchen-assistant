// Chat Routes - Simple text-based conversation
const express = require('express');
const chatController = require('../controllers/chatController');

const router = express.Router();

router.post('/converse', chatController.textConverse);
router.get('/history', chatController.getHistory);
router.get('/get-signed-url', chatController.getSignedUrl);
router.get('/conversation-history', chatController.getConversationHistory);

module.exports = router;
