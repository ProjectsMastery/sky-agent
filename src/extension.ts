// src/extension.ts

// Import the 'vscode' module, which contains the VS Code extensibility API.
// This module is special and is provided by the VS Code host environment at runtime.
// We declared it as an 'external' in webpack.config.js.
import * as vscode from 'vscode';

// Import our custom WebView provider. We'll create this file next.
import { SkyWebViewProvider } from './webview/SkyWebViewProvider';

// Import the Google Generative AI SDK parts we need.
// Make sure you've run `npm install @google/generative-ai`.
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerativeModel, ChatSession } from '@google/generative-ai';

// --- Configuration & State ---

// IMPORTANT: API Key Management
// For development, you can temporarily hardcode your API key here.
// For a real extension, you MUST use secure storage like VS Code's SecretStorage API
// or prompt the user for their key. NEVER commit your actual API key to a public repository.
const GEMINI_API_KEY_PLACEHOLDER = 'YOUR_GEMINI_API_KEY_HERE'; // Replace this with your actual key for testing
let geminiApiKey: string | undefined = GEMINI_API_KEY_PLACEHOLDER; // Will hold the actual key

// Global variables to hold the Gemini AI client and the specific model instance.
let genAIClient: GoogleGenerativeAI | null = null;
let geminiModel: GenerativeModel | null = null;

// Define an interface for the structure of conversation messages we'll keep.
interface ConversationMessage {
  role: 'user' | 'model'; // 'user' for user messages, 'model' for AI (Gemini) responses
  parts: [{ text: string }]; // Gemini's API expects parts as an array of objects with a text field
}

// Simple array to store the conversation history.
// This helps provide context to Gemini for follow-up interactions.
const conversationHistory: ConversationMessage[] = [];

// Reference to our WebView provider instance.
// We need this to send messages from the extension back to the WebView.
let skyWebViewProviderInstance: SkyWebViewProvider | null = null;


// --- Extension Activation ---

// The 'activate' function is called by VS Code when your extension is activated.
// Activation happens based on the "activationEvents" defined in your package.json.
// `context`: An ExtensionContext object provided by VS Code, contains utility functions
//            and a place to store disposables (things that need to be cleaned up).
export function activate(context: vscode.ExtensionContext): void {
  // Log to the VS Code Debug Console (Help > Toggle Developer Tools > Console) that activation has started.
  // This is useful for debugging activation issues.
  console.log('Sky Agent: Activating extension...');

  // --- 1. API Key Setup (Illustrative - for real app, use secure storage) ---
  // In a real app, you would prompt the user or use vscode.secrets.get() here.
  // For now, we're using the hardcoded placeholder or a directly pasted key.
  if (geminiApiKey === 'YOUR_GEMINI_API_KEY_HERE' || !geminiApiKey) {
    vscode.window.showWarningMessage(
      'Sky Agent: Gemini API Key is not set or is a placeholder. AI features will be disabled. Please set it for Sky to think.'
    );
    // Optionally, you could not initialize Gemini or disable related commands here.
  } else {
    // --- 2. Initialize Gemini Client & Model ---
    try {
      genAIClient = new GoogleGenerativeAI(geminiApiKey);
      geminiModel = genAIClient.getGenerativeModel({
        model: 'gemini-1.5-flash-latest', // Using the fast and capable Flash model
        // Optional: Configure safety settings to allow/block certain types of content.
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ],
        // Optional: Configure generation parameters like temperature, max output tokens.
        // generationConfig: {
        //   temperature: 0.7,
        //   maxOutputTokens: 1024,
        // },
      });
      console.log('Sky Agent: Gemini model initialized successfully.');
    } catch (error) {
      console.error('Sky Agent: Failed to initialize Gemini -', error);
      // Provide a more user-friendly error message.
      const errorMsg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Sky Agent: Error initializing Gemini - ${errorMsg}`);
      // Ensure model is null if initialization fails, so other parts of the code know.
      genAIClient = null;
      geminiModel = null;
    }
  }

  // --- 3. Register the WebView Provider ---
  // Create an instance of our SkyWebViewProvider.
  // `context.extensionUri` is crucial for the WebView to correctly load local resources (CSS, JS, images)
  // from within your extension's directory.
  skyWebViewProviderInstance = new SkyWebViewProvider(context.extensionUri);

  // Register the WebView provider with VS Code.
  // - `SkyWebViewProvider.viewType` (e.g., 'skyAgent.skyView') is a unique ID that MUST match
  //   the "id" of the view defined in package.json's "contributes.views" section.
  // - `skyWebViewProviderInstance` is the instance that will handle creating and managing the WebView.
  // - `{ webviewOptions: { retainContextWhenHidden: true } }` is important. It tells VS Code
  //   to keep the WebView's state (JavaScript context, scroll position, etc.) even when the
  //   WebView panel is hidden (e.g., user switches to another Activity Bar item) and then shown again.
  //   This prevents the WebView from reloading from scratch every time it's hidden and revealed.
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SkyWebViewProvider.viewType, // Static property we'll define on the class
      skyWebViewProviderInstance,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
  console.log('Sky Agent: SkyWebViewProvider registered.');

  // --- 4. Register Commands ---

  // Register a simple "Hello World" command for basic testing.
  const helloWorldCommand = vscode.commands.registerCommand('sky-agent.helloWorld', () => {
    vscode.window.showInformationMessage('Sky Agent says: Hello World!');
    console.log('Sky Agent: Hello World command executed.');
    // Example of sending a message to the WebView from a command:
    // skyWebViewProviderInstance?.postMessageToWebview({ type: 'info', text: 'Hello World command was triggered!' });
  });
  // Add the command's disposable to the context's subscriptions.
  // This ensures the command is properly cleaned up when the extension is deactivated.
  context.subscriptions.push(helloWorldCommand);
  console.log('Sky Agent: "sky-agent.helloWorld" command registered.');

  // Register a command to test the Gemini connection directly.
  const testGeminiCommand = vscode.commands.registerCommand('skyAgent.testGemini', async () => {
    if (!geminiModel) {
      vscode.window.showWarningMessage('Sky Agent: Gemini is not initialized. Cannot run test.');
      return;
    }
    vscode.window.showInformationMessage('Sky Agent: Testing Gemini connection...');
    try {
      const result = await geminiModel.generateContent("Explain what a VS Code extension is in one sentence.");
      const response = result.response;
      const text = response.text();
      vscode.window.showInformationMessage(`Sky Agent (Gemini Test): ${text}`);
      // Also send to WebView if it's open
      skyWebViewProviderInstance?.postMessageToWebview({ type: 'geminiResponse', text: `Gemini Test Result: ${text}` });
    } catch (error) {
      console.error('Sky Agent: Gemini test error -', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Sky Agent: Gemini Test Error - ${errorMsg}`);
    }
  });
  context.subscriptions.push(testGeminiCommand);
  console.log('Sky Agent: "skyAgent.testGemini" command registered.');

  // Register an internal command to handle messages coming FROM the WebView.
  // The WebView will use `vscode.postMessage({ command: 'skyAgent.internal.handleWebViewMessage', data: ... })`
  // We made this an internal command that SkyWebViewProvider will call using executeCommand.
  const handleWebViewMessageCommand = vscode.commands.registerCommand('skyAgent.internal.handleWebViewMessage', async (messageData: { type: string; text?: string; payload?: any }) => {
      console.log('Sky Agent: Received message from WebView - Type:', messageData.type);

      if (messageData.type === 'sendToGemini') {
        if (!geminiModel) {
          skyWebViewProviderInstance?.postMessageToWebview({
            type: 'geminiResponse',
            text: 'Sky Agent: Sorry, my connection to Gemini is not working. Please check the API key and console logs.',
            isError: true,
          });
          return;
        }
        if (!messageData.text || messageData.text.trim() === '') {
          skyWebViewProviderInstance?.postMessageToWebview({
            type: 'geminiResponse',
            text: 'Sky Agent: It seems you sent an empty message. What would you like to ask?',
            isError: true, // Or handle as a gentle nudge
          });
          return;
        }

        const userMessageText = messageData.text;
        // Add user's message to history for Gemini (formatted for Gemini API)
        addMessageToHistory('user', userMessageText);

        try {
          // Use startChat for conversational context
          // The history should be all messages *before* the current userMessageText
          const chat: ChatSession = geminiModel.startChat({
            history: conversationHistory.slice(0, -1), // Exclude the current user message we just added
            // safetySettings: [...] // Can be set here if not globally on model
          });

          const result = await chat.sendMessage(userMessageText);
          const response = result.response;
          const skyTextResponse = response.text();

          // Add Gemini's response to history
          addMessageToHistory('model', skyTextResponse);

          // Send Gemini's response back to the WebView
          skyWebViewProviderInstance?.postMessageToWebview({
            type: 'geminiResponse',
            text: skyTextResponse,
          });

        } catch (error) {
          console.error('Sky Agent: Error calling Gemini API -', error);
          const errorMsg = error instanceof Error ? error.message : String(error);
          const friendlyError = `Sky Agent: Sorry, I encountered an error while thinking. Details: ${errorMsg}`;
          addMessageToHistory('model', friendlyError); // Log error as part of conversation
          skyWebViewProviderInstance?.postMessageToWebview({
            type: 'geminiResponse',
            text: friendlyError,
            isError: true,
          });
        }
      } else if (messageData.type === 'informExtension') {
        // Generic message type for WebView to inform extension of something
        console.log('Sky Agent: WebView sent information -', messageData.payload);
        vscode.window.showInformationMessage(`Sky Agent WebView says: ${messageData.payload?.info || 'Something happened!'}`);
      }
      // Add more message types from WebView as needed
    }
  );
  context.subscriptions.push(handleWebViewMessageCommand);
  console.log('Sky Agent: "skyAgent.internal.handleWebViewMessage" command registered.');

  // --- 5. Final Activation Log ---
  console.log('Sky Agent: Extension is now fully active and ready!');
  vscode.window.showInformationMessage('Sky Agent is active! Open Sky from the Activity Bar.');
}


// --- Helper Functions ---

// Adds a message to the conversation history array.
// Manages the structure Gemini expects for history.
function addMessageToHistory(role: 'user' | 'model', text: string): void {
  conversationHistory.push({ role, parts: [{ text }] });

  // Optional: Limit the size of the conversation history to prevent it from growing too large
  // and to manage token usage with the Gemini API. Keep, for example, the last 10 messages (5 turns).
  const MAX_HISTORY_MESSAGES = 20; // Adjust as needed
  if (conversationHistory.length > MAX_HISTORY_MESSAGES) {
    conversationHistory.splice(0, conversationHistory.length - MAX_HISTORY_MESSAGES);
  }
  console.log(`Sky Agent: Added to history (${role}). History length: ${conversationHistory.length}`);
}


// --- Extension Deactivation ---

// The 'deactivate' function is called when VS Code is shutting down or when the extension is disabled/uninstalled.
// This is where you should clean up any resources your extension acquired.
export function deactivate(): void {
  // Log to the console that deactivation is happening.
  console.log('Sky Agent: Deactivating extension...');
  // Any cleanup tasks (e.g., closing network connections, disposing of listeners) would go here.
  // For this extension, most resources (commands, providers) are managed by `context.subscriptions`,
  // so VS Code handles their disposal automatically.
}