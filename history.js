document.addEventListener('DOMContentLoaded', () => {
    const monthSelector = document.getElementById('monthSelector');
    const totalTimeDisplay = document.getElementById('totalTimeDisplay');
    const totalDaysStudied = document.getElementById('totalDaysStudied');
    const totalSessions = document.getElementById('totalSessions');
    const avgSessionLength = document.getElementById('avgSessionLength');
    const longestSession = document.getElementById('longestSession');
    const sessionsTableBody = document.getElementById('sessionsTableBody');
    const sessionsTableWrapper = document.getElementById('sessionsTableWrapper');
    const noSessionsMessage = document.getElementById('noSessionsMessage');

    const STORAGE_KEY = 'studyTimerData';
    let allSessions = [];

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

    function formatDateForDisplay(dateString) {
        const date = new Date(dateString);
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString(undefined, options);
    }

    function getMonthYearString(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
    }

    // --- Storage Functions ---
    async function getStoredData() {
        return new Promise((resolve) => {
            chrome.storage.local.get([STORAGE_KEY], (result) => {
                const data = result[STORAGE_KEY] || { sessions: [], activeSession: { isRunning: false, startTime: null } };
                resolve(data);
            });
        });
    }

    // --- Data Processing Functions ---
    function groupSessionsByDate(sessions) {
        const grouped = {};
        
        sessions.forEach(session => {
            if (!grouped[session.date]) {
                grouped[session.date] = [];
            }
            grouped[session.date].push(session);
        });
        
        // Sort each day's sessions by start time (newest first)
        Object.keys(grouped).forEach(date => {
            grouped[date].sort((a, b) => b.startTime - a.startTime);
        });
        
        return grouped;
    }

    function getUniqueMonths(sessions) {
        const months = new Set();
        
        sessions.forEach(session => {
            const date = new Date(session.date);
            const monthYear = date.toISOString().substring(0, 7); // YYYY-MM format
            months.add(monthYear);
        });
        
        return Array.from(months).sort().reverse(); // Sort newest first
    }

    function filterSessionsByMonth(sessions, monthYear) {
        if (monthYear === 'all') return sessions;
        
        return sessions.filter(session => {
            const date = new Date(session.date);
            const sessionMonthYear = date.toISOString().substring(0, 7); // YYYY-MM format
            return sessionMonthYear === monthYear;
        });
    }

    function calculateStats(sessions) {
        if (sessions.length === 0) {
            return {
                totalTime: 0,
                daysStudied: 0,
                sessionCount: 0,
                avgSessionLength: 0,
                longestSession: 0
            };
        }

        const totalTime = sessions.reduce((sum, session) => sum + session.duration, 0);
        const uniqueDays = new Set(sessions.map(session => session.date)).size;
        const sessionCount = sessions.length;
        const avgLength = totalTime / sessionCount;
        const longestSessionTime = Math.max(...sessions.map(session => session.duration));

        return {
            totalTime,
            daysStudied: uniqueDays,
            sessionCount,
            avgSessionLength: avgLength,
            longestSession: longestSessionTime
        };
    }

    // --- UI Functions ---
    function populateMonthSelector(sessions) {
        const months = getUniqueMonths(sessions);
        
        // Clear existing options except "All Time"
        while (monthSelector.options.length > 1) {
            monthSelector.remove(1);
        }
        
        // Add month options
        months.forEach(monthYear => {
            const date = new Date(monthYear + '-01'); // Create a date from YYYY-MM-01
            const option = document.createElement('option');
            option.value = monthYear;
            option.textContent = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
            monthSelector.appendChild(option);
        });
    }

    function renderSessionsList(sessions) {
        sessionsTableBody.innerHTML = '';
        
        if (sessions.length === 0) {
            sessionsTableWrapper.style.display = 'none';
            noSessionsMessage.style.display = 'block';
            return;
        }
        
        sessionsTableWrapper.style.display = 'block';
        noSessionsMessage.style.display = 'none';
        
        // Group sessions by date
        const sessionsByDate = groupSessionsByDate(sessions);
        
        // Process each date group
        Object.keys(sessionsByDate).sort().reverse().forEach(date => {
            const sessionsForDay = sessionsByDate[date];
            
            // Calculate total time for this day
            const dailyTotalTime = sessionsForDay.reduce((sum, session) => sum + session.duration, 0);
            
            // Create a header row for the date with total time
            const dateHeaderRow = document.createElement('tr');
            dateHeaderRow.className = 'date-header-row';
            
            // Format date
            const sessionDate = new Date(date);
            const dateFormatted = sessionDate.toLocaleDateString(undefined, { 
                weekday: 'short',
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
            
            // Add date header with total time for the day
            dateHeaderRow.innerHTML = `
                <td colspan="4" class="date-header">
                    <div class="date-header-content">
                        <span class="date-header-text">${dateFormatted}</span>
                        <span class="daily-total-time">Total: ${formatDurationForLog(dailyTotalTime)}</span>
                    </div>
                </td>
            `;
            
            sessionsTableBody.appendChild(dateHeaderRow);
            
            // Add individual sessions for this day
            sessionsForDay.forEach(session => {
                const row = document.createElement('tr');
                
                // Format times
                const startTimeStr = new Date(session.startTime).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit'
                });
                
                // Create table row
                row.innerHTML = `
                    <td class="column-date"></td>
                    <td class="column-start-time">${startTimeStr}</td>
                    <td class="column-duration">${formatDurationForLog(session.duration)}</td>
                    <td class="column-task">Study Session</td>
                `;
                
                sessionsTableBody.appendChild(row);
            });
        });
    }

    function updateStatsDisplay(stats) {
        totalTimeDisplay.textContent = formatTime(Math.floor(stats.totalTime / 1000));
        totalDaysStudied.textContent = stats.daysStudied;
        totalSessions.textContent = stats.sessionCount;
        avgSessionLength.textContent = formatDurationForLog(stats.avgSessionLength);
        longestSession.textContent = formatDurationForLog(stats.longestSession);
    }

    function updateUI(selectedMonth = 'all') {
        const filteredSessions = filterSessionsByMonth(allSessions, selectedMonth);
        const stats = calculateStats(filteredSessions);
        
        renderSessionsList(filteredSessions);
        updateStatsDisplay(stats);
        
        // Log data for debugging
        console.log('All sessions:', allSessions);
        console.log('Filtered sessions:', filteredSessions);
        console.log('Stats:', stats);
    }

    // --- Event Handlers ---
    monthSelector.addEventListener('change', () => {
        updateUI(monthSelector.value);
    });

    // --- Initialization ---
    async function initializeHistoryPage() {
        const data = await getStoredData();
        allSessions = data.sessions || [];
        
        if (allSessions.length > 0) {
            populateMonthSelector(allSessions);
            updateUI('all'); // Show all sessions by default
        } else {
            noSessionsMessage.style.display = 'block';
            updateStatsDisplay({
                totalTime: 0,
                daysStudied: 0,
                sessionCount: 0,
                avgSessionLength: 0,
                longestSession: 0
            });
        }
    }

    initializeHistoryPage();
});
