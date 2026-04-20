(function (global) {

class TaskTimer {
    constructor(totalSeconds, onEvent) {
        this.total = totalSeconds;
        this.elapsed = 0;
        this.onEvent = onEvent || function () {};
        this.intervalId = null;
        this.state = 'ready';
    }

    start() {
        if (this.intervalId) return;
        this.state = 'running';
        this.intervalId = setInterval(() => this.tick(), 1000);
        this.emit();
    }

    pause() {
        if (!this.intervalId) return;
        clearInterval(this.intervalId);
        this.intervalId = null;
        this.state = 'paused';
        this.onEvent({ type: 'pause', elapsed: this.elapsed, remaining: this.total - this.elapsed });
    }

    stop() {
        this.pause();
        this.state = 'stopped';
    }

    tick() {
        this.elapsed += 1;
        this.emit();
    }

    emit() {
        const remaining = this.total - this.elapsed;
        const phase = remaining <= 0 ? 'overtime' : (remaining <= 60 ? 'danger' : (remaining <= 300 ? 'warning' : 'normal'));
        this.onEvent({ type: 'tick', elapsed: this.elapsed, remaining, phase });
    }

    format() {
        const remaining = this.total - this.elapsed;
        const overTime = remaining < 0;
        const abs = Math.abs(remaining);
        const m = Math.floor(abs / 60);
        const s = abs % 60;
        const mm = String(m).padStart(2, '0');
        const ss = String(s).padStart(2, '0');
        return (overTime ? '+' : '') + mm + ':' + ss;
    }
}

const api = { TaskTimer };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else global.TaskTimer = TaskTimer;

})(typeof window !== 'undefined' ? window : globalThis);
