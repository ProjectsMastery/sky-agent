import * as vscode from 'vscode';

export class SkyWebViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'skyAgent.skyView'; // Unique ID for our view

    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Enable JavaScript in the webview
            enableScripts: true,
            // Restrict the webview to only loading content from our extension's directory
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media'), vscode.Uri.joinPath(this._extensionUri, 'out', 'webview')]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.type) {
                case 'showInfo':
                    vscode.window.showInformationMessage(data.message);
                    break;
                    case 'sendToGemini':
                    // Insted of handling here, tell the extension to handle it
                   vscode.commands.executeCommand('skyAgent.internal.handleWebViewMessage', data);
                    break;
                    case 'functionCall':
                     // We might rename/repurpose this or handle it within Gemini's response
                    vscode.commands.executeCommand('skyAgent.internal.handleWebViewMessage', data);
                       break;
                     case 'webviewLog':
                     // This is a generic log message from the webview
                     const logData = data as { level: string, message: string, error?: string }; // Type assertion
                       if (logData.level === 'error') {
                            console.error(logData.message, logData.error ? JSON.parse(logData.error) : ''); // Optionally show a VS Code error message for critical webview errors
                             // vscode.window.showErrorMessage(`Sky Agent WebView Error: ${logData.message.substring(0,100)} (check Debug Console)`);             
                       } else if (logData.level === 'warn') {
                            console.warn(logData.message, logData.error ? JSON.parse(logData.error) : ''); 
                       } else { // 'info', 'log', or anything else
                            console.log(logData.message, logData.error ? JSON.parse(logData.error) : '');
                       }
                       break;    
            }
        });
    }

    // Helper function to post messages to the webview
    public postMessageToWebview(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // For now, a very simple HTML page
        // We'll make this more sophisticated later

        // Get the special URI to use with the webview for local resources
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'main.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'styles.css'));


        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

       return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <!-- Updated CSP: Removed Vapi specific entries -->
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
                <link href="${stylesUri}" rel="stylesheet">
                <title>Sky Agent</title>
            </head>
            <body>
                <h1>Sky Agent</h1>
                <div id="status">Status: Idle</div>
                <div id="transcriptContainer">
                    <!-- Transcripts will appear here -->
                </div>
                <button id="toggleRecordingButton">Start Listening</button>
                <br/>
                <!-- Removed the old testButton as its functionality is covered or replaced -->
                <!-- <button id="testButton">Test Message to Extension</button> -->

                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}