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
    }

    
    // Socket.IO for real-time features (timers)
    initializeSocketIO() {
        try {
            this.socketIO = io(this.backendUrl);
            
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
            
            // Listen for API calls from voice agent or other sources
            this.socketIO.on('api:call', (data) => {
                console.log('API call detected:', data);
                this.handleApiCallUpdate(data);
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
    
    // Timer functionality
    async startTimer() {
        const minutes = parseInt(document.getElementById('timerMinutes').value) || 0;
        const seconds = parseInt(document.getElementById('timerSeconds').value) || 0;
        const totalSeconds = minutes * 60 + seconds;
        
        if (totalSeconds <= 0) {
            alert('Please enter a valid time');
            return;
        }
        
        // Immediate UI feedback
        document.getElementById('startTimer').disabled = true;
        document.getElementById('startTimer').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';
        
        try {
            const response = await fetch(`${this.backendUrl}/api/timer/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seconds: totalSeconds })
            });
            
            const data = await response.json();
            console.log('Timer started:', data);
            
            // Reset button state
            document.getElementById('startTimer').disabled = false;
            document.getElementById('startTimer').innerHTML = '<i class="fas fa-play"></i> Start';
            
        } catch (error) {
            console.error('Error starting timer:', error);
            // Reset button state on error
            document.getElementById('startTimer').disabled = false;
            document.getElementById('startTimer').innerHTML = '<i class="fas fa-play"></i> Start';
            alert('Failed to start timer. Please check connection.');
        }
    }
    
    async stopTimer() {
        const timerId = Array.from(this.activeTimers.keys())[0];
        if (!timerId) return;
        
        try {
            const response = await fetch(`${this.backendUrl}/api/timer/stop`, {
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
        'https://kitchen-assistant-backend.onrender.com';
    
    const response = await fetch(`${backendUrl}/api/get-signed-url`);
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
                    return "Message displayed";
                },
                searchYoutube: async (parameters) => {
                    const query = parameters.query || parameters.q;
                    if (!query) {
                        return "No search query provided";
                    }
                    
                    appendMessage('System', `🎤 Voice Agent: Searching YouTube for: ${query}`);
                    
                    // Call the backend API which will trigger WebSocket updates
                    try {
                        const response = await fetch(`http://localhost:3000/api/youtube/search?q=${encodeURIComponent(query)}`);
                        const videos = await response.json();
                        
                        if (videos && videos.length > 0) {
                            // The WebSocket will handle the UI update, but we also update here for immediate feedback
                            window.kitchenAssistant.displaySearchResults(videos);
                            appendMessage('System', `🎤 Voice Agent: Found ${videos.length} videos`);
                            return `Found ${videos.length} YouTube videos for "${query}". Videos are displayed above for you to play.`;
                        } else {
                            appendMessage('System', '🎤 Voice Agent: No videos found');
                            return `No YouTube videos found for "${query}".`;
                        }
                    } catch (error) {
                        console.error('Voice agent YouTube search error:', error);
                        appendMessage('System', '🎤 Voice Agent: Error searching videos');
                        return `Sorry, I encountered an error while searching for "${query}".`;
                    }
                },
                
                setTimer: async (parameters) => {
                    console.log('Voice agent setting timer:', parameters);
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
                    
                    appendMessage('System', `🎤 Voice Agent: Setting timer for ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`);
                    
                    try {
                        const response = await fetch('http://localhost:3000/api/timer/start', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ seconds })
                        });
                        
                        const data = await response.json();
                        appendMessage('System', `🎤 Voice Agent: Timer started successfully`);
                        return `Timer set for ${Math.floor(seconds/60)} minutes and ${seconds%60} seconds. I'll notify you when it's done.`;
                    } catch (error) {
                        console.error('Voice agent timer error:', error);
                        appendMessage('System', '🎤 Voice Agent: Error setting timer');
                        return "Sorry, I couldn't set the timer. Please try again.";
                    }
                },
                
                convertUnits: async (parameters) => {
                    console.log('Voice agent converting units:', parameters);
                    const { value, from, to, amount, fromUnit, toUnit } = parameters;
                    
                    const convertValue = value || amount;
                    const fromUnitName = from || fromUnit;
                    const toUnitName = to || toUnit;
                    
                    if (!convertValue || !fromUnitName || !toUnitName) {
                        return "Please specify amount, from unit, and to unit for conversion";
                    }
                    
                    appendMessage('System', `🎤 Voice Agent: Converting ${convertValue} ${fromUnitName} to ${toUnitName}`);
                    
                    try {
                        const response = await fetch(`http://localhost:3000/api/convert?value=${convertValue}&from=${fromUnitName}&to=${toUnitName}`);
                        const data = await response.json();
                        
                        if (data.result !== undefined) {
                            appendMessage('System', `🎤 Voice Agent: ${convertValue} ${fromUnitName} = ${data.result} ${toUnitName}`);
                            return `${convertValue} ${fromUnitName} equals ${data.result} ${toUnitName}.`;
                        } else {
                            appendMessage('System', '🎤 Voice Agent: Conversion not supported');
                            return `Sorry, I can't convert from ${fromUnitName} to ${toUnitName}.`;
                        }
                    } catch (error) {
                        console.error('Voice agent conversion error:', error);
                        appendMessage('System', '🎤 Voice Agent: Error converting units');
                        return "Sorry, I encountered an error during conversion.";
                    }
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
        const backendUrl = window.location.hostname === 'localhost' ? 
            'http://localhost:3000' : 
            'https://kitchen-assistant-backend.onrender.com';
        
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
                    'https://kitchen-assistant-backend.onrender.com';
                
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
