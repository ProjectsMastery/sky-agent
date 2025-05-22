// src/webview/SkyWebViewProvider.ts

import vscode from 'vscode'; // Import the VS Code API

// This class is responsible for providing the content (HTML, CSS, JS) for our WebView view
// and managing communication with it.
export class SkyWebViewProvider implements vscode.WebviewViewProvider {
  // A unique identifier for this type of WebView view.
  // This MUST exactly match the "id" of the view contributed in package.json's "views" section
  // (e.g., "skyAgent.skyView").
  public static readonly viewType = 'skyAgent.skyView';

  // A private property to hold the WebviewView instance once it's resolved.
  // The '?' indicates it might be undefined until 'resolveWebviewView' is called.
  private _view?: vscode.WebviewView;

  // The constructor takes the extension's URI as an argument.
  // This URI is essential for constructing correct paths to local resources (CSS, JS, images)
  // within the extension's install directory, so the WebView can load them.
  constructor(private readonly _extensionUri: vscode.Uri) {}

  // This is the primary method VS Code calls when it needs to display our WebView view.
  // It's responsible for setting up the WebView's initial state and HTML content.
  // - `webviewView`: The actual WebviewView instance that we need to configure.
  // - `context`: Contains information about the context in which the view is being resolved (not used much here).
  // - `_token`: A cancellation token (not used much here).
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: vscode.WebviewViewResolveContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken
  ): void {
    // Store the WebviewView instance locally so we can interact with it later (e.g., send messages).
    this._view = webviewView;

    // Configure WebView options:
    webviewView.webview.options = {
      // Enable JavaScript execution within the WebView. Essential for interactivity.
      enableScripts: true,
      // Restrict the WebView to only loading local resources from specific directories
      // within our extension. This is a security measure (Content Security Policy).
      // We allow loading from 'media' (for images, icons) and 'out/webview'
      // (where our compiled/bundled WebView JS and CSS will be placed by esbuild).
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'media'),
        vscode.Uri.joinPath(this._extensionUri, 'out', 'webview'),
      ],
    };

    // Set the HTML content for the WebView.
    // We'll generate this HTML using a helper method `_getHtmlForWebview`.
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Set up a message listener. This is how the WebView (client-side JavaScript)
    // can send messages back to our extension (this TypeScript code).
    webviewView.webview.onDidReceiveMessage(
      (message: { type: string; text?: string; payload?: any }) => {
        // Log received messages for debugging.
        console.log(`SkyWebViewProvider: Received message from WebView - Type: ${message.type}, Data:`, message);

        // We will forward most messages to the main extension logic (extension.ts)
        // using a command, so that extension.ts remains the central place for handling
        // AI logic and VS Code API interactions.
        // The 'skyAgent.internal.handleWebViewMessage' command is registered in extension.ts.
        switch (message.type) {
          case 'sendToGemini':
            // Forward the message to the command handler in extension.ts.
            vscode.commands.executeCommand('skyAgent.internal.handleWebViewMessage', message);
            break;
          case 'informExtension': // A generic message type for simple info
            vscode.commands.executeCommand('skyAgent.internal.handleWebViewMessage', message);
            break;
          // Add more cases here if the WebView needs to send other types of messages
          // that require different handling or direct action within the provider.
          default:
            console.warn(`SkyWebViewProvider: Received unknown message type from WebView: ${message.type}`);
        }
      }
    );
    console.log('SkyWebViewProvider: WebView resolved and message listener attached.');
  }

  // Public method to allow other parts of the extension (e.g., extension.ts)
  // to send messages TO the WebView.
  public postMessageToWebview(message: any): void {
    if (this._view) {
      // The `postMessage` method on the webview object sends the message to the
      // client-side JavaScript running inside the WebView.
      this._view.webview.postMessage(message);
      console.log('SkyWebViewProvider: Posted message to WebView -', message);
    } else {
      console.warn('SkyWebViewProvider: Attempted to post message, but WebView is not available.');
    }
  }

  // Private helper method to generate the full HTML content for the WebView.
  private _getHtmlForWebview(webview: vscode.Webview): string {
    // --- 1. Generate URIs for Local Resources ---
    // To load local files (CSS, JS) in a WebView, you MUST use special URIs generated by `webview.asWebviewUri()`.
    // This method converts a local file URI (created with `vscode.Uri.joinPath`) into a URI
    // that the WebView can securely access.

    // URI for the main WebView JavaScript file (will be created by esbuild in out/webview/main.js).
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'main.js')
    );

    // URI for the main WebView CSS file (will be created by esbuild in out/webview/styles.css).
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'styles.css')
    );

    // (Optional) URI for VS Code's Codicons stylesheet if you want to use them directly in WebView HTML.
    // To use this, you'd also need to allow its source in the CSP's style-src.
    // const codiconsUri = webview.asWebviewUri(
    //   vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
    // );

    // --- 2. Generate a Nonce for Content Security Policy (CSP) ---
    // A nonce is a random string used once. It's a security measure to help prevent
    // cross-site scripting (XSS) by ensuring that only scripts with this specific nonce
    // (that we generate and embed in the script tag) are allowed to run.
    const nonce = getNonce();

    // --- 3. Construct the HTML String ---
    // This uses a template literal (backticks ``) for easier string interpolation.
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">

        <!-- Content Security Policy (CSP): A crucial security feature. -->
        <!-- It restricts what resources (scripts, styles, images, etc.) the WebView can load and execute. -->
        <!-- - 'default-src 'none'': By default, allow nothing. We then explicitly allow specific types. -->
        <!-- - 'style-src ${webview.cspSource} 'unsafe-inline'': Allows stylesheets from our extension's domain
                                                               and inline styles (though we aim to minimize 'unsafe-inline').
                                                               We'll use VS Code theme variables which often rely on inline styles. -->
        <!-- - 'font-src ${webview.cspSource}': Allows fonts from our extension's domain (VS Code themes might load fonts). -->
        <!-- - 'img-src ${webview.cspSource} https: data:': Allows images from our extension, HTTPS sources, and data URIs. -->
        <!-- - 'script-src 'nonce-${nonce}'': ONLY allows <script> tags that have the attribute 'nonce="${nonce}"'. -->
        <meta http-equiv="Content-Security-Policy"
              content="default-src 'none';
                       style-src ${webview.cspSource} 'unsafe-inline';
                       font-src ${webview.cspSource};
                       img-src ${webview.cspSource} https: data:;
                       script-src 'nonce-${nonce}';">

        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <!-- Link to our main stylesheet -->
        <link href="${stylesUri}" rel="stylesheet">
        <!-- Codicons stylesheet can be enabled by uncommenting the code below and defining codiconsUri above -->
        <!-- <link href="" rel="stylesheet" /> -->


        <title>Sky Agent</title>
      </head>
      <body>
        <!-- This is the basic structure for our Sky Agent UI.
             We'll populate and style this further. main.js will interact with these elements. -->

        <div class="sky-container">
          <div class="sky-header">
            <div id="sky-visual-orb" class="sky-visual-orb">
              <!-- This div will be styled with CSS to be an orb.
                   We can animate it later with JavaScript or CSS animations. -->
            </div>
            <h2>Sky Agent</h2>
          </div>

          <div id="chat-messages" class="chat-messages">
            <!-- Conversation messages will be dynamically added here by main.js -->
            <div class="message sky-message">
              <p>Hello! I'm Sky, your AI coding assistant. How can I assist you today?</p>
            </div>
          </div>

          <div id="loading-indicator" class="loading-indicator" style="display: none;">
            <!-- The "dot-flashing" class will be styled in CSS for a thinking animation -->
            <div class="dot-flashing"></div>
            <span>Sky is thinking...</span>
          </div>

          <div class="chat-input-area">
            <textarea id="userInput" placeholder="Ask Sky... (e.g., 'Generate a Python function to sort a list')" rows="1"></textarea>
            <button id="sendButton" title="Send Message">
              <!-- Send icon (SVG) -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Our client-side JavaScript file.
             The 'nonce' attribute MUST match the nonce in the CSP's 'script-src' directive. -->
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}

// Helper function to generate a random nonce string.
// This should be a cryptographically strong random string in a real production scenario,
// but for development, a simple random string is often used.
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}