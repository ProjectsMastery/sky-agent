// extension.ts
import * as vscode from 'vscode';
import { SkyWebViewProvider } from './webview/SkyWebViewProvider';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerativeModel, ChatSession } from '@google/generative-ai';

// --- Configuration & State ---

const  GEMINI_API_KEY_PLACEHOLDER = 'YOUR_GEMINI_API_KEY_HERE';
let geminiApiKey: string | undefined = GEMINI_API_KEY_PLACEHOLDER;

// Global variables to hold the Gemini AI client and the specific model instance.
let genAIClient: GoogleGenerativeAI | null = null;
let geminiModel: GenerativeModel | null = null;

// Define an interface for the structure of conversation messages we'll keep.
interface ConversationMessage {
    role: 'user' | 'model';
    parts: [{ test: string }];
}

// Simple array to store conversation history.
const conversationHistory: ConversationMessage[] = [];

// We need this reference to send messages from the sextension back to the webview.
let SkyWebViewProviderInstance: SkyWebViewProvider | null = null;

// --- Extension Activation ---

export function activate(context: vscode.ExtensionContext): void {
    console.log('Sky Agent: Activating extension...');
}

// --- 1. API Key Setup (Illustrative - for real app, use secure storage) ---

if (geminiApiKey == 'YOUR_GEMINI_API_KEY_HERE' || !geminiApiKey) {
    vscode.window.showWarningMessage(
        'Sky Agent: Gemini API Key is not set or is a placeholder. AI features will be disabled. Please set it for Sky to think.'
    );
} else {
    // --- 2. Initial Gemini Client & Model ---
    try {
        genAIClient = new GoogleGenerativeAI(geminiApiKey);
        geminiModel = genAIClient.getGenerativeModel({
            model: 'gemini-1.5-flash-latest', 
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT, 
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                },
            ],
        });
        console.log('Sky Agent: Gemini model initialized successfully.');
    } catch (error) {
        console.error('Sky Agent: Failed to initialized Gemini -', error);
        // Provide a more user-friendly error mesage.
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Sky Agent: error initializing Gemini - ${errorMsg}`);
        // Ensure model is false if initialization fails, so other parts of the code know.
        genAIClient = null;
        geminiModel = null;
    }
}

// --- 3. Register the webview Provider ---

SkyWebViewProviderInstance = new SkyWebViewProvider(context.extensionUri);
context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
        SkyWebViewProvider.viewType,
        SkyWebViewProviderInstance,
        { webviewOptions: { retainContextWhenHidden: true }}
    )
);
console.log('Sky Agent: SkyWebViewProvider registerd.');

// -- 4. Register Commands ---
