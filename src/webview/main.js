// src/webview/main.js

// This script runs inside the VS Code WebView panel.

// The `acquireVsCodeApi` function is a special function provided by VS Code
// to WebViews. It returns an object that allows the WebView to communicate
// back to the extension host (your TypeScript extension code).
// It can only be called once per session.
// @ts-ignore - We inform TypeScript to ignore an error here because `acquireVsCodeApi`
// is globally available in the WebView context but not typically known to standalone TS/JS checking.
const vscode = acquireVsCodeApi();

// This event listener ensures that the script runs only after the entire HTML
// document has been fully loaded and parsed. This prevents errors from trying
// to access DOM elements that don't exist yet.
document.addEventListener('DOMContentLoaded', () => {
  // --- 1. Get References to HTML Elements ---
  // We'll interact with these elements to update the UI and handle events.
  const userInputElement = document.getElementById('userInput'); // The <textarea> for user input
  const sendButtonElement = document.getElementById('sendButton'); // The send button
  const chatMessagesContainer = document.getElementById('chat-messages'); // The <div> to display messages
  const loadingIndicatorElement = document.getElementById('loading-indicator'); // The "thinking" animation
  // const skyVisualOrbElement = document.getElementById('sky-visual-orb'); // For future orb animation

  // Log to confirm the script has started and DOM is ready (useful for debugging WebView issues).
  // These logs will appear in the WebView Developer Tools console.
  console.log('[WebView] main.js script started.');
  console.log('[WebView] DOMContentLoaded event fired.');


  // --- 2. Helper Function to Send Message to Extension ---
  function sendMessageToExtension() {
    // Get the text from the textarea, removing leading/trailing whitespace.
    const messageText = userInputElement.value.trim();

    if (messageText) {
      // A. Display the user's message immediately in the UI.
      appendMessageToChat(messageText, 'user');

      // B. Clear the textarea.
      userInputElement.value = '';
      // Reset textarea height after clearing (for auto-resize).
      userInputElement.style.height = 'auto';
      // Optionally, keep focus on the input field.
      userInputElement.focus();

      // C. Show the loading indicator ("Sky is thinking...").
      if (loadingIndicatorElement) {
        loadingIndicatorElement.style.display = 'flex'; // 'flex' because we used flex for centering in CSS
      }
      // We could also animate the #sky-visual-orb here to indicate thinking.

      // D. Send the message text to the extension host.
      // The extension (extension.ts) is listening for messages of this 'type'.
      vscode.postMessage({
        type: 'sendToGemini', // Matches the type handled in extension.ts
        text: messageText,
      });
      console.log(`[WebView] Sent to extension: "${messageText}"`);
    } else {
      console.log('[WebView] User tried to send an empty message.');
    }
  }

  // --- 3. Event Listeners for User Input ---

  // Add click event listener to the send button.
  if (sendButtonElement) {
    sendButtonElement.addEventListener('click', () => {
      console.log('[WebView] Send button clicked.');
      sendMessageToExtension();
    });
  } else {
    console.error('[WebView] Send button element not found.');
  }

  // Add keypress event listener to the textarea for "Enter" to send.
  if (userInputElement) {
    userInputElement.addEventListener('keypress', (event) => {
      // Check if 'Enter' key was pressed AND 'Shift' key was NOT pressed
      // (Shift + Enter usually means new line in textarea).
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Prevent default action (e.g., adding a new line).
        console.log('[WebView] Enter key pressed in textarea.');
        sendMessageToExtension();
      }
    });

    // Add input event listener for auto-resizing the textarea height.
    userInputElement.addEventListener('input', () => {
      userInputElement.style.height = 'auto'; // Reset height to shrink if text is deleted.
      // Set height to scrollHeight to fit content, up to its CSS maxHeight.
      userInputElement.style.height = `${userInputElement.scrollHeight}px`;
    });
  } else {
    console.error('[WebView] User input textarea element not found.');
  }


  // --- 4. Event Listener for Messages from the Extension ---
  // This handles messages sent from extension.ts (e.g., Gemini's response).
  window.addEventListener('message', (event) => {
    const message = event.data; // The data object sent from the extension.
    console.log('[WebView] Received message from extension:', message);

    // Always hide loading indicator when a response (or any message) arrives.
    if (loadingIndicatorElement) {
      loadingIndicatorElement.style.display = 'none';
    }
    // We could also stop any "thinking" animation on #sky-visual-orb here.

    switch (message.type) {
      case 'geminiResponse':
        // Display Sky's response in the chat.
        // `message.isError` is a flag we might send from extension.ts if Gemini call failed.
        appendMessageToChat(message.text, 'sky', message.isError);
        break;
      case 'info': // Example of another message type for general info from extension
        appendMessageToChat(message.text, 'info'); // 'info' can be a different style
        break;
      // Add more cases here to handle other types of messages from the extension.
      default:
        console.warn(`[WebView] Received unknown message type from extension: ${message.type}`);
    }
  });


  // --- 5. Helper Function to Append Messages to the Chat UI ---
  // `text`: The message content.
  // `sender`: 'user' or 'sky' (or 'info', 'error') to apply different CSS classes.
  // `isError`: Optional boolean to style error messages from Sky differently.
  function appendMessageToChat(text, sender, isError = false) {
    if (!chatMessagesContainer) {
      console.error('[WebView] Chat messages container not found. Cannot append message.');
      return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message'); // Common class for all messages

    if (sender === 'user') {
      messageDiv.classList.add('user-message');
      const p = document.createElement('p');
      p.textContent = text;
      messageDiv.appendChild(p);
    } else if (sender === 'sky') {
      messageDiv.classList.add('sky-message');
      if (isError) {
        // Optionally, add a specific class for Sky's error messages if you want distinct styling.
        // messageDiv.classList.add('sky-error-message');
        // For now, just display the error text normally.
        const p = document.createElement('p');
        p.textContent = text; // Error text from extension.ts already includes "Sorry..."
        messageDiv.appendChild(p);
      } else {
        // Basic Markdown-like handling for code blocks (```code```)
        // This is a very simplified parser. For robust Markdown, use a library.
        const parts = text.split(/```([\s\S]*?)```/g); // Regex to find ```code``` blocks

        parts.forEach((part, index) => {
          if (index % 2 === 1) { // This part is code (content between ```)
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            // Very basic language detection (e.g., ```python\n... )
            const langMatch = part.match(/^(\w+)\n/);
            let codeContent = part;
            if (langMatch) {
              // If a language is specified (e.g., "python"), add it as a class for potential syntax highlighting.
              code.className = `language-${langMatch[1].toLowerCase()}`;
              // Remove the language line from the actual code content.
              codeContent = part.substring(langMatch[0].length);
            }
            code.textContent = codeContent.trim(); // The actual code
            pre.appendChild(code);
            messageDiv.appendChild(pre);
          } else { // This part is regular text
            if (part.trim()) { // Only add if there's non-whitespace text
              const p = document.createElement('p');
              p.textContent = part.trim();
              messageDiv.appendChild(p);
            }
          }
        });
        // If, after parsing, messageDiv is empty (e.g. input was only "``` ```"), fallback to raw text
        if (messageDiv.innerHTML.trim() === "" && text.trim() !== "") {
            const p = document.createElement('p');
            p.textContent = text;
            messageDiv.appendChild(p);
        }
      }
    } else if (sender === 'info') {
      messageDiv.classList.add('info-message'); // You'd define .info-message in styles.css
      const p = document.createElement('p');
      p.innerHTML = `<em>${text}</em>`; // Example: italicize info messages
      messageDiv.appendChild(p);
    }

    chatMessagesContainer.appendChild(messageDiv);
    scrollToBottom(); // Scroll to show the latest message.
  }

  // --- 6. Helper Function to Scroll Chat to Bottom ---
  function scrollToBottom() {
    if (chatMessagesContainer) {
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }
  }

  // --- 7. Initial Setup ---
  // Set focus to the userInput textarea when the WebView loads.
  if (userInputElement) {
    userInputElement.focus();
    console.log('[WebView] Focused on user input textarea.');
  }

  // Add a log to indicate client-side script is fully set up.
  console.log('[WebView] main.js listeners attached and setup complete.');

  // Example: Send an informational message to the extension when WebView is ready.
  // This can be useful for the extension to know the WebView has loaded its JS.
  vscode.postMessage({
    type: 'informExtension',
    payload: { info: 'WebView UI is ready!' }
  });
});