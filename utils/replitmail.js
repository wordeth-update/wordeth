const { promisify } = require('node:util');
const { execFile } = require('node:child_process');

const execFileAsync = promisify(execFile);

async function getAuthToken() {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    if (!hostname) {
        throw new Error('REPLIT_CONNECTORS_HOSTNAME is not set');
    }
    const { stdout } = await execFileAsync(
        'replit',
        ['identity', 'create', '--audience', `https://${hostname}`],
        { encoding: 'utf8' }
    );
    const replitToken = (stdout || '').trim();
    if (!replitToken) {
        throw new Error('Replit Identity Token not found for repl/depl');
    }
    return { authToken: `Bearer ${replitToken}`, hostname };
}

async function sendEmail(message) {
    if (!message || typeof message !== 'object') {
        throw new Error('sendEmail: message is required');
    }
    if (!message.subject || typeof message.subject !== 'string') {
        throw new Error('sendEmail: subject is required');
    }
    if (!message.text && !message.html) {
        throw new Error('sendEmail: text or html is required');
    }

    const { hostname, authToken } = await getAuthToken();

    const response = await fetch(`https://${hostname}/api/v2/mailer/send`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Replit-Authentication': authToken
        },
        body: JSON.stringify({
            subject: message.subject,
            text: message.text,
            html: message.html,
            attachments: message.attachments
        })
    });

    if (!response.ok) {
        let errMsg = `Failed to send email (HTTP ${response.status})`;
        try {
            const err = await response.json();
            if (err && err.message) errMsg = err.message;
        } catch (_) { /* ignore */ }
        throw new Error(errMsg);
    }

    return await response.json();
}

module.exports = { sendEmail };
