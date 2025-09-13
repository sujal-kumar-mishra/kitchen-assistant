// Kitchen Smart Assistant - Complete Frontend Implementation

import { Conversation } from '@elevenlabs/client';

// WebSocket Manager to handle multiple connections
class WebSocketManager {
    constructor() {
        this.connections = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    addConnection(name, connection) {
        this.connections.set(name, connection);
        console.log(`🔗 Registered WebSocket: ${name}`);
    }

    removeConnection(name) {
        if (this.connections.has(name)) {
            this.connections.delete(name);
            console.log(`🔌 Unregistered WebSocket: ${name}`);
        }
    }

    getConnection(name) {
        return this.connections.get(name);
    }

    closeAll() {
        for (const [name, connection] of this.connections) {
            try {
                if (connection.close) {
                    connection.close();
                }
                console.log(`🔌 Closed WebSocket: ${name}`);
            } catch (error) {
                console.error(`❌ Error closing WebSocket ${name}:`, error);
            }
        }
        this.connections.clear();
    }
}

// Initialize WebSocket manager
const wsManager = new WebSocketManager();

class KitchenAssistant {
    constructor() {
        this.socket = null;
        this.socketIO = null;
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.currentVideo = null;
        this.activeTimers = new Map();
        this.pauseWebSocketBroadcasting = false;
        this.autoReconnect = false;
        
        // Set backend URL based on environment
        this.backendUrl = window.location.hostname === 'localhost' ? 
            'http://localhost:3000' : 
            'https://kitchen-assistant-8quk.onrender.com';
        
        this.init();
    }
    
    init() {
        this.initializeSocketIO();
        this.initializeSpeechRecognition();
        this.bindEventListeners();
        this.updateConnectionStatus('Ready');
        this.fetchConversationHistory();
        this.renderActiveTimers(); // Initialize empty timer container
    }

    
    // Socket.IO for real-time features (timers) with conflict prevention
    initializeSocketIO() {
        try {
            console.log('🔌 Connecting to backend Socket.IO:', this.backendUrl);
            
            this.socketIO = io(this.backendUrl, {
                transports: ['websocket', 'polling'],
                timeout: 20000,
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5
            });
            
            this.socketIO.on('connect', () => {
                console.log('✅ Socket.IO connected');
                this.updateConnectionStatus('Connected', true);
                wsManager.addConnection('backend', this.socketIO);
            });
            
            this.socketIO.on('disconnect', (reason) => {
                console.log('🔌 Socket.IO disconnected:', reason);
                this.updateConnectionStatus('Disconnected', false);
                wsManager.removeConnection('backend');
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
                        const timerData = {
                            ...timer,
                            name: this.generateTimerName(timer.secondsLeft),
                            startTime: Date.now() - ((timer.originalSeconds || timer.secondsLeft) - timer.secondsLeft) * 1000
                        };
                        this.activeTimers.set(timer.id, timerData);
                    });
                    this.renderActiveTimers();
                }
            });
            
            // Listen for API calls from voice agent or other sources with broadcasting pause
            this.socketIO.on('api:call', (data) => {
                if (this.pauseWebSocketBroadcasting) {
                    console.log('⏸️ WebSocket broadcasting paused, skipping API call update');
                    return;
                }
                
                console.log('📡 API call detected:', data);
                this.handleApiCallUpdate(data);
            });
            
            this.socketIO.on('connect_error', (error) => {
                console.error('❌ Socket.IO connection error:', error);
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
        
        // Timer functionality - updated for multiple timers
        document.getElementById('startTimer').addEventListener('click', () => this.startTimer());
        
        // Handle enter key in timer inputs
        document.getElementById('timerMinutes').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.startTimer();
        });
        document.getElementById('timerSeconds').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.startTimer();
        });
        
        // Unit converter
        document.getElementById('convertBtn').addEventListener('click', () => this.convertUnits());
        
        // YouTube functionality
        document.getElementById('searchYoutube').addEventListener('click', () => {
            const query = document.getElementById('youtubeQuery').value.trim();
            if (query) {
                // Immediate UI feedback
                const searchBtn = document.getElementById('searchYoutube');
                searchBtn.disabled = true;
                searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Searching...';
                
                this.searchYoutube(query).finally(() => {
                    // Reset button state
                    searchBtn.disabled = false;
                    searchBtn.innerHTML = '<i class="fas fa-search"></i> Search';
                });
            } else {
                alert('Please enter a search query');
            }
        });
        document.getElementById('youtubeQuery').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = document.getElementById('youtubeQuery').value.trim();
                if (query) {
                    this.searchYoutube(query);
                } else {
                    alert('Please enter a search query');
                }
            }
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
        
        // Show typing indicator
        const typingIndicator = this.addMessage('Agent', '💭 Thinking...', true);
        
        try {
            const response = await fetch(`${this.backendUrl}/api/converse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });
            
            // Remove typing indicator
            if (typingIndicator && typingIndicator.parentNode) {
                typingIndicator.remove();
            }
            
            const data = await response.json();
            if (data.reply) {
                this.addMessage('Agent', data.reply);
                this.speak(data.reply);
                // Update connection status
                this.updateConnectionStatus('Connected', true);
            } else {
                this.addMessage('Agent', 'No response received.');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            // Remove typing indicator on error
            if (typingIndicator && typingIndicator.parentNode) {
                typingIndicator.remove();
            }
            this.addMessage('System', 'Error: Unable to send message. Please check connection.');
            this.updateConnectionStatus('Connection Error', false);
        }
    }
    
    async fetchConversationHistory() {
        try {
            const response = await fetch(`${this.backendUrl}/api/conversation-history`);
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
        
        return messageElement; // Return element for potential removal
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
    
    // Timer functionality - updated for multiple timers
    async startTimer() {
        const minutes = parseInt(document.getElementById('timerMinutes').value) || 0;
        const seconds = parseInt(document.getElementById('timerSeconds').value) || 0;
        const totalSeconds = minutes * 60 + seconds;
        
        if (totalSeconds <= 0) {
            this.showNotification('Invalid Time', 'Please enter a valid time');
            return;
        }
        
        // Immediate UI feedback
        const startButton = document.getElementById('startTimer');
        startButton.disabled = true;
        startButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';
        
        try {
            const response = await fetch(`${this.backendUrl}/api/timer/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seconds: totalSeconds })
            });
            
            if (!response.ok) {
                throw new Error('Failed to start timer');
            }
            
            const data = await response.json();
            console.log('Timer started:', data);
            
            // Reset form
            document.getElementById('timerMinutes').value = '5';
            document.getElementById('timerSeconds').value = '0';
            
            // Reset button state
            startButton.disabled = false;
            startButton.innerHTML = '<i class="fas fa-play"></i> Start Timer';
            
        } catch (error) {
            console.error('Error starting timer:', error);
            // Reset button state on error
            startButton.disabled = false;
            startButton.innerHTML = '<i class="fas fa-play"></i> Start Timer';
            this.showNotification('Error', 'Failed to start timer. Please check connection.');
        }
    }
    
    handleTimerStarted(data) {
        const timer = {
            ...data,
            startTime: Date.now(),
            originalSeconds: data.secondsLeft || data.seconds,
            name: this.generateTimerName(data.secondsLeft || data.seconds)
        };
        this.activeTimers.set(data.id, timer);
        this.renderActiveTimers();
        this.showNotification('Timer Started', `${timer.name} has been started!`);
    }
    
    handleTimerUpdate(data) {
        if (this.activeTimers.has(data.id)) {
            const timer = this.activeTimers.get(data.id);
            timer.secondsLeft = data.secondsLeft;
            this.activeTimers.set(data.id, timer);
            this.updateTimerItem(data.id, data.secondsLeft);
        }
    }
    
    handleTimerDone(data) {
        if (this.activeTimers.has(data.id)) {
            const timer = this.activeTimers.get(data.id);
            this.activeTimers.delete(data.id);
            this.renderActiveTimers();
            this.speak(`${timer.name} finished!`);
            this.showNotification('Timer Complete!', `${timer.name} has finished!`);
            
            // Flash the timer item before removing
            this.flashTimerCompletion(data.id);
        }
    }
    
    handleTimerStopped(data) {
        if (this.activeTimers.has(data.id)) {
            const timer = this.activeTimers.get(data.id);
            this.activeTimers.delete(data.id);
            this.renderActiveTimers();
            this.showNotification('Timer Stopped', `${timer.name} has been stopped.`);
        }
    }
    
    generateTimerName(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        
        if (minutes > 0 && seconds > 0) {
            return `${minutes}m ${seconds}s Timer`;
        } else if (minutes > 0) {
            return `${minutes} Minute Timer`;
        } else {
            return `${seconds} Second Timer`;
        }
    }
    
    renderActiveTimers() {
        const container = document.getElementById('activeTimers');
        if (!container) return;
        
        if (this.activeTimers.size === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; font-style: italic; margin: 20px 0;">No active timers</p>';
            return;
        }
        
        container.innerHTML = '';
        
        for (const [id, timer] of this.activeTimers) {
            const timerElement = this.createTimerElement(id, timer);
            container.appendChild(timerElement);
        }
    }
    
    createTimerElement(id, timer) {
        const element = document.createElement('div');
        element.className = 'timer-item';
        element.id = `timer-${id}`;
        
        const timeDisplay = this.formatTime(timer.secondsLeft || 0);
        
        element.innerHTML = `
            <div class="timer-info">
                <div class="timer-name">${timer.name}</div>
                <div class="timer-time" id="timer-time-${id}">${timeDisplay}</div>
            </div>
            <div class="timer-controls">
                <span class="timer-status running">Running</span>
                <button class="timer-btn stop" onclick="window.kitchenAssistant.stopSpecificTimer(${id})">
                    <i class="fas fa-stop"></i> Stop
                </button>
            </div>
        `;
        
        return element;
    }
    
    updateTimerItem(id, secondsLeft) {
        const timeElement = document.getElementById(`timer-time-${id}`);
        if (timeElement) {
            timeElement.textContent = this.formatTime(secondsLeft);
            
            // Add visual feedback for low time
            if (secondsLeft <= 60) {
                timeElement.style.color = '#dc3545';
                timeElement.style.animation = 'pulse 1s infinite';
            } else {
                timeElement.style.color = '#667eea';
                timeElement.style.animation = 'none';
            }
        }
    }
    
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    async stopSpecificTimer(id) {
        try {
            const response = await fetch(`${this.backendUrl}/api/timer/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            
            if (!response.ok) {
                throw new Error('Failed to stop timer');
            }
            
            console.log(`Timer ${id} stopped by user`);
        } catch (error) {
            console.error('Error stopping specific timer:', error);
            this.showNotification('Error', 'Failed to stop timer');
        }
    }
    
    flashTimerCompletion(id) {
        const element = document.getElementById(`timer-${id}`);
        if (element) {
            element.style.animation = 'flash 0.5s ease-in-out 3';
            setTimeout(() => {
                if (element.parentNode) {
                    element.remove();
                }
            }, 1500);
        }
    }
    
    // Handle real-time API call updates from WebSocket
    handleApiCallUpdate(data) {
        console.log('Handling API update:', data.url, data.response);
        
        // Handle different API endpoints
        if (data.url.includes('/converse')) {
            if (data.response && data.response.reply) {
                this.addMessage('Agent', `🎤 ${data.response.reply}`);
                this.showNotification('Voice Agent', data.response.reply);
            }
        }
        
        else if (data.url.includes('/convert')) {
            if (data.response && data.response.result !== undefined) {
                const { value, from, to, result } = data.query;
                const resultDiv = document.getElementById('conversionResult');
                resultDiv.textContent = `${value} ${from} = ${result} ${to}`;
                resultDiv.style.display = 'block';
                resultDiv.style.backgroundColor = '#e8f5e8';
                resultDiv.style.color = '#2e7d32';
                this.showNotification('Unit Conversion', `${value} ${from} = ${result} ${to}`);
            }
        }
        
        else if (data.url.includes('/youtube/search')) {
            if (data.response && Array.isArray(data.response)) {
                this.displaySearchResults(data.response);
                this.showNotification('YouTube Search', `Found ${data.response.length} videos`);
            }
        }
        
        else if (data.url.includes('/timer/start')) {
            if (data.response && data.response.id) {
                this.showNotification('Timer Started', `Timer set for ${Math.floor(data.body.seconds / 60)}:${String(data.body.seconds % 60).padStart(2, '0')}`);
            }
        }
        
        else if (data.url.includes('/get-signed-url')) {
            this.showNotification('ElevenLabs', 'Voice conversation ready');
        }
        
        // Update connection status for any successful API call
        if (data.status >= 200 && data.status < 300) {
            this.updateConnectionStatus('API Active', true);
            
            // Show activity indicator
            this.showApiActivity(data.method, data.url);
        } else {
            this.updateConnectionStatus('API Error', false);
        }
    }
    
    // Show API activity indicator
    showApiActivity(method, url) {
        const indicator = document.createElement('div');
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(102, 126, 234, 0.9);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
        `;
        indicator.innerHTML = `📡 ${method} ${url.split('/').pop()}`;
        
        document.body.appendChild(indicator);
        
        // Remove after 3 seconds
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.style.animation = 'slideOut 0.3s ease-out';
                setTimeout(() => indicator.remove(), 300);
            }
        }, 3000);
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
        
        // Immediate UI feedback
        const convertBtn = document.getElementById('convertBtn');
        const originalText = convertBtn.innerHTML;
        convertBtn.disabled = true;
        convertBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Converting...';
        
        const resultDiv = document.getElementById('conversionResult');
        resultDiv.style.display = 'block';
        resultDiv.textContent = 'Converting...';
        
        try {
            const response = await fetch(`${this.backendUrl}/api/convert?value=${value}&from=${fromUnit}&to=${toUnit}`);
            const data = await response.json();
            
            if (data.result !== undefined) {
                resultDiv.textContent = `${value} ${fromUnit} = ${data.result} ${toUnit}`;
                resultDiv.style.backgroundColor = '#e8f5e8';
                resultDiv.style.color = '#2e7d32';
                this.speak(`${value} ${fromUnit} equals ${data.result} ${toUnit}`);
            } else {
                resultDiv.textContent = 'Conversion not supported';
                resultDiv.style.backgroundColor = '#ffebee';
                resultDiv.style.color = '#c62828';
            }
        } catch (error) {
            console.error('Error converting units:', error);
            resultDiv.textContent = 'Error: Unable to convert. Please check connection.';
            resultDiv.style.backgroundColor = '#ffebee';
            resultDiv.style.color = '#c62828';
        } finally {
            // Reset button state
            convertBtn.disabled = false;
            convertBtn.innerHTML = originalText;
        }
    }
    
    // YouTube functionality
    async searchYoutube(query) {
        if (!query || typeof query !== 'string') return;
        
        try {
            console.log('Searching YouTube for:', query);
            const response = await fetch(`${this.backendUrl}/api/youtube/search?q=${encodeURIComponent(query)}`);
            const videos = await response.json();
            console.log('YouTube search results:', videos);
            this.displaySearchResults(videos);
            return videos;
        } catch (error) {
            console.error('Error searching YouTube:', error);
            this.displaySearchResults([]);
        }
    }
    
    displaySearchResults(videos) {
        console.log('Displaying search results:', videos?.length || 0, 'videos');
        
        // Try both containers - the main dashboard and the compatibility section
        let youtubeSection = document.getElementById('youtubeSection');
        let resultsDiv = document.getElementById('videoResults');
        let usingCompatibilitySection = true;
        
        // If the compatibility section doesn't exist, use the main dashboard
        if (!youtubeSection || !resultsDiv) {
            youtubeSection = document.getElementById('youtubePlayer');
            resultsDiv = document.getElementById('searchResults');
            usingCompatibilitySection = false;
            console.log('Using main dashboard for results');
        } else {
            console.log('Using compatibility section for results');
        }
        
        if (!youtubeSection || !resultsDiv) {
            console.error('YouTube display elements not found');
            console.log('Available elements:', {
                youtubeSection: !!document.getElementById('youtubeSection'),
                videoResults: !!document.getElementById('videoResults'),
                youtubePlayer: !!document.getElementById('youtubePlayer'),
                searchResults: !!document.getElementById('searchResults')
            });
            return;
        }
        
        resultsDiv.innerHTML = '';
        
        if (!videos || videos.length === 0) {
            resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;color:#666;">No videos found</div>';
            youtubeSection.style.display = 'block';
            return;
        }
        
        videos.forEach(video => {
            if (!video.id || !video.title) return;
            
            const videoCard = document.createElement('div');
            videoCard.style.cssText = `
                background: white;
                border-radius: 8px;
                padding: 10px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                cursor: pointer;
                transition: transform 0.2s;
            `;
            
            videoCard.innerHTML = `
                <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:4px;">
                    <img src="${video.thumbnail || ''}" 
                         style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;" 
                         alt="${video.title}" />
                    <div style="position:absolute;bottom:5px;right:5px;background:rgba(0,0,0,0.8);color:white;padding:2px 6px;border-radius:2px;font-size:12px;">
                        ▶
                    </div>
                    <div style="position:absolute;top:5px;right:5px;">
                        <div style="background:rgba(0,0,0,0.6);color:white;padding:2px 6px;border-radius:3px;font-size:10px;">
                            ${Math.floor(Math.random() * 15) + 1}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}
                        </div>
                    </div>
                </div>
                <h4 style="margin:8px 0;font-size:14px;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                    ${video.title}
                </h4>
                <p style="font-size:12px;color:#666;margin:0;">${video.channel || 'Unknown Channel'}</p>
            `;
            
            videoCard.onmouseover = () => videoCard.style.transform = 'translateY(-2px)';
            videoCard.onmouseout = () => videoCard.style.transform = 'translateY(0)';
            
            // Add click event with better error handling
            videoCard.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Video card clicked:', video.title, video.id);
                this.playVideo(video.id, video.title);
            });
            
            // Also add the onclick as fallback
            videoCard.onclick = (e) => {
                e.preventDefault();
                console.log('Video card onclick:', video.title, video.id);
                this.playVideo(video.id, video.title);
            };
            
            resultsDiv.appendChild(videoCard);
        });
        
        youtubeSection.style.display = 'block';
    }
    
    playVideo(videoId, title) {
        console.log('Attempting to play video:', videoId, title);
        
        // Try main dashboard containers first
        let container = document.getElementById('videoContainer');
        let playerDiv = document.getElementById('youtubePlayer');
        
        // If main dashboard containers don't exist, try compatibility section
        if (!container || !playerDiv) {
            container = document.getElementById('videoContainer2');
            playerDiv = document.getElementById('videoPlayer');
            console.log('Using compatibility containers');
        } else {
            console.log('Using main dashboard containers');
        }
        
        if (!container || !playerDiv) {
            console.error('Video player elements not found');
            console.log('Available elements:', {
                videoContainer: !!document.getElementById('videoContainer'),
                youtubePlayer: !!document.getElementById('youtubePlayer'),
                videoContainer2: !!document.getElementById('videoContainer2'),
                videoPlayer: !!document.getElementById('videoPlayer')
            });
            return;
        }
        
        // Clear any existing content
        container.innerHTML = '';
        
        // Create YouTube iframe for embedded playback
        const iframe = document.createElement('iframe');
        iframe.id = 'youtubeFrame';
        iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&fs=1&enablejsapi=1`;
        iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;border-radius:8px;';
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('allowfullscreen', 'true');
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
        iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        
        // Create loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            z-index: 10;
        `;
        loadingDiv.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
            <div>Loading video...</div>
            <div style="font-size: 12px; margin-top: 10px; opacity: 0.7;">${title || 'YouTube Video'}</div>
        `;
        
        // Add loading indicator first
        container.appendChild(loadingDiv);
        
        // Add iframe loading handlers
        iframe.onload = () => {
            console.log('YouTube iframe loaded successfully');
            // Remove loading indicator
            if (loadingDiv.parentNode) {
                loadingDiv.remove();
            }
        };
        
        iframe.onerror = () => {
            console.error('YouTube iframe failed to load');
            loadingDiv.innerHTML = `
                <div style="font-size: 24px; margin-bottom: 10px;">❌</div>
                <div>Failed to load video</div>
                <div style="margin-top: 15px;">
                    <button onclick="window.open('https://www.youtube.com/watch?v=${videoId}', '_blank')" 
                            style="background: #ff0000; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        Open in YouTube
                    </button>
                </div>
            `;
        };
        
        // Add the iframe to the container
        container.appendChild(iframe);
        
        // Remove loading indicator after timeout if still present
        setTimeout(() => {
            if (loadingDiv.parentNode) {
                loadingDiv.innerHTML = `
                    <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
                    <div>Video is taking time to load</div>
                    <div style="margin-top: 15px;">
                        <button onclick="this.parentElement.parentElement.remove()" 
                                style="background: #666; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">
                            Close
                        </button>
                        <button onclick="window.open('https://www.youtube.com/watch?v=${videoId}', '_blank')" 
                                style="background: #ff0000; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                            Open in YouTube
                        </button>
                    </div>
                `;
            }
        }, 8000);
        
        playerDiv.style.display = 'block';
        this.currentVideo = videoId;
        
        // Add close video functionality
        const closeBtn = document.getElementById('closeVideo');
        if (closeBtn) {
            closeBtn.onclick = () => {
                container.innerHTML = '';
                playerDiv.style.display = 'none';
                this.currentVideo = null;
                console.log('Video closed');
            };
        }
        
        // Scroll to video player
        playerDiv.scrollIntoView({ behavior: 'smooth' });
        
        console.log('Video iframe created and added to container');
        console.log('Playing video:', title || videoId);
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
    
    // Helper method to show system messages
    showSystemMessage(message) {
        console.log('💬 System:', message);
        // You can add UI updates here if needed
        const messagesDiv = document.getElementById('messages');
        if (messagesDiv) {
            const messageEl = document.createElement('div');
            messageEl.className = 'message system';
            messageEl.textContent = message;
            messagesDiv.appendChild(messageEl);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    }
    
    // Helper method to update voice status
    updateVoiceStatus(status) {
        console.log('🎙️ Voice status:', status);
        const agentStatus = document.getElementById('agent-status');
        if (agentStatus) {
            agentStatus.textContent = status;
        }
    }
    
    // Method to stop conversation cleanly
    stopConversation() {
        this.autoReconnect = false;
        
        if (conversation) {
            try {
                conversation.endSession();
                wsManager.removeConnection('elevenlabs');
                console.log('🔌 ElevenLabs conversation ended');
            } catch (error) {
                console.error('❌ Error ending conversation:', error);
            }
            conversation = null;
        }
        
        this.updateConnectionStatus('Disconnected', false);
        this.updateVoiceStatus('Stopped');
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
    const backendUrl = window.location.hostname === 'localhost' ? 
        'http://localhost:3000' : 
        'https://kitchen-assistant-8quk.onrender.com';
    
    const response = await fetch(`${backendUrl}/api/get-signed-url`);
    if (!response.ok) {
        throw new Error(`Failed to get signed url: ${response.statusText}`);
    }
    const { signedUrl } = await response.json();
    return signedUrl;
}

async function startConversation() {
    try {
        // Update status
        window.kitchenAssistant.updateConnectionStatus('Connecting...', false);
        
        // Request microphone permission
        await navigator.mediaDevices.getUserMedia({ audio: true });

        const signedUrl = await getSignedUrl();
        console.log('🔗 Got signed URL for ElevenLabs');
        
        // Close any existing ElevenLabs connection
        if (conversation) {
            try {
                await conversation.endSession();
                wsManager.removeConnection('elevenlabs');
                console.log('🔌 Closed existing ElevenLabs connection');
            } catch (error) {
                console.warn('⚠️ Error closing existing conversation:', error);
            }
        }

        console.log('🎯 Using imported Conversation from @elevenlabs/client');
        
        // Start the conversation using imported Conversation
        conversation = await Conversation.startSession({
            signedUrl,
            clientTools: {
                displayMessage: async (parameters) => {
                    appendMessage('Agent', parameters.text);
                    renderConversationHistory(); // Ensure conversation section updates
                    return "Message displayed";
                },
                searchYoutube: async (parameters) => {
                    try {
                        const query = parameters.query || parameters.q;
                        if (!query) {
                            return "No search query provided";
                        }
                        
                        console.log('🎬 ElevenLabs triggered YouTube search:', query);
                        appendMessage('System', `🎤 Voice Agent: Searching YouTube for: ${query}`);
                        window.kitchenAssistant.showSystemMessage('🔍 Searching for cooking videos...');
                        
                        // Pause WebSocket broadcasting during API call
                        window.kitchenAssistant.pauseWebSocketBroadcasting = true;
                        
                        const response = await fetch(`${window.kitchenAssistant.backendUrl}/api/youtube/search?q=${encodeURIComponent(query)}`);
                        const videos = await response.json();
                        
                        // Resume WebSocket broadcasting
                        window.kitchenAssistant.pauseWebSocketBroadcasting = false;
                        
                        if (videos && videos.length > 0) {
                            window.kitchenAssistant.displaySearchResults(videos);
                            appendMessage('System', `🎤 Voice Agent: Found ${videos.length} videos`);
                            window.kitchenAssistant.showSystemMessage(`✅ Found ${videos.length} videos`);
                            return `Found ${videos.length} YouTube videos for "${query}". Videos are displayed above for you to play.`;
                        } else {
                            appendMessage('System', '🎤 Voice Agent: No videos found');
                            return `No YouTube videos found for "${query}".`;
                        }
                    } catch (error) {
                        window.kitchenAssistant.pauseWebSocketBroadcasting = false;
                        console.error('❌ YouTube search error:', error);
                        appendMessage('System', '🎤 Voice Agent: Error searching videos');
                        return `Sorry, I couldn't search for videos right now.`;
                    }
                },
                
                setTimer: async (parameters) => {
                    try {
                        console.log('⏰ ElevenLabs triggered timer:', parameters);
                        const duration = parameters.duration || parameters.minutes || parameters.seconds;
                        if (!duration) {
                            return "Please specify timer duration";
                        }
                        
                        let seconds = 0;
                        if (typeof duration === 'string') {
                            const match = duration.match(/(\d+)\s*(minute|min|second|sec)/i);
                            if (match) {
                                const value = parseInt(match[1]);
                                const unit = match[2].toLowerCase();
                                seconds = unit.startsWith('min') ? value * 60 : value;
                            } else {
                                seconds = parseInt(duration) || 0;
                            }
                        } else {
                            seconds = parseInt(duration) || 0;
                        }
                        
                        if (seconds <= 0) {
                            return "Invalid timer duration";
                        }
                        
                        window.kitchenAssistant.showSystemMessage('⏰ Starting timer...');
                        
                        // Pause WebSocket broadcasting during API call
                        window.kitchenAssistant.pauseWebSocketBroadcasting = true;
                        
                        appendMessage('System', `🎤 Voice Agent: Setting timer for ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`);
                        
                        const response = await fetch(`${window.kitchenAssistant.backendUrl}/api/timer/start`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ seconds })
                        });
                        
                        // Resume WebSocket broadcasting
                        window.kitchenAssistant.pauseWebSocketBroadcasting = false;
                        
                        const data = await response.json();
                        appendMessage('System', `🎤 Voice Agent: Timer started successfully`);
                        window.kitchenAssistant.showSystemMessage('✅ Timer started!');
                        return `Timer set for ${Math.floor(seconds/60)} minutes and ${seconds%60} seconds. I'll notify you when it's done.`;
                    } catch (error) {
                        window.kitchenAssistant.pauseWebSocketBroadcasting = false;
                        console.error('❌ Timer start error:', error);
                        appendMessage('System', '🎤 Voice Agent: Error setting timer');
                        return "Sorry, I couldn't start the timer.";
                    }
                },
                
                convertUnits: async (parameters) => {
                    try {
                        console.log('🧮 ElevenLabs triggered conversion:', parameters);
                        const { value, from, to, amount, fromUnit, toUnit } = parameters;
                        
                        const convertValue = value || amount;
                        const fromUnitName = from || fromUnit;
                        const toUnitName = to || toUnit;
                        
                        if (!convertValue || !fromUnitName || !toUnitName) {
                            return "Please specify amount, from unit, and to unit for conversion";
                        }
                        
                        window.kitchenAssistant.showSystemMessage('🧮 Converting units...');
                        
                        // Pause WebSocket broadcasting during API call
                        window.kitchenAssistant.pauseWebSocketBroadcasting = true;
                        
                        appendMessage('System', `🎤 Voice Agent: Converting ${convertValue} ${fromUnitName} to ${toUnitName}`);
                        
                        const response = await fetch(`${window.kitchenAssistant.backendUrl}/api/convert?value=${convertValue}&from=${fromUnitName}&to=${toUnitName}`);
                        const data = await response.json();
                        
                        // Resume WebSocket broadcasting
                        window.kitchenAssistant.pauseWebSocketBroadcasting = false;
                        
                        if (data.result !== undefined) {
                            appendMessage('System', `🎤 Voice Agent: ${convertValue} ${fromUnitName} = ${data.result} ${toUnitName}`);
                            window.kitchenAssistant.showSystemMessage('✅ Conversion complete!');
                            return `${convertValue} ${fromUnitName} equals ${data.result} ${toUnitName}.`;
                        } else {
                            appendMessage('System', '🎤 Voice Agent: Conversion not supported');
                            return `Sorry, I can't convert from ${fromUnitName} to ${toUnitName}.`;
                        }
                    } catch (error) {
                        window.kitchenAssistant.pauseWebSocketBroadcasting = false;
                        console.error('❌ Conversion error:', error);
                        appendMessage('System', '🎤 Voice Agent: Error converting units');
                        return "Sorry, I couldn't convert those units.";
                    }
                },
            },
            onConnect: () => {
                console.log('🎉 ElevenLabs conversation connected');
                connectionStatus.textContent = 'Connected';
                startButton.disabled = true;
                stopButton.disabled = false;
                window.kitchenAssistant.updateConnectionStatus('Connected', true);
                wsManager.addConnection('elevenlabs', conversation);
            },
            onDisconnect: (reason) => {
                console.log('🔌 ElevenLabs conversation disconnected:', reason);
                connectionStatus.textContent = 'Disconnected';
                startButton.disabled = false;
                stopButton.disabled = true;
                window.kitchenAssistant.updateConnectionStatus('Disconnected', false);
                wsManager.removeConnection('elevenlabs');
                
                // Auto-reconnect if not intentional
                if (reason !== 'user_initiated' && window.kitchenAssistant.autoReconnect) {
                    setTimeout(() => {
                        console.log('🔄 Attempting to reconnect ElevenLabs...');
                        startConversation();
                    }, 3000);
                }
            },
            onError: (error) => {
                console.error('❌ ElevenLabs conversation error:', error);
                window.kitchenAssistant.updateConnectionStatus('Error', false);
                
                // Don't broadcast errors that might interfere
                if (!error.message.includes('WebSocket')) {
                    window.kitchenAssistant.showSystemMessage('❌ Voice conversation error');
                }
            },
            onModeChange: (mode) => {
                console.log('🎙️ ElevenLabs mode changed:', mode.mode);
                agentStatus.textContent = mode.mode === 'speaking' ? 'speaking' : 'listening';
                window.kitchenAssistant.updateVoiceStatus(mode.mode === 'speaking' ? 'Speaking' : 'Listening');
            },
        });

        console.log('✅ ElevenLabs conversation started successfully');
        window.kitchenAssistant.autoReconnect = true;
        
    } catch (error) {
        console.error('❌ Failed to start conversation:', error);
        window.kitchenAssistant.updateConnectionStatus('Failed to connect', false);
        window.kitchenAssistant.showSystemMessage('❌ Failed to start voice conversation');
    }
}

async function stopConversation() {
    window.kitchenAssistant.autoReconnect = false;
    
    if (conversation) {
        try {
            await conversation.endSession();
            wsManager.removeConnection('elevenlabs');
            console.log('🔌 ElevenLabs conversation ended');
        } catch (error) {
            console.error('❌ Error ending conversation:', error);
        }
        conversation = null;
    }
    
    connectionStatus.textContent = 'Disconnected';
    startButton.disabled = false;
    stopButton.disabled = true;
    window.kitchenAssistant.updateConnectionStatus('Disconnected', false);
    window.kitchenAssistant.updateVoiceStatus('Stopped');
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
        const backendUrl = window.location.hostname === 'localhost' ? 
            'http://localhost:3000' : 
            'https://kitchen-assistant-8quk.onrender.com';
        
        const res = await fetch(`${backendUrl}/api/conversation-history`);
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
                const backendUrl = window.location.hostname === 'localhost' ? 
                    'http://localhost:3000' : 
                    'https://kitchen-assistant-8quk.onrender.com';
                
                const res = await fetch(`${backendUrl}/api/converse`, {
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

// Add cleanup on page unload to prevent WebSocket conflicts
window.addEventListener('beforeunload', () => {
    console.log('🧹 Cleaning up WebSocket connections');
    wsManager.closeAll();
    
    if (conversation) {
        try {
            conversation.endSession();
        } catch (error) {
            console.warn('⚠️ Error ending ElevenLabs session:', error);
        }
    }
});

// WebSocket connections are properly managed by the wsManager
console.log('� WebSocket conflict prevention system loaded');
