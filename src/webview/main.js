// src/webview/main.js

// @ts-ignore (Ignore TS error for acquireVsCodeApi)
const vscode = acquireVsCodeApi();

// Function to send logs/errors to the extension
function logToExtension(level, message, errorObj = null) {
    console[level]('[WebView]', message, errorObj || ''); // Also log to webview console
    vscode.postMessage({
        type: 'webviewLog',
        level: level, // 'log', 'error', 'warn', 'info'
        message: `[WebView] ${message}`,
        error: errorObj ? JSON.stringify(errorObj, Object.getOwnPropertyNames(errorObj)) : null
    });
}

try {
    logToExtension('info', 'WebView main.js script started.');

    document.addEventListener('DOMContentLoaded', () => {
        logToExtension('info', 'DOMContentLoaded event fired.');

        const toggleRecordingButton = document.getElementById('toggleRecordingButton');
        const statusDiv = document.getElementById('status');
        const transcriptContainer = document.getElementById('transcriptContainer');

        if (!toggleRecordingButton) {logToExtension('error', 'toggleRecordingButton not found!');}
        if (!statusDiv) {logToExtension('error', 'statusDiv not found!');}
        if (!transcriptContainer) {logToExtension('error', 'transcriptContainer not found!');}

        let recognition;
        let isRecording = false;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const speechSynthesis = window.speechSynthesis;

        if (!SpeechRecognition) {
            const msg = 'Speech Recognition API not supported in this browser.';
            logToExtension('error', msg);
            if (statusDiv) {
                statusDiv.textContent = `Status: ${msg}`;
                statusDiv.style.color = 'red';
            }
            if (toggleRecordingButton) {toggleRecordingButton.disabled = true;}
            return; // Stop further execution if STT not supported
        }
        logToExtension('info', 'SpeechRecognition API is available.');

        if (!speechSynthesis) {
            logToExtension('warn', 'Speech Synthesis API not supported. Sky will not be able to speak.');
        } else {
            logToExtension('info', 'SpeechSynthesis API is available.');
        }

        try {
            recognition = new SpeechRecognition();
            logToExtension('info', 'SpeechRecognition instance created.');
        } catch (e) {
            logToExtension('error', 'Failed to create SpeechRecognition instance.', e);
            if (statusDiv) {statusDiv.textContent = 'Status: Error creating speech recognizer.';}
            return;
        }

        recognition.interimResults = true;
        recognition.continuous = false; // Stops after first utterance for simplicity now
        recognition.lang = 'en-US';

        let currentFinalTranscriptForTurn = ''; // Accumulates final transcript for current speaking turn

        recognition.onstart = () => {
            logToExtension('info', 'SpeechRecognition started (onstart event).');
            isRecording = true;
            if (statusDiv) {statusDiv.textContent = 'Status: Listening...';}
            if (toggleRecordingButton) {
                toggleRecordingButton.textContent = 'Stop Listening';
            }
            currentFinalTranscriptForTurn = ''; // Reset for new turn
        };

        recognition.onresult = (event) => {
            logToExtension('info', 'SpeechRecognition onresult event.', { resultIndex: event.resultIndex, resultsLength: event.results.length });
            let interimTranscript = '';
            let latestFinalPiece = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    latestFinalPiece += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            
            currentFinalTranscriptForTurn += latestFinalPiece; // Append new final pieces

            if (latestFinalPiece) {
                 logToExtension('info', 'Final piece received:', latestFinalPiece);
            }
            if (interimTranscript) {
                // Display interim transcript (optional, can be noisy)
                // statusDiv.textContent = `Status: Listening... (thinking: ${interimTranscript})`;
                logToExtension('info', 'Interim transcript:', interimTranscript);
            }
        };

        recognition.onerror = (event) => {
            logToExtension('error', 'SpeechRecognition onerror event.', event.error);
            if (statusDiv) {
                statusDiv.textContent = `Status: Error - ${event.error}`;
                if (event.error === 'no-speech') {statusDiv.textContent = 'Status: No speech detected.';}
                else if (event.error === 'audio-capture') {statusDiv.textContent = 'Status: Microphone problem.';}
                else if (event.error === 'not-allowed') {statusDiv.textContent = 'Status: Mic access denied.';}
            }
            stopRecordingInternal(); // Clean up state
        };

        recognition.onend = () => {
            logToExtension('info', 'SpeechRecognition onend event. Current final transcript for turn: "' + currentFinalTranscriptForTurn + '"');
            // This 'onend' fires after recognition stops (e.g., after a pause if continuous=false, or when stop() is called)
            // If there's a final transcript accumulated for this turn, send it.
            if (currentFinalTranscriptForTurn.trim()) {
                const textToSend = currentFinalTranscriptForTurn.trim();
                logToExtension('info', 'Sending final transcript to extension:', textToSend);
                
                const pUser = document.createElement('p');
                pUser.innerHTML = `<strong>You:</strong> ${textToSend}`;
                if (transcriptContainer) {transcriptContainer.appendChild(pUser);}
                scrollToBottom();

                vscode.postMessage({
                    type: 'sendToGemini',
                    text: textToSend
                });
            }
            currentFinalTranscriptForTurn = ''; // Reset for the next potential turn
            stopRecordingInternal(); // Ensure UI and state are reset
        };

        function startRecordingInternal() {
            if (!recognition) {
                logToExtension('error', 'Cannot start: recognition instance is null.');
                return;
            }
            if (!isRecording) {
                logToExtension('info', 'Attempting to start SpeechRecognition...');
                try {
                    // Clear previous "You:" message before starting new recognition.
                    // More targeted clearing might be needed if you want to keep Sky's responses.
                    // transcriptContainer.innerHTML = ''; // Simple clear for now

                    recognition.start();
                    // onstart event will handle UI updates
                } catch (e) {
                    logToExtension('error', 'Error calling recognition.start(). Might be already started or another issue.', e);
                    // If it's 'InvalidStateError', it means it was already started or in a state that doesn't allow start.
                    if (e.name === 'InvalidStateError' && statusDiv) {
                         statusDiv.textContent = 'Status: Listening (already)...';
                    } else if (statusDiv) {
                         statusDiv.textContent = 'Status: Error starting mic.';
                    }
                    stopRecordingInternal(); // Reset state if start failed
                }
            } else {
                logToExtension('warn', 'startRecordingInternal called while already recording.');
            }
        }

        function stopRecordingInternal() {
            if (!recognition) {
                logToExtension('error', 'Cannot stop: recognition instance is null.');
                // return; // Allow UI to reset anyway
            }
            if (isRecording) { // Only call recognition.stop() if we think it's active
                logToExtension('info', 'Attempting to stop SpeechRecognition...');
                try {
                    recognition.stop();
                } catch (e) {
                    logToExtension('error', 'Error calling recognition.stop()', e);
                }
            }
            // Always reset UI and state regardless of whether .stop() was called or threw error
            isRecording = false;
            if (statusDiv) { statusDiv.textContent = 'Status: Idle';}
            if (toggleRecordingButton) {
                toggleRecordingButton.textContent = 'Start Listening';
            }
        }

        if (toggleRecordingButton) {
            toggleRecordingButton.addEventListener('click', () => {
                logToExtension('info', 'Toggle Recording Button clicked. isRecording: ' + isRecording);
                if (isRecording) {
                    stopRecordingInternal();
                } else {
                    startRecordingInternal();
                }
            });
        } else {
            logToExtension('error', 'toggleRecordingButton event listener NOT attached because button was not found.');
        }

        // Handle messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            logToExtension('info', 'Message received from extension:', message);
            switch (message.type) {
                case 'geminiResponse':
                    if (message.text) {
                        displaySkyResponse(message.text);
                        speakText(message.text);
                    } else {
                        logToExtension('warn', 'geminiResponse message received without text.', message);
                    }
                    break;
                // Add other message types from extension to webview later
            }
        });

        function displaySkyResponse(text) {
            logToExtension('info', 'Displaying Sky response:', text);
            const pSky = document.createElement('p');
            pSky.innerHTML = `<strong>Sky:</strong> ${text}`;
            if (transcriptContainer) {
                transcriptContainer.appendChild(pSky);
                scrollToBottom();
            }
        }

        function speakText(text) {
            if (!speechSynthesis) {
                logToExtension('warn', 'Cannot speakText: speechSynthesis not available.');
                return;
            }
            logToExtension('info', 'Attempting to speak text:', text);
            try {
                speechSynthesis.cancel(); // Cancel any previous speech
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'en-US';
                utterance.rate = 1;
                utterance.pitch = 1;

                utterance.onstart = () => logToExtension('info', 'SpeechSynthesis onstart event.');
                utterance.onend = () => {
                    logToExtension('info', 'SpeechSynthesis onend event.');
                    if (statusDiv && !isRecording) {statusDiv.textContent = 'Status: Idle';}
                };
                utterance.onerror = (event) => {
                    logToExtension('error', 'SpeechSynthesis onerror event.', event.error);
                    if (statusDiv) {statusDiv.textContent = 'Status: Error speaking.';}
                };
                speechSynthesis.speak(utterance);
            } catch (e) {
                logToExtension('error', 'Error in speakText function', e);
            }
        }

        function scrollToBottom() {
            if (transcriptContainer) {
                transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
            }
        }

        logToExtension('info', 'WebView main.js listeners attached and setup complete.');
    });

} catch (e) {
    // Catch any top-level errors during script execution (before DOMContentLoaded)
    logToExtension('error', 'Top-level error in main.js.', e);
    // Try to display this error in the status div if the DOM is somewhat available
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.textContent = 'FATAL ERROR IN WEBVIEW JS. See Debug Console.';
        statusDiv.style.color = 'red';
    }
}