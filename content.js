// Create and manage the floating timer UI
let floatingTimerElement = null;
let timerInterval = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let activeSession = {
    isRunning: false,
    startTime: null
};

const STORAGE_KEY = 'studyTimerData';

// --- Utility Functions ---
function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getCurrentDateString() {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

// --- Storage Functions ---
async function getStoredData() {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            const data = result[STORAGE_KEY] || { sessions: [], activeSession: { isRunning: false, startTime: null } };
            if (!data.activeSession) {
                data.activeSession = { isRunning: false, startTime: null };
            }
            resolve(data);
        });
    });
}

async function saveStoredData(data) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: data }, resolve);
    });
}

// --- UI Functions ---
function createFloatingTimer() {
    // Create the main container
    const timerContainer = document.createElement('div');
    timerContainer.className = 'study-timer-floating';
    timerContainer.id = 'studyTimerFloating';
    
    // Create the header with controls
    const header = document.createElement('div');
    header.className = 'study-timer-header';
    
    const title = document.createElement('div');
    title.className = 'study-timer-title';
    title.textContent = 'Study Timer';
    
    const controls = document.createElement('div');
    controls.className = 'study-timer-controls';
    
    const minimizeBtn = document.createElement('button');
    minimizeBtn.className = 'study-timer-control-btn';
    minimizeBtn.id = 'studyTimerMinimize';
    minimizeBtn.innerHTML = '&#8722;'; // Minus sign
    minimizeBtn.title = 'Minimize';
    
    const hideBtn = document.createElement('button');
    hideBtn.className = 'study-timer-control-btn';
    hideBtn.id = 'studyTimerHide';
    hideBtn.innerHTML = '&#10005;'; // X sign
    hideBtn.title = 'Hide';
    
    controls.appendChild(minimizeBtn);
    controls.appendChild(hideBtn);
    
    header.appendChild(title);
    header.appendChild(controls);
    
    // Create the body
    const body = document.createElement('div');
    body.className = 'study-timer-body';
    body.id = 'studyTimerBody';
    
    const timeDisplay = document.createElement('div');
    timeDisplay.className = 'study-timer-time';
    timeDisplay.id = 'studyTimerDisplay';
    timeDisplay.textContent = '00:00:00';
    
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'study-timer-buttons';
    
    const startBtn = document.createElement('button');
    startBtn.className = 'study-timer-btn study-timer-start-btn';
    startBtn.id = 'studyTimerStartBtn';
    startBtn.textContent = 'Start';
    
    const stopBtn = document.createElement('button');
    stopBtn.className = 'study-timer-btn study-timer-stop-btn';
    stopBtn.id = 'studyTimerStopBtn';
    stopBtn.textContent = 'Stop';
    stopBtn.style.display = 'none'; // Hide initially
    
    buttonContainer.appendChild(startBtn);
    buttonContainer.appendChild(stopBtn);
    
    const dailyTotal = document.createElement('div');
    dailyTotal.className = 'study-timer-daily-total';
    dailyTotal.id = 'studyTimerDailyTotal';
    dailyTotal.textContent = 'Today: 00:00:00';
    
    body.appendChild(timeDisplay);
    body.appendChild(buttonContainer);
    body.appendChild(dailyTotal);
    
    // Assemble the timer
    timerContainer.appendChild(header);
    timerContainer.appendChild(body);
    
    // Add to the document
    document.body.appendChild(timerContainer);
    
    return timerContainer;
}

function updateTimerDisplay() {
    const timerDisplay = document.getElementById('studyTimerDisplay');
    if (!timerDisplay) return;
    
    if (activeSession.isRunning && activeSession.startTime) {
        const elapsedSeconds = Math.floor((Date.now() - activeSession.startTime) / 1000);
        timerDisplay.textContent = formatTime(elapsedSeconds);
    } else {
        timerDisplay.textContent = formatTime(0);
    }
}

async function updateDailyTotalDisplay() {
    const dailyTotalElement = document.getElementById('studyTimerDailyTotal');
    if (!dailyTotalElement) return;
    
    const data = await getStoredData();
    const today = getCurrentDateString();
    const todaysSessions = data.sessions.filter(s => s.date === today);
    
    const totalMillisecondsToday = todaysSessions.reduce((sum, s) => sum + s.duration, 0);
    dailyTotalElement.textContent = `Today: ${formatTime(Math.floor(totalMillisecondsToday / 1000))}`;
}

function updateButtonState() {
    const startBtn = document.getElementById('studyTimerStartBtn');
    const stopBtn = document.getElementById('studyTimerStopBtn');
    
    if (!startBtn || !stopBtn) return;
    
    if (activeSession.isRunning) {
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
    } else {
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
    }
}

// --- Timer Logic ---
async function startTimer() {
    if (activeSession.isRunning) return;
    
    activeSession.isRunning = true;
    activeSession.startTime = Date.now();
    
    updateButtonState();
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
    
    const data = await getStoredData();
    data.activeSession = activeSession;
    await saveStoredData(data);
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'timerStarted', activeSession });
}

async function stopTimer() {
    if (!activeSession.isRunning || !activeSession.startTime) return;
    
    clearInterval(timerInterval);
    timerInterval = null;
    
    const endTime = Date.now();
    const duration = endTime - activeSession.startTime;
    
    const newSession = {
        id: activeSession.startTime,
        startTime: activeSession.startTime,
        endTime: endTime,
        duration: duration,
        date: getCurrentDateString()
    };
    
    const data = await getStoredData();
    data.sessions.push(newSession);
    
    activeSession.isRunning = false;
    data.activeSession = activeSession;
    
    await saveStoredData(data);
    
    updateButtonState();
    updateTimerDisplay();
    updateDailyTotalDisplay();
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'timerStopped', session: newSession });
}

// --- Event Handlers ---
function setupEventListeners() {
    // Start button
    const startBtn = document.getElementById('studyTimerStartBtn');
    if (startBtn) {
        startBtn.addEventListener('click', startTimer);
    }
    
    // Stop button
    const stopBtn = document.getElementById('studyTimerStopBtn');
    if (stopBtn) {
        stopBtn.addEventListener('click', stopTimer);
    }
    
    // Minimize button
    const minimizeBtn = document.getElementById('studyTimerMinimize');
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => {
            const timerBody = document.getElementById('studyTimerBody');
            const timerContainer = document.getElementById('studyTimerFloating');
            
            if (timerBody.style.display === 'none') {
                timerBody.style.display = 'block';
                timerContainer.classList.remove('minimized');
                minimizeBtn.innerHTML = '&#8722;'; // Minus sign
            } else {
                timerBody.style.display = 'none';
                timerContainer.classList.add('minimized');
                minimizeBtn.innerHTML = '&#43;'; // Plus sign
            }
            
            // Save state
            chrome.storage.local.set({ 'timerMinimized': timerBody.style.display === 'none' });
        });
    }
    
    // Hide button
    const hideBtn = document.getElementById('studyTimerHide');
    if (hideBtn) {
        hideBtn.addEventListener('click', () => {
            const timerContainer = document.getElementById('studyTimerFloating');
            timerContainer.classList.add('hidden');
            
            // Save state and notify background
            chrome.storage.local.set({ 'timerHidden': true });
            chrome.runtime.sendMessage({ action: 'timerHidden' });
        });
    }
    
    // Make the timer draggable
    const header = document.querySelector('.study-timer-header');
    if (header) {
        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            const timerContainer = document.getElementById('studyTimerFloating');
            
            // Get the current position of the timer
            const rect = timerContainer.getBoundingClientRect();
            
            // Calculate the offset from the mouse position to the top-left corner of the timer
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            
            timerContainer.classList.add('dragging');
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const timerContainer = document.getElementById('studyTimerFloating');
            if (!timerContainer) return;
            
            // Calculate new position
            const newX = e.clientX - dragOffsetX;
            const newY = e.clientY - dragOffsetY;
            
            // Apply new position
            timerContainer.style.left = `${Math.max(0, newX)}px`;
            timerContainer.style.top = `${Math.max(0, newY)}px`;
            timerContainer.style.right = 'auto'; // Override default right positioning
        });
        
        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            
            isDragging = false;
            const timerContainer = document.getElementById('studyTimerFloating');
            if (timerContainer) {
                timerContainer.classList.remove('dragging');
                
                // Save position
                const rect = timerContainer.getBoundingClientRect();
                chrome.storage.local.set({
                    'timerPosition': {
                        left: rect.left,
                        top: rect.top
                    }
                });
            }
        });
    }
}

// --- Initialization ---
async function initializeFloatingTimer() {
    console.log('Initializing floating timer');
    
    // Check if timer should be shown
    const { timerHidden = false } = await chrome.storage.local.get('timerHidden');
    console.log('Timer hidden state:', timerHidden);
    
    if (timerHidden) {
        // Don't create the timer if it's hidden
        console.log('Timer is hidden, not creating UI');
        return;
    }
    
    // Check if timer already exists
    if (document.getElementById('studyTimerFloating')) {
        console.log('Timer already exists, not creating a duplicate');
        return;
    }
    
    // Create the floating timer
    console.log('Creating floating timer UI');
    floatingTimerElement = createFloatingTimer();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load saved position
    const { timerPosition } = await chrome.storage.local.get('timerPosition');
    if (timerPosition) {
        floatingTimerElement.style.left = `${timerPosition.left}px`;
        floatingTimerElement.style.top = `${timerPosition.top}px`;
        floatingTimerElement.style.right = 'auto'; // Override default right positioning
    }
    
    // Load minimized state
    const { timerMinimized = false } = await chrome.storage.local.get('timerMinimized');
    if (timerMinimized) {
        const timerBody = document.getElementById('studyTimerBody');
        const minimizeBtn = document.getElementById('studyTimerMinimize');
        
        if (timerBody && minimizeBtn) {
            timerBody.style.display = 'none';
            floatingTimerElement.classList.add('minimized');
            minimizeBtn.innerHTML = '&#43;'; // Plus sign
        }
    }
    
    // Load timer state
    const data = await getStoredData();
    activeSession = data.activeSession;
    
    // Update UI based on loaded state
    updateButtonState();
    updateTimerDisplay();
    updateDailyTotalDisplay();
    
    // Start interval if timer was running
    if (activeSession.isRunning && activeSession.startTime) {
        timerInterval = setInterval(updateTimerDisplay, 1000);
    }
}

// Listen for messages from background script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message.action);
    
    if (message.action === 'showTimer') {
        if (!floatingTimerElement) {
            console.log('Creating new floating timer');
            initializeFloatingTimer();
        } else {
            console.log('Showing existing floating timer');
            floatingTimerElement.classList.remove('hidden');
            chrome.storage.local.set({ 'timerHidden': false });
        }
    } else if (message.action === 'hideTimer') {
        if (floatingTimerElement) {
            console.log('Hiding floating timer');
            floatingTimerElement.classList.add('hidden');
            chrome.storage.local.set({ 'timerHidden': true });
        }
    } else if (message.action === 'updateTimerState') {
        console.log('Updating timer state:', message.activeSession);
        activeSession = message.activeSession;
        updateButtonState();
        updateTimerDisplay();
        updateDailyTotalDisplay();
        
        // Update interval
        if (activeSession.isRunning && !timerInterval) {
            timerInterval = setInterval(updateTimerDisplay, 1000);
        } else if (!activeSession.isRunning && timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }
    
    sendResponse({ success: true });
    return true;
});

// Initialize when the content script loads
// Wait for DOM to be fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFloatingTimer);
} else {
    // DOM already loaded, initialize immediately
    initializeFloatingTimer();
}

// Also set a timeout to ensure the timer is initialized even if there are other scripts interfering
setTimeout(() => {
    if (!document.getElementById('studyTimerFloating')) {
        console.log('Delayed initialization of floating timer');
        initializeFloatingTimer();
    }
}, 1000);
