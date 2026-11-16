function audioFile(id) {
  return "assets/radio/" + id + ".mp3";
}

// DOM-free: the caption text only while its line is still current.
export function currentCaption(message, isCurrent) {
  return !isCurrent || isCurrent() ? message : "";
}

export class RadioVoice {
  enabled = true;
  context = null;
  current = null;
  pending = null;
  files = new Map();
  decoded = new Map();
  // Optional callback(id), called right after a clip's source.start(). Unset by default.
  onStart = null;

  warm(id) {
    if (!this.files.has(id)) {
      const loading = fetch(audioFile(id)).then(response => {
        if (!response.ok) throw Error("Unable to load radio clip");
        return response.arrayBuffer();
      });
      this.files.set(id, loading);
      loading.catch(() => this.files.delete(id));
    }
    return this.files.get(id);
  }

  unlock() {
    if (!this.enabled) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    this.context ??= new Audio();
    if (this.context.state !== "running") this.context.resume().catch(() => {});
  }

  setEnabled(value) {
    this.enabled = value;
    if (value) this.unlock();
    else this.stop();
  }

  stop() {
    this.pending = null;
    const previous = this.current;
    this.current = null;
    if (previous?.source) previous.source.stop();
  }

  // Stops the current clip if it has gone stale; clears pending only if it is stale too.
  dropStale() {
    if (this.pending?.isCurrent && !this.pending.isCurrent()) this.pending = null;
    const request = this.current;
    if (request?.isCurrent && !request.isCurrent()) {
      this.current = null;
      if (request.source) request.source.stop();
    }
  }

  say(id, priority, pan = 0, isCurrent = null) {
    if (!this.enabled || !this.context) return;
    if (isCurrent && !isCurrent()) return;
    if (this.current?.priority >= priority) {
      if (priority >= 3 && (!this.pending || this.pending.priority <= priority)) {
        this.pending = { id, priority, pan, isCurrent };
      }
      return;
    }
    this.stop();
    const request = { id, priority, isCurrent };
    this.current = request;
    this.load(id).then(buffer => {
      if (this.current !== request) return;
      if (isCurrent && !isCurrent()) {
        this.ended(request);
        return;
      }
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      if (pan && this.context.createStereoPanner) {
        const panner = this.context.createStereoPanner();
        panner.pan.value = pan;
        source.connect(panner).connect(this.context.destination);
      } else {
        source.connect(this.context.destination);
      }
      source.onended = () => this.ended(request);
      source.start();
      request.source = source;
      try { this.onStart?.(id); } catch {}
    }).catch(() => this.ended(request));
  }

  ended(request) {
    if (this.current !== request) return;
    this.current = null;
    const next = this.pending;
    this.pending = null;
    if (next) this.say(next.id, next.priority, next.pan, next.isCurrent);
  }

  load(id) {
    if (!this.decoded.has(id)) {
      const loading = this.warm(id).then(bytes => this.context.decodeAudioData(bytes.slice(0)));
      this.decoded.set(id, loading);
      loading.catch(() => this.decoded.delete(id));
    }
    return this.decoded.get(id);
  }
}
