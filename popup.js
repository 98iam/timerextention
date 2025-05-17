document.addEventListener('DOMContentLoaded', () => {
    const currentTimerDisplay = document.getElementById('currentTimerDisplay');
    const startStopButton = document.getElementById('startStopButton');
    const totalDailyTimeDisplay = document.getElementById('totalDailyTimeDisplay');
    const sessionLogElement = document.getElementById('sessionLog');
    const noSessionsMessage = document.getElementById('noSessionsMessage');
    const resetButton = document.getElementById('resetButton');

    let timerInterval = null;
    let activeSession = {
        isRunning: false,
        startTime: null, // Timestamp when the current session *actually* started
    };

    const STORAGE_KEY = 'studyTimerData';

    // --- Utility Functions ---
    function formatTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function formatDurationForLog(milliseconds) {
        if (milliseconds < 0) milliseconds = 0;
        let totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        totalSeconds %= 3600;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        let durationString = "";
        if (hours > 0) durationString += `${hours}h `;
        if (minutes > 0 || hours > 0) durationString += `${minutes}m `; // show 0m if hours present
        durationString += `${seconds}s`;
        return durationString.trim();
    }

    function getCurrentDateString() {
        return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    }

    // --- Storage Functions ---
    async function getStoredData() {
        return new Promise((resolve) => {
            chrome.storage.local.get([STORAGE_KEY], (result) => {
                const data = result[STORAGE_KEY] || { sessions: [], activeSession: { isRunning: false, startTime: null } };
                // Ensure activeSession is well-formed
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

    // --- UI Update Functions ---
    function updateCurrentTimerDisplay() {
        if (activeSession.isRunning && activeSession.startTime) {
            const elapsedSeconds = Math.floor((Date.now() - activeSession.startTime) / 1000);
            currentTimerDisplay.textContent = formatTime(elapsedSeconds);
        } else {
            currentTimerDisplay.textContent = formatTime(0);
        }
    }

    function updateStartStopButtonUI() {
        if (activeSession.isRunning) {
            startStopButton.textContent = 'Stop Study';
            startStopButton.classList.remove('bg-green-500', 'hover:bg-green-600');
            startStopButton.classList.add('bg-red-500', 'hover:bg-red-600');
            currentTimerDisplay.classList.remove('text-gray-500'); // In case it was set before start
            currentTimerDisplay.classList.add('text-green-400');
        } else {
            startStopButton.textContent = 'Start Study';
            startStopButton.classList.remove('bg-red-500', 'hover:bg-red-600');
            startStopButton.classList.add('bg-green-500', 'hover:bg-green-600');
            // If not running and no startTime (truly stopped), reflect that
            if (!activeSession.startTime) {
                currentTimerDisplay.classList.remove('text-green-400');
                // currentTimerDisplay.classList.add('text-gray-500'); // Or keep green for last stopped time
            }
        }
    }

    async function renderSessionLog() {
        const data = await getStoredData();
        const today = getCurrentDateString();
        const todaysSessions = data.sessions.filter(s => s.date === today);

        sessionLogElement.innerHTML = ''; // Clear previous entries
        if (todaysSessions.length === 0) {
            noSessionsMessage.style.display = 'block';
        } else {
            noSessionsMessage.style.display = 'none';
            todaysSessions.sort((a, b) => b.startTime - a.startTime); // Show most recent first
            todaysSessions.forEach(session => {
                const sessionDiv = document.createElement('div');
                sessionDiv.className = 'bg-gray-700 p-3 rounded text-xs shadow-md mb-2';

                const startTimeStr = new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const endTimeStr = new Date(session.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const durationStr = formatDurationForLog(session.duration);

                sessionDiv.innerHTML = `
                    <p class="font-semibold text-gray-300">
                        <span class="text-blue-400">Start:</span> ${startTimeStr} |
                        <span class="text-blue-400">End:</span> ${endTimeStr}
                    </p>
                    <p class="text-gray-400">
                        <span class="text-green-400">Duration:</span> ${durationStr}
                    </p>
                `;
                sessionLogElement.appendChild(sessionDiv);
            });
        }
    }

    async function updateTotalDailyTimeUI() {
        const data = await getStoredData();
        const today = getCurrentDateString();
        const todaysSessions = data.sessions.filter(s => s.date === today);

        const totalMillisecondsToday = todaysSessions.reduce((sum, s) => sum + s.duration, 0);
        totalDailyTimeDisplay.textContent = formatTime(Math.floor(totalMillisecondsToday / 1000));
    }


    // --- Timer Logic ---
    async function startTimer() {
        if (activeSession.isRunning) return; // Already running

        activeSession.isRunning = true;
        activeSession.startTime = Date.now(); // Always start fresh or resume from this point
        
        updateStartStopButtonUI();
        updateCurrentTimerDisplay(); // Initial display
        timerInterval = setInterval(updateCurrentTimerDisplay, 1000);

        const data = await getStoredData();
        data.activeSession = activeSession;
        await saveStoredData(data);
    }

    async function stopTimer() {
        if (!activeSession.isRunning || !activeSession.startTime) return; // Not running or no start time

        clearInterval(timerInterval);
        timerInterval = null;

        const endTime = Date.now();
        const duration = endTime - activeSession.startTime;

        const newSession = {
            id: activeSession.startTime, // Use startTime as a simple ID
            startTime: activeSession.startTime,
            endTime: endTime,
            duration: duration,
            date: getCurrentDateString()
        };

        const data = await getStoredData();
        data.sessions.push(newSession);
        
        activeSession.isRunning = false;
        // activeSession.startTime = null; // Clear start time as session is now logged
                                      // No, keep it so if user clicks start again without refresh, it uses last know active state

        data.activeSession = activeSession; // Save isRunning: false state

        await saveStoredData(data);

        updateStartStopButtonUI();
        updateCurrentTimerDisplay(); // Shows the final time of the stopped session
        renderSessionLog();
        updateTotalDailyTimeUI();
    }

    // --- Event Handlers ---
    startStopButton.addEventListener('click', () => {
        if (activeSession.isRunning) {
            stopTimer();
        } else {
            startTimer();
        }
    });

    // History button event handler
    const historyButton = document.getElementById('historyButton');
    historyButton.addEventListener('click', () => {
        chrome.tabs.create({ url: 'history.html' });
    });

    resetButton.addEventListener('click', async () => {
        if (confirm("Are you sure you want to reset all of today's study data? This cannot be undone.")) {
            if (activeSession.isRunning) {
                clearInterval(timerInterval); // Stop interval if running
                timerInterval = null;
            }

            activeSession.isRunning = false;
            activeSession.startTime = null;
            
            const data = await getStoredData();
            const today = getCurrentDateString();
            data.sessions = data.sessions.filter(s => s.date !== today); // Keep non-today sessions
            data.activeSession = activeSession; // Save reset activeSession
            await saveStoredData(data);

            updateStartStopButtonUI();
            updateCurrentTimerDisplay(); // Resets to 00:00:00
            renderSessionLog();
            updateTotalDailyTimeUI(); // Resets total to 00:00:00
            console.log("Today's data reset.");
        }
    });


    // --- Initialization ---
    async function initializePopup() {
        const data = await getStoredData();
        activeSession = data.activeSession; // Load the stored active session state

        if (activeSession.isRunning && activeSession.startTime) {
            // Timer was running when popup was last closed, resume it
            updateStartStopButtonUI();
            updateCurrentTimerDisplay(); // Calculate and show current elapsed time
            timerInterval = setInterval(updateCurrentTimerDisplay, 1000);
        } else {
            // Timer was not running or no session had started
            activeSession.isRunning = false; // Ensure clean state
            // activeSession.startTime = null; // Optional: if you want currentTimerDisplay to be 0
            updateStartStopButtonUI();
            updateCurrentTimerDisplay(); // Will show 0 or last stopped time
        }

        renderSessionLog();
        updateTotalDailyTimeUI();
    }

    initializePopup();
});