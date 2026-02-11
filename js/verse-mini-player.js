class VerseMiniPlayer {
  constructor() {
    this._active = false;
    this._roomId = null;
    this._roomName = '';
    this._el = null;
    this._createDOM();
  }

  _createDOM() {
    const bar = document.createElement('div');
    bar.id = 'verse-mini-player';
    bar.className = 'verse-mini-player';
    bar.innerHTML = `
      <div class="vmp-inner">
        <div class="vmp-pulse"></div>
        <div class="vmp-info">
          <span class="vmp-label">LIVE</span>
          <span class="vmp-room-name"></span>
        </div>
        <div class="vmp-controls">
          <button class="vmp-btn vmp-mute" title="Toggle Mute">
            <i class="fas fa-microphone"></i>
          </button>
          <button class="vmp-btn vmp-return" title="Return to Room">
            <i class="fas fa-headphones"></i>
            <span>Return</span>
          </button>
          <button class="vmp-btn vmp-leave" title="Leave Room">
            <i class="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(bar);
    this._el = bar;

    bar.querySelector('.vmp-mute').addEventListener('click', () => this._toggleMute());
    bar.querySelector('.vmp-return').addEventListener('click', () => this._returnToRoom());
    bar.querySelector('.vmp-leave').addEventListener('click', () => this._leaveRoom());
  }

  isActive() {
    return this._active;
  }

  activate(roomId, roomName) {
    this._active = true;
    this._roomId = roomId;
    this._roomName = roomName || 'Audio Room';
    this._el.querySelector('.vmp-room-name').textContent = this._roomName;
    this._el.classList.add('active');
    this._updateMuteIcon();
    document.body.classList.add('has-mini-player');
  }

  deactivate() {
    this._active = false;
    this._roomId = null;
    this._roomName = '';
    this._el.classList.remove('active');
    document.body.classList.remove('has-mini-player');
  }

  _updateMuteIcon() {
    const mgr = window.audioRoomsManager;
    const icon = this._el.querySelector('.vmp-mute i');
    if (!mgr || !icon) return;
    if (mgr.isAudioMuted) {
      icon.className = 'fas fa-microphone-slash';
      this._el.querySelector('.vmp-mute').classList.add('muted');
    } else {
      icon.className = 'fas fa-microphone';
      this._el.querySelector('.vmp-mute').classList.remove('muted');
    }
  }

  _toggleMute() {
    const mgr = window.audioRoomsManager;
    if (!mgr) return;
    if (typeof mgr.toggleAudio === 'function') {
      mgr.toggleAudio();
    } else if (mgr.localStream) {
      mgr.isAudioMuted = !mgr.isAudioMuted;
      mgr.localStream.getAudioTracks().forEach(t => { t.enabled = !mgr.isAudioMuted; });
    }
    this._updateMuteIcon();
  }

  _returnToRoom() {
    if (window._spaRouter) {
      window._spaRouter.navigate('/verses.html');
    } else {
      window.location.href = '/verses.html';
    }
  }

  _leaveRoom() {
    const mgr = window.audioRoomsManager;
    if (mgr && typeof mgr.leaveRoom === 'function') {
      mgr.leaveRoom();
    }
    this.deactivate();
  }
}

window._verseMiniPlayer = null;
document.addEventListener('DOMContentLoaded', () => {
  window._verseMiniPlayer = new VerseMiniPlayer();
});
