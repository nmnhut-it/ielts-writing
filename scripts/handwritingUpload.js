(function (global) {

const MAX_PHOTOS = 4;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per photo

class HandwritingUpload {
    constructor(container, onChange) {
        this.container = container;
        this.onChange = onChange || function () {};
        this.photos = [];
        this.render();
    }

    async addFiles(fileList) {
        const files = Array.from(fileList);
        for (const file of files) {
            if (this.photos.length >= MAX_PHOTOS) break;
            if (!file.type.startsWith('image/')) continue;
            if (file.size > MAX_BYTES) { alert('Photo too large (max 8 MB): ' + file.name); continue; }
            const base64 = await this.fileToBase64(file);
            this.photos.push({
                id: 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                file, base64, mimeType: file.type,
                dataUrl: 'data:' + file.type + ';base64,' + base64
            });
        }
        this.render();
        this.onChange(this.photos);
    }

    removePhoto(id) {
        this.photos = this.photos.filter(p => p.id !== id);
        this.render();
        this.onChange(this.photos);
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    getBase64Photos() {
        return this.photos.map(p => ({ base64: p.base64, mimeType: p.mimeType }));
    }

    clearContainer() {
        while (this.container.firstChild) this.container.removeChild(this.container.firstChild);
    }

    render() {
        this.clearContainer();
        const wrap = document.createElement('div');
        wrap.className = 'hw-upload';

        const grid = document.createElement('div');
        grid.className = 'hw-upload-grid';
        this.photos.forEach(p => {
            const tile = document.createElement('div');
            tile.className = 'hw-upload-tile';
            const img = document.createElement('img');
            img.src = p.dataUrl;
            img.alt = 'handwritten page';
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'hw-remove';
            remove.textContent = '×';
            remove.setAttribute('aria-label', 'Remove photo');
            remove.onclick = () => this.removePhoto(p.id);
            tile.appendChild(img);
            tile.appendChild(remove);
            grid.appendChild(tile);
        });

        if (this.photos.length < MAX_PHOTOS) {
            const addTile = document.createElement('label');
            addTile.className = 'hw-upload-tile hw-add-tile';
            addTile.textContent = '+ Add photo';
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = true;
            input.style.display = 'none';
            input.onchange = (e) => this.addFiles(e.target.files);
            addTile.appendChild(input);
            grid.appendChild(addTile);
        }

        wrap.appendChild(grid);
        const hint = document.createElement('p');
        hint.className = 'hw-upload-hint';
        hint.textContent = 'Upload 1–' + MAX_PHOTOS + ' photos of your handwritten page(s). Max 8 MB each.';
        wrap.appendChild(hint);
        this.container.appendChild(wrap);
    }
}

const api = { HandwritingUpload, MAX_PHOTOS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else global.HandwritingUpload = HandwritingUpload;

})(typeof window !== 'undefined' ? window : globalThis);
