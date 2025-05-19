// Background script for Study Timer extension
const STORAGE_KEY = 'studyTimerData';

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'timerStarted' || message.action === 'timerStopped') {
        // Sync timer state across all tabs
        syncTimerStateToAllTabs(message.action === 'timerStarted' ? message.activeSession : { isRunning: false, startTime: null });
    } else if (message.action === 'timerHidden') {
        // Do nothing, state is already saved in storage
    } else if (message.action === 'toggleFloatingTimer') {
        toggleFloatingTimer();
    }
    
    sendResponse({ success: true });
    return true;
});

// Listen for tab updates to ensure timer is shown on new pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
        // Check if timer should be shown
        chrome.storage.local.get('timerHidden', (result) => {
            const isHidden = result.timerHidden || false;
            if (!isHidden) {
                // Show timer on this tab
                chrome.tabs.sendMessage(tabId, { action: 'showTimer' })
                    .catch(() => {
                        // Ignore errors for tabs that don't have our content script
                    });
            }
        });
    }
});

// Sync timer state to all tabs
async function syncTimerStateToAllTabs(activeSession) {
    // Get all tabs
    const tabs = await chrome.tabs.query({});
    
    // Send message to all tabs
    tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
            action: 'updateTimerState',
            activeSession
        }).catch(() => {
            // Ignore errors for tabs that don't have our content script
        });
    });
}

// Toggle floating timer visibility
async function toggleFloatingTimer() {
    const { timerHidden = false } = await chrome.storage.local.get('timerHidden');
    
    // Toggle state
    const newState = !timerHidden;
    chrome.storage.local.set({ 'timerHidden': newState });
    
    // Send message to all tabs
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
        if (tab.url && tab.url.startsWith('http')) {
            chrome.tabs.sendMessage(tab.id, {
                action: newState ? 'hideTimer' : 'showTimer'
            }).catch(() => {
                // Ignore errors for tabs that don't have our content script
            });
        }
    });
    
    console.log(`Floating timer ${newState ? 'hidden' : 'shown'}`);
}

// Handle extension installation or update
chrome.runtime.onInstalled.addListener(() => {
    // Initialize storage with default values if needed
    chrome.storage.local.get([STORAGE_KEY], (result) => {
        if (!result[STORAGE_KEY]) {
            chrome.storage.local.set({
                [STORAGE_KEY]: {
                    sessions: [],
                    activeSession: { isRunning: false, startTime: null }
                }
            });
        }
    });
});
