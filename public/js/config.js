var WORDETH_CONFIG = {
    API_BASE: window.WORDETH_API_BASE || '',
    APP_VERSION: '1.0.0',
    APP_NAME: 'Wordeth'
};

function apiUrl(path) {
    return (WORDETH_CONFIG ? WORDETH_CONFIG.API_BASE : '') + path;
}
