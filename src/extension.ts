// src/extension.ts
import * as vscode from 'vscode';
import { SkyWebViewProvider } from './webview/SkyWebViewProvider';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Part } from '@google/generative-ai'; // Added 'Part'

// ============================================================================================
// === SINGLE PLACE TO PUT YOUR API KEY ===
// Replace 'YOUR_GEMINI_API_KEY_GOES_HERE' with your actual Gemini API Key string.
const GEMINI_API_KEY: string | undefined = 'YOUR_GEMINI_API_KEY_GOES_HERE'; // Changed this link 
// ============================================================================================

let genAI: GoogleGenerativeAI | null = null;
let geminiModel: any = null; // Using 'any' for simplicity, can be typed more strictly later

// Define the structure for conversation history messages
interface ConversationTurn {
    role: "user" | "model";
    parts: Part[]; // Using Part[] as expected by Gemini SDK
}
const conversationHistory: ConversationTurn[] = [];

export function activate(context: vscode.ExtensionContext) {
    console.log('Sky Agent is activating...'); // First log

    // --- API Key Check and Gemini Initialization ---
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_GOES_HERE') {
        vscode.window.showErrorMessage('CRITICAL: Gemini API Key is not set or is still the placeholder in extension.ts. Sky Agent cannot function.');
        console.error('CRITICAL: Gemini API Key is missing or placeholder.');
    } else {
        try {
            genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            geminiModel = genAI.getGenerativeModel({
                model: "gemini-1.5-flash-latest",
                safetySettings: [
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                ]
            });
            console.log('Gemini model initialized successfully with key provided.');
        } catch (error: any) {
            console.error("Failed to initialize Gemini:", error);
            const errorMsg = error.message || String(error);
            vscode.window.showErrorMessage(`Failed to initialize Gemini: ${errorMsg}`);
            // genAI and geminiModel will remain null
        }
    }

    // --- WebView Provider Setup ---
    const skyProvider = new SkyWebViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SkyWebViewProvider.viewType, skyProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // --- Command Registrations ---

    // 1. Hello World Command (for basic testing)
    let helloWorldCommand = vscode.commands.registerCommand('sky-agent.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from Sky Agent!');
        console.log('Hello World command executed!');
    });
    context.subscriptions.push(helloWorldCommand);

    // 2. Test Gemini Command (for direct Gemini testing)
    let testGeminiCommand = vscode.commands.registerCommand('skyAgent.testGemini', async () => {
        if (!geminiModel) {
            vscode.window.showWarningMessage('Gemini not initialized. Check API key and console logs.');
            return;
        }
        try {
            const result = await geminiModel.generateContent("Explain quantum computing in simple terms.");
            const response = result.response;
            const text = response.text(); // Ensure this function exists and is called correctly
            vscode.window.showInformationMessage(`Gemini Test: ${text.substring(0, 100)}...`);
            skyProvider.postMessageToWebview({ type: 'geminiResponse', text: `Gemini Test Result: ${text}` });
        } catch (e: any) {
            console.error("Gemini test error:", e);
            const errorMsg = e.message || String(e);
            vscode.window.showErrorMessage(`Gemini Test Error: ${errorMsg}`);
        }
    });
    context.subscriptions.push(testGeminiCommand);

    // 3. Internal Command to Handle Messages from WebView
    context.subscriptions.push(
        vscode.commands.registerCommand('skyAgent.internal.handleWebViewMessage', async (messageData: { type: string, text?: string, payload?: any }) => {
            if (messageData.type === 'sendToGemini') {
                if (!geminiModel) {
                    skyProvider.postMessageToWebview({ type: 'geminiResponse', text: "Sorry, I can't connect to my brain (Gemini). Please check the extension's API key setup." });
                    return;
                }

                const userMessageText = messageData.text || "";
                if (!userMessageText.trim()) {
                    skyProvider.postMessageToWebview({ type: 'geminiResponse', text: "I didn't catch that. Could you please repeat?" });
                    return;
                }

                addMessageToHistory("user", userMessageText);

                try {
                    const chat = geminiModel.startChat({
                        history: conversationHistory.slice(0, -1), // Pass history *before* current user message
                        // safetySettings: [...] // Can be set here too if needed
                    });
                    const result = await chat.sendMessage(userMessageText);
                    const response = result.response;
                    const skyTextResponse = response.text(); // Ensure this is correct

                    addMessageToHistory("model", skyTextResponse);

                    skyProvider.postMessageToWebview({
                        type: 'geminiResponse',
                        text: skyTextResponse
                    });

                } catch (e: any) {
                    console.error("Error calling Gemini:", e);
                    const errorMessage = e.message || "Sorry, I encountered an error trying to think.";
                    skyProvider.postMessageToWebview({
                        type: 'geminiResponse',
                        text: `Error: ${errorMessage}`
                    });
                    addMessageToHistory("model", `Error response: ${errorMessage}`); // Log error as Sky's turn
                }
            } else if (messageData.type === 'functionCall') {
                // Placeholder for function call handling
                vscode.window.showInformationMessage(`Function call requested (not yet implemented): ${messageData.payload?.name || 'unknown'}`);
                console.log('Function call received from WebView:', messageData.payload);
            }
        })
    );

    console.log('Sky Agent is now fully active!'); // Last log in activate
}

// --- Helper Functions ---

function addMessageToHistory(role: "user" | "model", textContent: string) {
    conversationHistory.push({
        role: role,
        parts: [{ text: textContent }] // Gemini expects 'parts' to be an array of Part objects
    });
    // Optional: Limit history size (e.g., keep last 10 turns = 20 messages)
    if (conversationHistory.length > 20) {
        conversationHistory.splice(0, conversationHistory.length - 20);
    }
}

export function deactivate(): void {
    console.log('Sky Agent is deactivating.');
}