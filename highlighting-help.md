# Highlighting Help

Key spots and behaviors for the highlight button, rendering, and persistence.

- HTML button placement (main layout):
```15:29:src/index.html
    <div id='viewContainer'>
        <iframe id='viewer'></iframe>
    </div>
    <button id="highlightActionButton" title="Save highlight">Save highlight</button>
    <script src="js/index.js"></script>
```

- Button styling (hidden until a selection is valid):
```92:108:src/css/index.css
#highlightActionButton {
    position: fixed;
    display: none;
    z-index: 20;
    background: #ffc107;
    color: #1e1e1e;
    border: 1px solid #e0a106;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
#highlightActionButton:hover {
    background: #ffd54f;
}
```

- Highlight manager core (selection handling, rendering, persistence; now stores green fill/stroke per highlight and restores smoothly):
```13:112:src/js/index.js
class HighlightManager {
    constructor(viewerElement, getCurrentFilePath) {
        this._viewerElement = viewerElement;
        this._getCurrentFilePath = getCurrentFilePath;
        this._button = this._createButton();
        this._pendingRender = false;
        this._rafId = null;
        this._isRendering = false;
        ...
    }
    attach() {
        ...
        this._currentWindow.addEventListener('pagerendered',
            this._onPageRender);
        this._currentWindow.addEventListener('pagesloaded',
            this._onPageRender);
        ...
        this._observePages();
        this._scheduleRenderAllHighlights();
    }
    reset() {
        ...
        if (this._currentWindow) {
            this._currentWindow.removeEventListener('pagerendered',
                this._onPageRender);
            this._currentWindow.removeEventListener('pagesloaded',
                this._onPageRender);
            if (this._rafId) {
                this._currentWindow.cancelAnimationFrame(this._rafId);
            }
        }
        ...
    }
```

- Selection UX (button show/hide/position on selection, click, scroll):
```143:178:src/js/index.js
    _onSelectionChange() {
        const selection = this._getSelection();
        if (!selection || selection.isCollapsed ||
            !selection.toString().trim()) {
            this._hideButton();
            return;
        }
        const range = selection.getRangeAt(0);
        const pageElement = this._findPageElement(
            range.commonAncestorContainer);
        if (!pageElement) {
            this._hideButton();
            return;
        }
        this._lastRange = range.cloneRange();
        this._lastPageElement = pageElement;
        this._positionButton(range);
    }
    _onViewerClick() {
        const selection = this._getSelection();
        if (!selection || selection.isCollapsed ||
            !selection.toString().trim()) {
            this._hideButton();
            return;
        }
        this._positionButton(selection.getRangeAt(0));
    }
    _onViewerScroll() {
        if (this._lastRange) {
            this._positionButton(this._lastRange);
            return;
        }
        this._hideButton();
    }
```

- Saving highlights with persistent green color:
```218:235:src/js/index.js
    _buildHighlightFromRange() {
        ...
        return {
            id: `hl-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            pageNumber,
            rects,
            text,
            fill: 'rgba(46, 125, 50, 0.35)',
            stroke: 'rgba(27, 94, 32, 0.45)'
        };
    }
```

- Rendering highlights as continuous green bands (merges rects, pads gaps, applies stored colors):
```317:357:src/js/index.js
    _renderHighlight(highlight) {
        ...
        const mergedRects = this._mergeRects(highlight.rects);
        const fill = highlight.fill || 'rgba(46, 125, 50, 0.35)';
        const stroke = highlight.stroke || 'rgba(27, 94, 32, 0.45)';
        ...
        const PAD = 0.002; // small padding to avoid visible gaps
        mergedRects.forEach(rect => {
            ...
            marker.style.background = fill;
            marker.style.boxShadow = `inset 0 0 0 1px ${stroke}`;
            ...
        });
    }
```

- Style injection for highlight overlays (default green fill/border):
```282:301:src/js/index.js
.lector-highlight {
    position: absolute;
    background: rgba(46, 125, 50, 0.35);
    box-shadow: inset 0 0 0 1px rgba(27, 94, 32, 0.45);
    border-radius: 2px;
    pointer-events: none;
}
```

- Render scheduling and resilience (avoids render loops, repaints on PDF state changes):
```360:438:src/js/index.js
    _renderAllHighlights() { ... guarded by _isRendering ... }
    _scheduleRenderAllHighlights() { ... requestAnimationFrame ... }
    _mergeRects(rects) { ... merges same-line rects for smooth bands ... }
    _observePages() {
        this._pageObserver = new MutationObserver(() => {
            this._scheduleRenderAllHighlights();
        });
        this._pageObserver.observe(viewer, { childList: true, subtree: true });
    }
```

- Reader wiring (construct, attach, reset):
```374:383:src/js/index.js
            this._highlightManager = new HighlightManager(
                this._viewerElement,
                this._getCurrentFilePath.bind(this)
            );
```
```589:611:src/js/index.js
        _setViewerEvents() {
            ...
            this._highlightManager.attach();
        }
        _openInViewer(pathName) {
            this._highlightManager.reset();
            this._viewerElement.src = 'lib/pdfjs/web/viewer.html?file=' +
                encodeURIComponent(pathName);
            this._viewerElement.onload = this._setViewerEvents.bind(this);
        }
```
```444:466:src/js/index.js
                if (that._tabs.length === 1) {
                    ...
                    that._highlightManager.reset();
                    ...
                }
```
