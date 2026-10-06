// ===== Webview-side controller =====
// This script runs inside the webview panel.
// It handles user interactions and communicates with the extension.

// Get the VS Code API bridge (provided by VS Code in webviews)
const vscode = acquireVsCodeApi();

// ===== 1. Get references to HTML elements =====

const instancesContainer = document.getElementById('instances');

// ===== 2. Handle messages from the extension =====

window.addEventListener('message', (event) => {
    const message = event.data;

    // Extension asks us to refresh — request instances
    if (message.type === 'refresh') {
        vscode.postMessage({ type: 'refresh' });
    }

    // Extension sends us the list of instances
    if (message.type === 'instances') {
        renderInstances(message.data);
    }
});

// ===== 3. Render Maya instance cards =====

function renderInstances(instances) {
    // Clear any existing cards
    instancesContainer.innerHTML = '';

    // Create a card for each instance
    instances.forEach((instance) => {
        instancesContainer.appendChild(createCard(instance));
    });
}

// ===== 4. Create a single card element =====

function createCard(instance) {
    const card = document.createElement('div');
    card.className = 'card';

    card.appendChild(createTitle(instance));

    const cardPid = document.createElement('div');
    cardPid.className = 'card-pid';

    const portText = document.createElement('span');
    portText.textContent = `${instance.port}`;
    cardPid.appendChild(portText);

    cardPid.appendChild(createStatus(instance));
    card.appendChild(cardPid);

    card.appendChild(createFooter(instance));

    return card;
}

// Card title: version plus scene name, falling back to the port
function createTitle(instance) {
    const title = document.createElement('span');
    title.className = 'card-title';
    const label = [
        instance.version ?? 'Maya',
        instance.sceneName ?? `port ${instance.port}`,
    ].join(' · ');
    title.textContent = label;
    title.title = label;
    return title;
}

// Coloured dot plus Connected/Disconnected label
function createStatus(instance) {
    const status = document.createElement('div');
    status.className = 'status';

    const dot = document.createElement('span');
    dot.className = `status-dot ${instance.status}`;

    const text = document.createElement('span');
    text.className = `status-text ${instance.status}`;
    text.textContent = instance.status === 'connected' ? 'Connected' : 'Disconnected';

    status.appendChild(dot);
    status.appendChild(text);

    return status;
}

// Connect/Disconnect button plus the ping icon
function createFooter(instance) {
    const footer = document.createElement('div');
    footer.className = 'card-footer';

    const connectBtn = document.createElement('button');
    connectBtn.textContent = instance.status === 'connected' ? 'Disconnect' : 'Connect';
    connectBtn.addEventListener('click', () => {
        const action = instance.status === 'connected' ? 'disconnect' : 'connect';
        vscode.postMessage({ type: action, port: instance.port });
    });
    footer.appendChild(connectBtn);

    const pingBtn = document.createElement('button');
    pingBtn.className = 'icon-btn';
    pingBtn.title = `Ping Maya on port ${instance.port}`;
    pingBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M9 8C9 8.552 8.552 9 8 9C7.448 9 7 8.552 7 8C7 7.448 7.448 7 8 7C8.552 7 9 7.448 9 8ZM12 8C12 10.209 10.209 12 8 12C5.791 12 4 10.209 4 8C4 5.791 5.791 4 8 4C10.209 4 12 5.791 12 8ZM11 8C11 6.343 9.657 5 8 5C6.343 5 5 6.343 5 8C5 9.657 6.343 11 8 11C9.657 11 11 9.657 11 8ZM15 8C15 11.866 11.866 15 8 15C4.134 15 1 11.866 1 8C1 4.134 4.134 1 8 1C11.866 1 15 4.134 15 8ZM14 8C14 4.686 11.314 2 8 2C4.686 2 2 4.686 2 8C2 11.314 4.686 14 8 14C11.314 14 14 11.314 14 8Z"/></svg>';
    pingBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'ping', port: instance.port });
    });
    footer.appendChild(pingBtn);

    return footer;
}

// ===== 5. Request an initial scan when the panel loads =====

vscode.postMessage({ type: 'refresh' });