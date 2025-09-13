// Chat Controller - Simple text-based conversation
const axios = require('axios');

const chatController = {
  // Text-based conversation endpoint
  textConverse: async (req, res) => {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    try {
      // Call ElevenLabs API directly
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/convai/agents/${process.env.AGENT_ID}/simulate-conversation`,
        {
          messages: [{ role: "user", content: message }],
          simulation_specification: {
            initial_user_message: message,
            mode: "text",
            language: "en-US",
          },
        },
        {
          headers: {
            "xi-api-key": process.env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
        }
      );

      const reply =
        response.data?.choices?.[0]?.message?.content ||
        response.data?.output ||
        "No response";

      // Store in global history
      if (!global.conversationHistory) global.conversationHistory = [];
      global.conversationHistory.push({ sender: "You", text: message });
      global.conversationHistory.push({ sender: "Agent", text: reply });

      res.json({ reply });
    } catch (error) {
      console.error("Error conversing:", error);
      res.status(500).json({ error: "Failed to get response" });
    }
  },

  // Get conversation history
  getHistory: (req, res) => {
    res.json({ history: global.conversationHistory || [] });
  },

  // Conversation history endpoint (exact match to your provided code)
  getConversationHistory: async (req, res) => {
    // For demo, use in-memory array. In production, use DB or session.
    if (!global.conversationHistory) global.conversationHistory = [];
    res.json({ history: global.conversationHistory });
  },

  // Get signed URL for ElevenLabs conversation
  getSignedUrl: async (req, res) => {
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${process.env.AGENT_ID}`,
        {
          headers: {
            "xi-api-key": process.env.ELEVENLABS_API_KEY,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to get signed URL");
      }

      const data = await response.json();
      res.json({ signedUrl: data.signed_url });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ error: "Failed to generate signed URL" });
    }
  }
};

module.exports = chatController;
