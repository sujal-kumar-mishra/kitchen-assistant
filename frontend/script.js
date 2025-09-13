// Kitchen Smart Assistant - Complete Frontend Implementation

import { Conversation } from '@elevenlabs/client';

class KitchenAssistant {
    constructor() {
        this.socket = null;
        this.socketIO = null;
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.currentVideo = null;
        this.activeTimers = new Map();
        
        this.init();
    }
    
    init() {
        this.initializeSocketIO();
        this.initializeSpeechRecognition();
        this.bindEventListeners();
        this.updateConnectionStatus('Ready');
        this.fetchConversationHistory();
    }

    
    // Socket.IO for real-time features (timers)
    initializeSocketIO() {
        try {
            this.socketIO = io('http://localhost:3000');
            
            this.socketIO.on('connect', () => {
                console.log('Socket.IO connected');
                this.updateConnectionStatus('Connected', true);
            });
            
            this.socketIO.on('disconnect', () => {
                console.log('Socket.IO disconnected');
                this.updateConnectionStatus('Disconnected', false);
            });
            
            this.socketIO.on('timer:started', (data) => {
                this.handleTimerStarted(data);
            });
            
            this.socketIO.on('timer:update', (data) => {
                this.handleTimerUpdate(data);
            });
            
            this.socketIO.on('timer:done', (data) => {
                this.handleTimerDone(data);
            });
            
            this.socketIO.on('timer:stopped', (data) => {
                this.handleTimerStopped(data);
            });
            
            this.socketIO.on('timer:bootstrap', (data) => {
                console.log('Existing timers:', data.timers);
                if (data.timers && data.timers.length > 0) {
                    data.timers.forEach(timer => {
                        this.activeTimers.set(timer.id, timer);
                        this.updateTimerDisplay(timer.secondsLeft);
                    });
                }
            });
        } catch (error) {
            console.error('Socket.IO initialization error:', error);
            this.updateConnectionStatus('Socket Error', false);
        }
    }
    
    // Speech Recognition
    initializeSpeechRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';
            
            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                this.handleVoiceCommand(transcript);
            };
            
            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                this.updateVoiceStatus('Voice Error');
            };
            
            this.recognition.onend = () => {
                document.getElementById('voiceBtn').classList.remove('listening');
                this.updateVoiceStatus('Voice Ready');
            };
        } else {
            this.updateVoiceStatus('Voice Not Supported');
        }
    }
    
    // Event Listeners
    bindEventListeners() {
        // Chat functionality
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('userInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        // Voice input
        document.getElementById('voiceBtn').addEventListener('click', () => this.toggleVoiceInput());
        
        // Timer functionality
        document.getElementById('startTimer').addEventListener('click', () => this.startTimer());
        document.getElementById('stopTimer').addEventListener('click', () => this.stopTimer());
        
        // Unit converter
        document.getElementById('convertBtn').addEventListener('click', () => this.convertUnits());
        
        // YouTube functionality
        document.getElementById('searchYoutube').addEventListener('click', () => this.searchYoutube());
        document.getElementById('youtubeQuery').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchYoutube();
        });
        
        // YouTube controls
        document.getElementById('playPause').addEventListener('click', () => this.togglePlayPause());
        document.getElementById('volumeUp').addEventListener('click', () => this.adjustVolume(10));
        document.getElementById('volumeDown').addEventListener('click', () => this.adjustVolume(-10));
    }
    
    // Chat functionality
    async sendMessage() {
        const input = document.getElementById('userInput');
        const message = input.value.trim();
        
        if (!message) return;
        
        this.addMessage('You', message);
        input.value = '';
        
        try {
            const response = await fetch('http://localhost:3000/api/converse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            
            const data = await response.json();
            if (data.reply) {
                this.addMessage('Agent', data.reply);
                this.speak(data.reply);
            } else {
                this.addMessage('Agent', 'No response received.');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.addMessage('System', 'Error: Unable to send message. Please check connection.');
        }
    }
    
    async fetchConversationHistory() {
        try {
            const response = await fetch('http://localhost:3000/api/conversation-history');
            const data = await response.json();
            
            if (data.history && Array.isArray(data.history)) {
                const messagesDiv = document.getElementById('messages');
                messagesDiv.innerHTML = '';
                
                data.history.forEach(msg => {
                    this.addMessage(msg.sender, msg.text, false);
                });
            }
        } catch (error) {
            console.error('Error fetching conversation history:', error);
        }
    }
    
    addMessage(sender, message, scroll = true) {
        const messagesDiv = document.getElementById('messages');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${sender.toLowerCase()}`;
        
        const senderClass = sender === 'You' ? 'user' : sender === 'Agent' ? 'agent' : 'system';
        messageElement.className = `message ${senderClass}`;
        messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
        
        messagesDiv.appendChild(messageElement);
        
        if (scroll) {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    }
    
    // Voice functionality
    toggleVoiceInput() {
        if (!this.recognition) {
            alert('Speech recognition not supported in this browser. Please use Chrome or Edge.');
            return;
        }
        
        const btn = document.getElementById('voiceBtn');
        if (btn.classList.contains('listening')) {
            this.recognition.stop();
        } else {
            btn.classList.add('listening');
            this.updateVoiceStatus('Listening...');
            this.recognition.start();
        }
    }
    
    handleVoiceCommand(transcript) {
        console.log('Voice command:', transcript);
        document.getElementById('userInput').value = transcript;
        
        // Check for direct commands
        const command = transcript.toLowerCase();
        
        if (command.includes('start timer') || command.includes('set timer')) {
            this.handleVoiceTimer(transcript);
        } else if (command.includes('search') || command.includes('find video') || command.includes('youtube')) {
            this.handleVoiceSearch(transcript);
        } else if (command.includes('convert') || command.includes('how much is') || command.includes('how many')) {
            this.handleVoiceConversion(transcript);
        } else {
            // Send as regular message
            this.sendMessage();
        }
    }
    
    handleVoiceTimer(transcript) {
        const minutesMatch = transcript.match(/(\d+)\s*minute/i);
        const secondsMatch = transcript.match(/(\d+)\s*second/i);
        
        if (minutesMatch) {
            document.getElementById('timerMinutes').value = minutesMatch[1];
        }
        if (secondsMatch) {
            document.getElementById('timerSeconds').value = secondsMatch[1];
        }
        
        if (minutesMatch || secondsMatch) {
            this.startTimer();
            this.speak(`Timer set for ${transcript.match(/\d+\s*(?:minute|second)/gi).join(' and ')}`);
        }
    }
    
    handleVoiceSearch(transcript) {
        const query = transcript.replace(/(search|find video|youtube|for)/gi, '').trim();
        if (query) {
            document.getElementById('youtubeQuery').value = query;
            this.searchYoutube();
            this.speak(`Searching for ${query}`);
        }
    }
    
    handleVoiceConversion(transcript) {
        // Enhanced pattern matching for conversions
        const patterns = [
            /(\d+(?:\.\d+)?)\s*(\w+)\s*(?:to|in)\s*(\w+)/i,
            /how\s+much\s+is\s+(\d+(?:\.\d+)?)\s*(\w+)\s*in\s*(\w+)/i
        ];
        
        for (const pattern of patterns) {
            const match = transcript.match(pattern);
            if (match) {
                document.getElementById('convertValue').value = match[1];
                document.getElementById('fromUnit').value = match[2].toLowerCase();
                document.getElementById('toUnit').value = match[3].toLowerCase();
                this.convertUnits();
                break;
            }
        }
    }
    
    speak(text) {
        if (this.synthesis && text) {
            this.synthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.9;
            utterance.pitch = 1;
            utterance.volume = 0.8;
            this.synthesis.speak(utterance);
        }
    }
    
    // Timer functionality
    async startTimer() {
        const minutes = parseInt(document.getElementById('timerMinutes').value) || 0;
        const seconds = parseInt(document.getElementById('timerSeconds').value) || 0;
        const totalSeconds = minutes * 60 + seconds;
        
        if (totalSeconds <= 0) {
            alert('Please enter a valid time');
            return;
        }
        
        try {
            const response = await fetch('http://localhost:3000/api/timer/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seconds: totalSeconds })
            });
            
            const data = await response.json();
            console.log('Timer started:', data);
        } catch (error) {
            console.error('Error starting timer:', error);
        }
    }
    
    async stopTimer() {
        const timerId = Array.from(this.activeTimers.keys())[0];
        if (!timerId) return;
        
        try {
            const response = await fetch('http://localhost:3000/api/timer/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: timerId })
            });
            
            console.log('Timer stopped');
        } catch (error) {
            console.error('Error stopping timer:', error);
        }
    }
    
    handleTimerStarted(data) {
        this.activeTimers.set(data.id, data);
        document.getElementById('stopTimer').disabled = false;
        this.updateTimerDisplay(data.secondsLeft || data.seconds);
    }
    
    handleTimerUpdate(data) {
        this.updateTimerDisplay(data.secondsLeft);
    }
    
    handleTimerDone(data) {
        this.activeTimers.delete(data.id);
        document.getElementById('stopTimer').disabled = this.activeTimers.size === 0;
        this.updateTimerDisplay(0);
        this.speak('Timer finished!');
        this.showNotification('Timer Complete!', 'Your kitchen timer has finished.');
    }
    
    handleTimerStopped(data) {
        this.activeTimers.delete(data.id);
        document.getElementById('stopTimer').disabled = this.activeTimers.size === 0;
        if (this.activeTimers.size === 0) {
            this.updateTimerDisplay(0);
        }
    }
    
    updateTimerDisplay(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        const display = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        document.getElementById('timerDisplay').textContent = display;
    }
    
    // Unit conversion
    async convertUnits() {
        const value = parseFloat(document.getElementById('convertValue').value);
        const fromUnit = document.getElementById('fromUnit').value;
        const toUnit = document.getElementById('toUnit').value;
        
        if (!value || !fromUnit || !toUnit) {
            alert('Please fill in all conversion fields');
            return;
        }
        
        try {
            const response = await fetch(`http://localhost:3000/api/convert?value=${value}&from=${fromUnit}&to=${toUnit}`);
            const data = await response.json();
            
            if (data.result !== undefined) {
                const resultDiv = document.getElementById('conversionResult');
                resultDiv.textContent = `${value} ${fromUnit} = ${data.result} ${toUnit}`;
                resultDiv.style.display = 'block';
                this.speak(`${value} ${fromUnit} equals ${data.result} ${toUnit}`);
            } else {
                alert('Conversion not supported');
            }
        } catch (error) {
            console.error('Error converting units:', error);
        }
    }
    
    // YouTube functionality
    async searchYoutube() {
        const query = document.getElementById('youtubeQuery').value.trim();
        if (!query) return;
        
        try {
            const response = await fetch(`http://localhost:3000/api/youtube/search?q=${encodeURIComponent(query + ' cooking')}`);
            const videos = await response.json();
            this.displaySearchResults(videos);
        } catch (error) {
            console.error('Error searching YouTube:', error);
        }
    }
    
    displaySearchResults(videos) {
        const resultsDiv = document.getElementById('searchResults');
        resultsDiv.innerHTML = '';
        
        if (videos.length === 0) {
            resultsDiv.innerHTML = '<div class="search-result">No videos found</div>';
            resultsDiv.style.display = 'block';
            return;
        }
        
        videos.slice(0, 5).forEach(video => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'search-result';
            resultDiv.innerHTML = `<strong>${video.title}</strong><br><small>by ${video.channelTitle}</small>`;
            resultDiv.onclick = () => this.playVideo(video.videoId);
            resultsDiv.appendChild(resultDiv);
        });
        
        resultsDiv.style.display = 'block';
    }
    
    playVideo(videoId) {
        const container = document.getElementById('videoContainer');
        container.innerHTML = `<iframe id="youtubeFrame" src="https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1" frameborder="0" allowfullscreen></iframe>`;
        document.getElementById('youtubePlayer').style.display = 'block';
        document.getElementById('searchResults').style.display = 'none';
        this.currentVideo = videoId;
    }
    
    togglePlayPause() {
        if (!this.currentVideo) return;
        console.log('Play/Pause toggled');
        this.speak('Video playback toggled');
    }
    
    adjustVolume(delta) {
        if (!this.currentVideo) return;
        console.log(`Volume adjusted by ${delta}`);
        this.speak(delta > 0 ? 'Volume up' : 'Volume down');
    }
    
    // Utility functions
    updateConnectionStatus(status, connected = false) {
        const statusDot = document.getElementById('connectionStatus');
        const statusText = document.getElementById('connectionText');
        
        if (statusDot && statusText) {
            statusDot.className = `status-dot ${connected ? 'connected' : ''}`;
            statusText.textContent = status;
        }
    }
    
    updateVoiceStatus(status) {
        const voiceStatusElement = document.getElementById('voiceStatus');
        if (voiceStatusElement) {
            voiceStatusElement.textContent = status;
        }
    }
    
    showNotification(title, message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body: message });
        }
    }
}

// ElevenLabs Conversation Variables
let conversation = null;
let conversationHistory = [];

// DOM elements - Wait for DOM to load
let connectionStatus, agentStatus, startButton, stopButton;
let messagesDiv, chatForm, userInput;

// Initialize DOM elements after page loads
function initializeDOMElements() {
    connectionStatus = document.getElementById('connectionStatus');
    agentStatus = document.getElementById('agentStatus');
    startButton = document.getElementById('startButton');
    stopButton = document.getElementById('stopButton');
    messagesDiv = document.getElementById('messages');
    chatForm = document.getElementById('chatForm');
    userInput = document.getElementById('userInput');
}

async function getSignedUrl() {
    const response = await fetch('http://localhost:3000/api/get-signed-url');
    if (!response.ok) {
        throw new Error(`Failed to get signed url: ${response.statusText}`);
    }
    const { signedUrl } = await response.json();
    return signedUrl;
}

async function startConversation() {
    try {
        // Request microphone permission
        await navigator.mediaDevices.getUserMedia({ audio: true });

        const signedUrl = await getSignedUrl();

        console.log('Using imported Conversation from @elevenlabs/client');
        
        // Start the conversation using imported Conversation
        conversation = await Conversation.startSession({
            signedUrl,
            clientTools: {
                displayMessage: async (parameters) => {
                    appendMessage('Agent', parameters.text);
                    renderConversationHistory(); // Ensure conversation section updates
                    alert(parameters.text);
                    return "Message displayed";
                },
            },
            onConnect: () => {
                connectionStatus.textContent = 'Connected';
                startButton.disabled = true;
                stopButton.disabled = false;
            },
            onDisconnect: () => {
                connectionStatus.textContent = 'Disconnected';
                startButton.disabled = false;
                stopButton.disabled = true;
            },
            onError: (error) => {
                console.error('Error:', error);
            },
            onModeChange: (mode) => {
                agentStatus.textContent = mode.mode === 'speaking' ? 'speaking' : 'listening';
            },
        });
    } catch (error) {
        console.error('Failed to start conversation:', error);
    }
}

async function stopConversation() {
    if (conversation) {
        await conversation.endSession();
        conversation = null;
    }
}

function appendMessage(sender, text) {
    const msg = document.createElement('div');
    msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
    msg.style.marginBottom = '10px';
    messagesDiv.appendChild(msg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    conversationHistory.push({ sender, text });
}

function renderConversationHistory() {
    messagesDiv.innerHTML = '';
    conversationHistory.forEach(msg => {
        appendMessage(msg.sender, msg.text);
    });
}

async function fetchConversationHistory() {
    try {
        const res = await fetch('http://localhost:3000/api/conversation-history');
        const data = await res.json();
        if (Array.isArray(data.history)) {
            conversationHistory = data.history;
            renderConversationHistory();
        }
    } catch (err) {
        // Optionally show error
    }
}

// Initialize event listeners after DOM loads
function initializeEventListeners() {
    if (startButton) {
        startButton.addEventListener('click', async () => {
            await startConversation();
            await fetchConversationHistory();
        });
    }

    if (stopButton) {
        stopButton.addEventListener('click', stopConversation);
    }

    // Chat UI logic
    if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = userInput.value.trim();
            if (!text) return;
            appendMessage('You', text);
            userInput.value = '';
            try {
                const res = await fetch('http://localhost:3000/api/converse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: text })
                });
                const data = await res.json();
                if (data.reply) {
                    appendMessage('Agent', data.reply);
                } else {
                    appendMessage('Agent', 'No response received.');
                }
                // Fetch and render updated conversation history
                await fetchConversationHistory();
            } catch (err) {
                appendMessage('Agent', 'Error: ' + err.message);
            }
        });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('ElevenLabs Conversation imported successfully');
    
    // Initialize DOM elements first
    initializeDOMElements();
    
    // Initialize event listeners
    initializeEventListeners();
    
    // Initialize KitchenAssistant
    window.kitchenAssistant = new KitchenAssistant();
    console.log('Kitchen Smart Assistant initialized!');
    
    // Load conversation history
    fetchConversationHistory();
});
