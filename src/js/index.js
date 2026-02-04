"use strict";
/*------------------------------------------------------------------------------
 *  Copyright (c) 2019 Sagar Gurtu
 *  Licensed under the MIT License.
 *  See License in the project root for license information.
 *----------------------------------------------------------------------------*/

(function () {

    const { ipcRenderer, remote } = require('electron');
    const customTitlebar = require('custom-electron-titlebar');
    const TAGS_TAB_PATH = 'mnemomark://tags-and-highlights';
    const TAGS_TAB_LABEL = 'Tags and Highlights';

    class HighlightManager {

        constructor(viewerElement, getCurrentFilePath) {
            this._viewerElement = viewerElement;
            this._getCurrentFilePath = getCurrentFilePath;

            this._button = this._createButton();
            this._currentDoc = null;
            this._currentWindow = null;
            this._lastRange = null;
            this._lastPageElement = null;
            this._pageObserver = null;
            this._pendingRender = false;
            this._rafId = null;
            this._isRendering = false;

            this._onSelectionChange = this._onSelectionChange.bind(this);
            this._onViewerClick = this._onViewerClick.bind(this);
            this._onViewerScroll = this._onViewerScroll.bind(this);
            this._onPageRender = this._scheduleRenderAllHighlights.bind(this);
            this._onViewerMouseDown = this._onViewerMouseDown.bind(this);
            this._onViewerMouseUp = this._onViewerMouseUp.bind(this);
            this._onViewerContextMenu = this._onViewerContextMenu.bind(this);
            this._isSelecting = false;

            this._modal = document.getElementById('highlightModal');
            this._modalTitle = document.getElementById('highlightModalTitle');
            this._modalSelectedText = document.getElementById('highlightModalSelectedText');
            this._modalTagContainer = document.getElementById('highlightTagCheckboxes');
            this._modalNoteInput = document.getElementById('highlightNoteInput');
            this._modalSaveBtn = document.getElementById('highlightModalSave');
            this._modalCancelBtn = document.getElementById('highlightModalCancel');
            this._modalCloseBtn = document.getElementById('highlightModalClose');
            this._modalDeleteBtn = document.getElementById('highlightModalDelete');

            this._pendingRange = null;
            this._pendingPageElement = null;
            this._editingHighlightId = null;
            this._previewHighlightId = null;

            this._initModal();
        }

        attach() {
            this.reset();
            if (!this._viewerElement || !this._viewerElement.contentDocument) {
                return;
            }
            this._currentDoc = this._viewerElement.contentDocument;
            this._currentWindow = this._viewerElement.contentWindow;
            this._hideButton();
            this._ensureHighlightStyles();
            if (this._currentWindow) {
                this._currentWindow.addEventListener('pagerendered',
                    this._onPageRender);
                this._currentWindow.addEventListener('pagesloaded',
                    this._onPageRender);
            }

            this._currentDoc.addEventListener('selectionchange',
                this._onSelectionChange);
            this._currentDoc.addEventListener('mouseup',
                this._onSelectionChange);
            this._currentDoc.addEventListener('mousedown',
                this._onViewerMouseDown);
            this._currentDoc.addEventListener('mouseup',
                this._onViewerMouseUp);
            this._currentDoc.addEventListener('click', this._onViewerClick);
            this._currentDoc.addEventListener('contextmenu',
                this._onViewerContextMenu);
            this._currentDoc.addEventListener('scroll', this._onViewerScroll,
                true);

            this._observePages();
            this._scheduleRenderAllHighlights();
        }

        reset() {
            if (this._currentDoc) {
                this._currentDoc.removeEventListener('selectionchange',
                    this._onSelectionChange);
                this._currentDoc.removeEventListener('mouseup',
                    this._onSelectionChange);
                this._currentDoc.removeEventListener('mousedown',
                    this._onViewerMouseDown);
                this._currentDoc.removeEventListener('mouseup',
                    this._onViewerMouseUp);
                this._currentDoc.removeEventListener('click',
                    this._onViewerClick);
                this._currentDoc.removeEventListener('contextmenu',
                    this._onViewerContextMenu);
                this._currentDoc.removeEventListener('scroll',
                    this._onViewerScroll, true);
            }
            if (this._pageObserver) {
                this._pageObserver.disconnect();
                this._pageObserver = null;
            }
            if (this._currentWindow) {
                this._currentWindow.removeEventListener('pagerendered',
                    this._onPageRender);
                this._currentWindow.removeEventListener('pagesloaded',
                    this._onPageRender);
                if (this._rafId) {
                    this._currentWindow.cancelAnimationFrame(this._rafId);
                }
            }
            this._rafId = null;
            this._pendingRender = false;
            this._isRendering = false;
            this._currentDoc = null;
            this._currentWindow = null;
            this._lastRange = null;
            this._lastPageElement = null;
            this._isSelecting = false;
            this._hideButton();
        }

        _createButton() {
            const button = document.getElementById('highlightActionButton');
            if (!button) {
                return null;
            }
            button.addEventListener('click', () => {
                this._openCreateHighlightModal();
            });
            return button;
        }

        _clearSelection() {
            const selection = this._getSelection();
            if (selection) {
                selection.removeAllRanges();
            }
            this._lastRange = null;
            this._lastPageElement = null;
        }

        _getSelection() {
            if (!this._currentWindow) {
                return null;
            }
            return this._currentWindow.getSelection();
        }

        _hideButton() {
            if (this._button) {
                this._button.style.display = 'none';
            }
        }

        _positionButton(range) {
            if (!this._button) {
                return;
            }
            const rect = range.getBoundingClientRect();
            const iframeRect = this._viewerElement.getBoundingClientRect();
            const buttonSize = this._button.offsetHeight || 32;
            const offset = 8;
            const viewportLeft = iframeRect.left + rect.right + offset + window.scrollX;
            const viewportTop = iframeRect.top + rect.top - buttonSize - offset + window.scrollY;

            let left = viewportLeft;
            let top = viewportTop;

            // If button would go off the right edge, place it to the left of selection
            const maxLeft = window.scrollX + window.innerWidth - buttonSize - offset;
            if (left > maxLeft) {
                left = iframeRect.left + rect.left - buttonSize - offset + window.scrollX;
            }

            // If button would go above the viewport, place it below the selection
            if (top < window.scrollY) {
                top = iframeRect.top + rect.bottom + offset + window.scrollY;
            }

            this._button.style.top = `${Math.max(window.scrollY, top)}px`;
            this._button.style.left = `${Math.max(window.scrollX, left)}px`;
            this._button.style.display = 'block';
        }

        _findPageElement(node) {
            let current = node;
            while (current) {
                if (current.classList &&
                    current.classList.contains('page')) {
                    return current;
                }
                current = current.parentNode;
            }
            return null;
        }

        _onSelectionChange() {
            const selection = this._getSelection();
            if (!selection || selection.isCollapsed ||
                !selection.toString().trim()) {
                if (!this._isSelecting) {
                this._hideButton();
                }
                return;
            }
            const range = selection.getRangeAt(0);
            const pageElement = this._findPageElement(
                range.commonAncestorContainer);
            if (!pageElement) {
                if (!this._isSelecting) {
                this._hideButton();
                }
                return;
            }
            this._lastRange = range.cloneRange();
            this._lastPageElement = pageElement;
            this._positionButton(range);
        }

        _onViewerMouseDown() {
            this._isSelecting = true;
        }

        _onViewerMouseUp() {
            this._isSelecting = false;
            this._onSelectionChange();
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

        _buildHighlightFromRange() {
            return this._buildHighlightFromSelection(this._lastRange, this._lastPageElement);
        }

        _buildHighlightFromSelection(range, pageElement) {
            if (!range || !pageElement) {
                return null;
            }
            const selection = this._getSelection();
            const text = selection ? selection.toString() : '';
            const pageNumber = Number(pageElement
                .getAttribute('data-page-number'));

            const pageRect = pageElement.getBoundingClientRect();
            const pageWidth = pageRect.width;
            const pageHeight = pageRect.height;

            const rects = Array.from(range.getClientRects()).map(
                rect => ({
                    top: (rect.top - pageRect.top) / pageHeight,
                    left: (rect.left - pageRect.left) / pageWidth,
                    width: rect.width / pageWidth,
                    height: rect.height / pageHeight
                })
            );

            if (!rects.length) {
                return null;
            }

            return {
                id: `hl-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                pageNumber,
                rects,
                text,
                fill: 'rgba(46, 125, 50, 0.35)',
                stroke: 'rgba(27, 94, 32, 0.45)',
                tags: [],
                note: ''
            };
        }

        _getStorageKey() {
            const path = this._getCurrentFilePath ?
                this._getCurrentFilePath() : null;
            return path ? `lector-highlights:${path}` : null;
        }

        _loadHighlights() {
            const key = this._getStorageKey();
            if (!key) {
                return [];
            }
            try {
                const stored = localStorage.getItem(key);
                return stored ? JSON.parse(stored) : [];
            } catch (err) {
                console.error('Unable to load highlights', err);
                return [];
            }
        }

        _persistHighlights(highlights) {
            const key = this._getStorageKey();
            if (!key) {
                return;
            }
            try {
                localStorage.setItem(key, JSON.stringify(highlights));
            } catch (err) {
                console.error('Unable to save highlights', err);
            }
        }

        _saveHighlight(highlight) {
            const highlights = this._loadHighlights();
            const filtered = highlights.filter(item => item.id !== highlight.id);
            filtered.push(highlight);
            this._persistHighlights(filtered);
        }

        _updateHighlight(highlightId, updates) {
            const highlights = this._loadHighlights();
            const updated = highlights.map(item => {
                if (item.id === highlightId) {
                    return { ...item, ...updates };
                }
                return item;
            });
            this._persistHighlights(updated);
            return updated.find(item => item.id === highlightId) || null;
        }

        _deleteHighlight(highlightId) {
            const highlights = this._loadHighlights();
            const filtered = highlights.filter(item => item.id !== highlightId);
            this._persistHighlights(filtered);
            if (this._currentDoc) {
                this._currentDoc.querySelectorAll(
                    `[data-highlight-id="${highlightId}"]`)
                    .forEach(node => node.remove());
            }
        }

        _ensureHighlightStyles() {
            if (!this._currentDoc ||
                this._currentDoc.getElementById('lectorHighlightStyles')) {
                return;
            }
            const style = this._currentDoc.createElement('style');
            style.id = 'lectorHighlightStyles';
            style.textContent = `
.lector-highlight-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}
.lector-highlight {
    position: absolute;
    background: rgba(46, 125, 50, 0.35);
    box-shadow: inset 0 0 0 1px rgba(27, 94, 32, 0.45);
    border-radius: 2px;
    pointer-events: none;
}
.textLayer ::selection {
    background: rgba(76, 175, 80, 0.35);
}
::selection {
    background: rgba(76, 175, 80, 0.35);
}
            `;
            this._currentDoc.head.appendChild(style);
        }

        _getHighlightLayer(pageElement) {
            if (!pageElement || !this._currentDoc) {
                return null;
            }
            let layer = pageElement.querySelector('.lector-highlight-layer');
            if (!layer) {
                layer = this._currentDoc.createElement('div');
                layer.classList.add('lector-highlight-layer');
                pageElement.appendChild(layer);
            }
            return layer;
        }

        _renderHighlight(highlight) {
            if (!this._currentDoc) {
                return;
            }
            const pageElement = this._currentDoc.querySelector(
                `.page[data-page-number="${highlight.pageNumber}"]`);
            if (!pageElement) {
                return;
            }
            const layer = this._getHighlightLayer(pageElement);
            if (!layer) {
                return;
            }

            const pageRect = pageElement.getBoundingClientRect();
            const pageWidth = pageRect.width;
            const pageHeight = pageRect.height;
            const mergedRects = this._mergeRects(highlight.rects);
            const fill = highlight.fill || 'rgba(46, 125, 50, 0.35)';
            const stroke = highlight.stroke || 'rgba(27, 94, 32, 0.45)';

            layer.querySelectorAll(
                `[data-highlight-id="${highlight.id}"]`)
                .forEach(node => node.remove());

            const PAD = 0.002; // small padding to avoid visible gaps
            mergedRects.forEach(rect => {
                const normTop = Math.max(0, rect.top - PAD);
                const normBottom = Math.min(1, rect.top + rect.height + PAD);
                const normHeight = Math.max(0, normBottom - normTop);
                const marker = this._currentDoc.createElement('div');
                marker.classList.add('lector-highlight');
                marker.dataset.highlightId = highlight.id;
                marker.style.background = fill;
                marker.style.boxShadow = `inset 0 0 0 1px ${stroke}`;
                marker.style.top = `${normTop * pageHeight}px`;
                marker.style.left = `${rect.left * pageWidth}px`;
                marker.style.width = `${rect.width * pageWidth}px`;
                marker.style.height = `${normHeight * pageHeight}px`;
                layer.appendChild(marker);
            });
        }

        _renderAllHighlights() {
            if (this._isRendering) {
                return;
            }
            this._isRendering = true;
            try {
                this._loadHighlights().forEach(
                    highlight => this._renderHighlight(highlight));
            } finally {
                this._isRendering = false;
            }
        }

        _scheduleRenderAllHighlights() {
            if (this._pendingRender || !this._currentWindow) {
                return;
            }
            this._pendingRender = true;
            this._rafId = this._currentWindow.requestAnimationFrame(() => {
                this._pendingRender = false;
                this._renderAllHighlights();
            });
        }

        _mergeRects(rects) {
            if (!rects || rects.length === 0) {
                return [];
            }
            const sorted = rects.slice().sort((a, b) => {
                if (a.top === b.top) {
                    return a.left - b.left;
                }
                return a.top - b.top;
            });
            const merged = [];
            const SAME_LINE_EPS = 0.003;
            const HEIGHT_EPS = 0.02;

            sorted.forEach(rect => {
                if (merged.length === 0) {
                    merged.push({ ...rect });
                    return;
                }
                const last = merged[merged.length - 1];
                const sameLine =
                    Math.abs(rect.top - last.top) < SAME_LINE_EPS &&
                    Math.abs(rect.height - last.height) < HEIGHT_EPS;
                if (sameLine) {
                    const left = Math.min(last.left, rect.left);
                    const right = Math.max(
                        last.left + last.width, rect.left + rect.width);
                    merged[merged.length - 1] = {
                        top: Math.min(last.top, rect.top),
                        left,
                        width: right - left,
                        height: Math.max(last.height, rect.height)
                    };
                } else {
                    merged.push({ ...rect });
                }
            });
            return merged;
        }

        _observePages() {
            if (!this._currentDoc) {
                return;
            }
            const viewer = this._currentDoc.getElementById('viewer');
            if (!viewer) {
                return;
            }
            this._pageObserver = new MutationObserver(() => {
                this._scheduleRenderAllHighlights();
            });
            this._pageObserver.observe(viewer, {
                childList: true,
                subtree: true
            });
        }

        _initModal() {
            if (!this._modal) {
                return;
            }
            const closeModal = () => this._closeHighlightModal();
            this._modalCloseBtn && this._modalCloseBtn.addEventListener('click', closeModal);
            this._modalCancelBtn && this._modalCancelBtn.addEventListener('click', closeModal);
            this._modalSaveBtn && this._modalSaveBtn.addEventListener('click', () => {
                this._saveHighlightFromModal();
            });
            this._modalDeleteBtn && this._modalDeleteBtn.addEventListener('click', () => {
                if (this._editingHighlightId) {
                    this._deleteHighlight(this._editingHighlightId);
                    this._closeHighlightModal();
                }
            });
            this._modal.addEventListener('click', (event) => {
                if (event.target === this._modal) {
                    this._closeHighlightModal();
                }
            });
        }

        _loadTags() {
            try {
                return JSON.parse(localStorage.getItem('mnemomark-tags') || '[]');
            } catch (err) {
                return [];
            }
        }

        _getAllParentTags(tagId, tags, visited = new Set()) {
            if (visited.has(tagId)) {
                return [];
            }
            visited.add(tagId);
            const tag = tags.find(t => t.id === tagId);
            if (!tag || !tag.parentIds || tag.parentIds.length === 0) {
                return [];
            }
            const parentTags = [];
            tag.parentIds.forEach(parentId => {
                const parentTag = tags.find(t => t.id === parentId);
                if (parentTag) {
                    parentTags.push(parentTag.id);
                    parentTags.push(...this._getAllParentTags(parentId, tags, visited));
                }
            });
            return parentTags;
        }

        _expandTagsWithParents(tagIds, tags) {
            if (!tagIds || tagIds.length === 0) {
                return [];
            }
            const expanded = new Set(tagIds);
            tagIds.forEach(tagId => {
                this._getAllParentTags(tagId, tags).forEach(parentId => {
                    expanded.add(parentId);
                });
            });
            return Array.from(expanded);
        }

        _renderTagCheckboxes(tags, selectedIds) {
            if (!this._modalTagContainer) {
                return;
            }
            this._modalTagContainer.innerHTML = '';
            if (!tags.length) {
                this._modalTagContainer.innerHTML = '<div style="color:#888;font-size:12px;">No tags created yet.</div>';
                return;
            }
            tags.forEach(tag => {
                const label = document.createElement('label');
                const checked = selectedIds.includes(tag.id);
                label.innerHTML = `
                    <input type="checkbox" value="${tag.id}" ${checked ? 'checked' : ''}>
                    <span style="width:12px;height:12px;border-radius:3px;background:${tag.color};display:inline-block;border:1px solid #333;"></span>
                    <span>${tag.name}</span>
                `;
                this._modalTagContainer.appendChild(label);
            });
        }

        _openCreateHighlightModal() {
            const selection = this._getSelection();
            if (!selection || selection.isCollapsed || !selection.toString().trim()) {
                this._hideButton();
                return;
            }
            const range = selection.getRangeAt(0).cloneRange();
            const pageElement = this._findPageElement(range.commonAncestorContainer);
            if (!pageElement) {
                this._hideButton();
                return;
            }
            this._pendingRange = range;
            this._pendingPageElement = pageElement;
            this._editingHighlightId = null;
            this._renderPreviewHighlight();
            this._showHighlightModal('create', selection.toString());
        }

        _showHighlightModal(mode, selectedText, highlight) {
            if (!this._modal) {
                return;
            }
            const tags = this._loadTags();
            const selectedIds = highlight && highlight.tags ? highlight.tags : [];
            this._renderTagCheckboxes(tags, selectedIds);
            if (this._modalTitle) {
                this._modalTitle.textContent = mode === 'edit' ? 'Edit Highlight' : 'Highlight Selection';
            }
            if (this._modalSelectedText) {
                this._modalSelectedText.textContent = selectedText || '';
            }
            if (this._modalNoteInput) {
                this._modalNoteInput.value = highlight && highlight.note ? highlight.note : '';
            }
            if (this._modalSaveBtn) {
                this._modalSaveBtn.textContent = mode === 'edit' ? 'Save' : 'Highlight';
            }
            if (this._modalDeleteBtn) {
                this._modalDeleteBtn.style.display = mode === 'edit' ? 'inline-block' : 'none';
            }
            this._modal.style.display = 'flex';
        }

        _closeHighlightModal() {
            if (this._modal) {
                this._modal.style.display = 'none';
            }
            this._pendingRange = null;
            this._pendingPageElement = null;
            this._editingHighlightId = null;
            this._clearPreviewHighlight();
        }

        _saveHighlightFromModal() {
            const tags = this._loadTags();
            const selectedTagIds = Array.from(
                this._modalTagContainer.querySelectorAll('input[type="checkbox"]:checked')
            ).map(input => input.value);
            const expandedTagIds = this._expandTagsWithParents(selectedTagIds, tags);
            const note = this._modalNoteInput ? this._modalNoteInput.value.trim() : '';

            if (this._editingHighlightId) {
                this._updateHighlight(this._editingHighlightId, { tags: expandedTagIds, note });
                this._closeHighlightModal();
                return;
            }

            const highlight = this._buildHighlightFromSelection(
                this._pendingRange,
                this._pendingPageElement
            );
            if (!highlight) {
                this._closeHighlightModal();
                return;
            }
            highlight.tags = expandedTagIds;
            highlight.note = note;
            this._clearPreviewHighlight();
            this._saveHighlight(highlight);
            this._renderHighlight(highlight);
            this._clearSelection();
            this._hideButton();
            this._closeHighlightModal();
        }

        _renderPreviewHighlight() {
            this._clearPreviewHighlight();
            if (!this._pendingRange || !this._pendingPageElement) {
                return;
            }
            const previewHighlight = this._buildHighlightFromSelection(
                this._pendingRange,
                this._pendingPageElement
            );
            if (!previewHighlight) {
                return;
            }
            this._previewHighlightId = previewHighlight.id;
            this._renderHighlight(previewHighlight);
        }

        _clearPreviewHighlight() {
            if (!this._currentDoc || !this._previewHighlightId) {
                return;
            }
            this._currentDoc.querySelectorAll(
                `[data-highlight-id="${this._previewHighlightId}"]`)
                .forEach(node => node.remove());
            this._previewHighlightId = null;
        }

        _findHighlightAtPoint(event) {
            if (!this._currentDoc) {
                return null;
            }
            const pageElement = this._findPageElement(event.target);
            if (!pageElement) {
                return null;
            }
            const pageNumber = Number(pageElement.getAttribute('data-page-number'));
            const pageRect = pageElement.getBoundingClientRect();
            const x = (event.clientX - pageRect.left) / pageRect.width;
            const y = (event.clientY - pageRect.top) / pageRect.height;
            const PAD = 0.004;
            const highlights = this._loadHighlights();
            return highlights.find(item => {
                if (item.pageNumber !== pageNumber || !item.rects) {
                    return false;
                }
                return item.rects.some(rect => {
                    const left = rect.left - PAD;
                    const top = rect.top - PAD;
                    const right = rect.left + rect.width + PAD;
                    const bottom = rect.top + rect.height + PAD;
                    return x >= left && x <= right && y >= top && y <= bottom;
                });
            }) || null;
        }

        _onViewerContextMenu(event) {
            const highlight = this._findHighlightAtPoint(event);
            if (!highlight) {
                return;
            }
            event.preventDefault();
            this._editingHighlightId = highlight.id;
            this._showHighlightModal('edit', highlight.text || '', highlight);
        }

    }

    /**
     * @desc Main view class containing all rendering and
     *       event listening operations
     */
    class Reader {

        constructor() {
            // Array of all path names
            this._paths = [];
            // Array of all tab elements
            this._tabs = [];
            // Total number of buckets
            this._buckets = 1;
            // Current tab element
            this._currentTab = null;
            // Current bucket index
            this._currentBucket = 0;
            // Number of tabs in one bucket
            this._computeStepTabs();

            // Title bar object
            this._titleBar = this._getTitleBar();

            this._tabContainer = document.getElementById('tabContainer');
            this._viewerElement = document.getElementById('viewer');
            this._leftSeekElement = document.getElementById('leftSeek');
            this._rightSeekElement =
                document.getElementById('rightSeek');
            this._highlightManager = new HighlightManager(
                this._viewerElement,
                this._getCurrentFilePath.bind(this)
            );
        }

        /**
         * @desc Computes stepTabs based on window size
         */
        _computeStepTabs() {
            this.stepTabs = Math.floor(window.innerWidth / 100);
        }

        _getCurrentFilePath() {
            if (!this._currentTab) {
                return null;
            }
            const index = this._tabs.indexOf(this._currentTab);
            if (index < 0) {
                return null;
            }
            return this._paths[index];
        }

        /**
         * @returns custom title bar object
         */
        _getTitleBar() {
            return new customTitlebar.Titlebar({
                backgroundColor: customTitlebar.Color.fromHex('#333'),
                icon: 'assets/images/logo.png'
            });
        }

        /**
         * @desc Appends tabs at bucketPosition to tabContainer
         * @param {*} bucketPosition
         */
        _appendTabsToContainer(bucketPosition) {
            this._tabContainer.innerHTML = "";
            for (let i = bucketPosition * this.stepTabs;
                i < this._tabs.length &&
                i < (bucketPosition + 1) * this.stepTabs;
                i++) {
                this._tabContainer.append(this._tabs[i]);
            }
        }

        /**
         * @desc Toggles seek elements based on number of buckets
         *       and current bucket
         */
        _toggleSeek() {
            this._leftSeekElement.classList = [];
            this._rightSeekElement.classList = [];
            if (this._buckets > 1) {
                if (this._currentBucket === 0) {
                    this._leftSeekElement.classList.add('inactive-seek');
                    this._rightSeekElement.classList.add('active-seek');
                } else if (this._currentBucket === this._buckets - 1) {
                    this._leftSeekElement.classList.add('active-seek');
                    this._rightSeekElement.classList.add('inactive-seek');
                } else {
                    this._leftSeekElement.classList.add('active-seek');
                    this._rightSeekElement.classList.add('active-seek');
                }
            } else {
                this._leftSeekElement.classList.add('inactive-seek');
                this._rightSeekElement.classList.add('inactive-seek');
            }
        }

        /**
         * @desc Recalculates number of buckets
         */
        _updateBuckets() {
            this._buckets = Math.ceil(this._tabs.length / this.stepTabs);
        }

        /**
         * @desc Re-renders tabs in tabContainer
         */
        _adjustTabs() {
            this._updateBuckets();

            let currentPosition = this._tabs.indexOf(this._currentTab);
            let newBucketPosition =
                Math.floor(currentPosition / this.stepTabs);

            if (newBucketPosition !== this._currentBucket ||
                this._tabContainer.childElementCount !== this.stepTabs) {
                this._appendTabsToContainer(newBucketPosition);
                this._currentBucket = newBucketPosition;
            }

            this._toggleSeek();
        }

        /**
         * @desc Toggles background info visibility based on flag
         * @param {*} flag
         */
        _toggleBackgroundInfo(flag) {
            let visibility = flag ? 'visible' : 'hidden';
            document.getElementById('backgroundInfo').style.visibility =
                visibility;
        }

        /**
         * @desc Creates a new tab element
         * @param {*} pathName
         */
        _createTabElement(pathName) {
            const filename = this._getTabLabel(pathName);
            const tabElement = document.createElement('div');
            const labelElement = document.createElement('div');
            const closeElement = document.createElement('div');
            let that = this;

            labelElement.innerHTML = filename;
            labelElement.setAttribute('class',
                'file-tab-label');

            closeElement.innerHTML = '&times;';
            closeElement.style.visibility = 'hidden';
            closeElement.setAttribute('class',
                'file-tab-close');

            tabElement.classList.add('file-tab');
            tabElement.classList.add('inactive');
            tabElement.setAttribute('data-path', pathName);

            tabElement.append(labelElement);
            tabElement.append(closeElement);

            closeElement.addEventListener('click', event => {
                let positionToRemove = that._tabs.indexOf(tabElement);
                if (that._tabs.length === 1) {
                    // If only one tab remaining, empty everything
                    that._currentTab = null;
                    that._tabContainer.innerHTML = "";
                    that._viewerElement.removeAttribute('src');
                    that._highlightManager.reset();
                    that._toggleMenuItems(false);
                    that._toggleBackgroundInfo(true);
                } else if (tabElement === that._currentTab) {
                    // If current tab is to be removed
                    let newCurrentPosition = positionToRemove;
                    // If tab to be removed is first in array,
                    // make next tab as current
                    if (positionToRemove === 0) {
                        newCurrentPosition = 1;
                    } else { // Else, make previous tab as current
                        newCurrentPosition -= 1;
                    }
                    // Switch to new current tab
                    that._switchTab(that._tabs[newCurrentPosition]);
                }
                // Remove tab from paths and tabs and update buckets
                that._paths.splice(positionToRemove, 1);
                that._tabs.splice(positionToRemove, 1);
                that._updateBuckets();

                // If atleast one tab remaining
                if (that._tabs.length > 0) {
                    // If this bucket has no tabs, render current bucket
                    if (that._tabContainer.childElementCount === 1) {
                        that._adjustTabs();
                    } else {
                        // Else, re-render this bucket without switching to
                        // current bucket
                        that._appendTabsToContainer(that._currentBucket);
                    }
                } else { // If no tabs remaining
                    that._toggleTabContainer(false);
                    that._updateTitle();
                }
                that._toggleSeek();
                event.stopPropagation();

            });

            tabElement.addEventListener('mouseover', event => {
                if (tabElement !== that._currentTab) {
                    closeElement.style.visibility = 'visible';
                }
            });

            tabElement.addEventListener('mouseleave', event => {
                if (tabElement !== that._currentTab) {
                    closeElement.style.visibility = 'hidden';
                }
            });

            tabElement.addEventListener('click', event => {
                if (tabElement !== that._currentTab) {
                    that._switchTab(tabElement);
                }
            });

            return tabElement;
        }

        _getTabLabel(pathName) {
            if (this._isTagsTab(pathName)) {
                return TAGS_TAB_LABEL;
            }
            return pathName.substring(pathName.lastIndexOf('\\') + 1);
        }

        _isTagsTab(pathName) {
            return pathName === TAGS_TAB_PATH;
        }

        /**
         * @desc Dispatches click event to window
         */
        _propagateClick() {
            window.dispatchEvent(new Event('mousedown'));
        }

        /**
         * @desc Propagates iframe events to window
         */
        _setViewerEvents() {
            if (!this._viewerElement.contentDocument) {
                return;
            }
            const viewerDoc = this._viewerElement.contentDocument;
            const hasPdfViewer = !!viewerDoc.getElementById('viewer');
            if (hasPdfViewer) {
                viewerDoc.addEventListener('click', this._propagateClick);
                viewerDoc.addEventListener('mousedown', this._propagateClick);
            this._highlightManager.attach();
                return;
            }
            this._highlightManager.reset();
            this._hideHighlightButton();
        }

        /**
         * @desc Opens pathName in iframe
         * @param {*} pathName
         */
        _openInViewer(pathName) {
            this._highlightManager.reset();
            if (this._isTagsTab(pathName)) {
                this._viewerElement.src = 'tags-and-highlights.html';
                this._viewerElement.onload = () => {
                    this._highlightManager.reset();
                    this._hideHighlightButton();
                };
                return;
            }
            this._viewerElement.src = 'lib/pdfjs/web/viewer.html?file=' +
                encodeURIComponent(pathName);
            this._viewerElement.onload = this._setViewerEvents.bind(this);
        }

        /**
         * @desc Focuses the current tab and opens current file in iframe
         */
        _focusCurrentTab() {
            this._tabs.forEach(tabElement => {
                tabElement.classList.remove('active');
                tabElement.classList.add('inactive');
                tabElement.getElementsByClassName('file-tab-close')[0]
                    .style.visibility = 'hidden';
            });
            this._currentTab.classList.remove('inactive');
            this._currentTab.classList.add('active');
            this._currentTab.getElementsByClassName('file-tab-close')[0]
                .style.visibility = 'visible';
            this._openInViewer(
                this._paths[this._tabs.indexOf(this._currentTab)]);
        }

        /**
         * @desc Switches to tabElement
         * @param {*} tabElement
         */
        _switchTab(tabElement) {
            if (this._currentTab !== tabElement) {
                this._currentTab = tabElement;
                this._updateTitle(this._paths[this._tabs.indexOf(tabElement)]);
                this._adjustTabs();
                this._focusCurrentTab();
            }
        }

        /**
         * @desc Toggles tab container visibililty
         * @param {*} visible
         */
        _toggleTabContainer(visible) {
            const visibility = visible ? 'visible' : 'hidden';
            this._tabContainer.style.visibility = visibility;
            this._leftSeekElement.style.visibility = visibility;
            this._rightSeekElement.style.visibility = visibility;
        }

        /**
         * @desc Sends enable/disable flag for toggle-menu-items
         * @param {*} flag
         */
        _toggleMenuItems(flag) {
            ipcRenderer.send('toggle-menu-items', flag);
        }

        _hideHighlightButton() {
            const highlightButton = document.getElementById('highlightActionButton');
            if (highlightButton) {
                highlightButton.style.display = 'none';
            }
        }

        /**
         * @desc Adds a new tab
         * @param {*} pathName
         */
        _addTab(pathName) {
            // Enable visibility of tabContainer, etc. when the
            // first tab is added
            if (this._tabs.length === 0) {
                this._toggleTabContainer(true);
                this._toggleMenuItems(true);
                this._toggleBackgroundInfo(false);
            }

            // Switch to tab if already open
            if (this._paths.indexOf(pathName) >= 0) {
                this._switchTab(this._tabs[this._paths.indexOf(pathName)]);
                return;
            }

            const tabElement = this._createTabElement(pathName);

            this._currentTab = tabElement;
            this._tabs.push(tabElement);
            this._paths.push(pathName);
            this._tabContainer.append(tabElement);
            this._adjustTabs();
            this._focusCurrentTab();
        }

        _openTagsHighlightsTab() {
            if (this._paths.indexOf(TAGS_TAB_PATH) >= 0) {
                this._switchTab(this._tabs[this._paths.indexOf(TAGS_TAB_PATH)]);
                return;
            }
            this._addTab(TAGS_TAB_PATH);
        }

        /**
         * @desc Updates title
         * @param {*} pathName
         */
        _updateTitle(pathName) {
            this._titleBar.updateTitle("MnemoMark");
        }

        /**
         * @desc Opens a file
         * @param {*} pathName
         */
        _openFile(pathName) {
            this._updateTitle(pathName);
            this._addTab(pathName);
        }

        /**
         * @desc Sets menu item events
         *       'click' needs to be propagated (custom-electron-titlebar issue)
         */
        _setMenuItemEvents() {
            ipcRenderer.on('file-open', (event, args) => {
                this._propagateClick();
                this._openFile(args);
            });

            ipcRenderer.on('file-print', (event, args) => {
                this._propagateClick();
                if (this._viewerElement.src) {
                    this._viewerElement.contentDocument
                        .getElementById('print').dispatchEvent(
                            new Event('click'));
                }
            });

            ipcRenderer.on('file-properties', (event, args) => {
                this._propagateClick();
                if (this._viewerElement.src) {
                    this._viewerElement.contentDocument
                        .getElementById('documentProperties')
                        .dispatchEvent(new Event('click'));
                }
            });

            ipcRenderer.on('file-close', (event, args) => {
                this._propagateClick();
                if (this._currentTab) {
                    this._currentTab.getElementsByClassName('file-tab-close')[0]
                        .dispatchEvent(new Event('click'));
                }
            });

            ipcRenderer.on('view-fullscreen', (event, args) => {
                this._propagateClick();
                if (this._viewerElement.src) {
                    this._viewerElement.contentDocument
                        .getElementById('presentationMode')
                        .dispatchEvent(new Event('click'));
                }
            });

            ipcRenderer.on('open-tags-highlights', () => {
                this._propagateClick();
                this._openTagsHighlightsTab();
            });
        }

        /**
         * @desc Sets seek element events
         */
        _setSeekEvents() {
            let that = this;
            this._leftSeekElement.addEventListener('click', event => {
                if (that._currentBucket > 0) {
                    that._currentBucket--;
                    that._appendTabsToContainer(that._currentBucket);
                    that._toggleSeek();
                }
            });

            this._rightSeekElement.addEventListener('click',
                event => {
                    if (that._currentBucket < that._buckets - 1) {
                        that._currentBucket++;
                        that._appendTabsToContainer(that._currentBucket);
                        that._toggleSeek();
                    }
                });

        }

        /**
         * @desc Sets window events
         */
        _setWindowEvents() {
            let that = this;
            // Adjust tabs on resize
            window.addEventListener('resize', event => {
                that._computeStepTabs();
                if (that._tabs.length > 0) {
                    that._adjustTabs();
                }
            });
        }

        /**
         * @desc Extracts path name from the arguments and opens the file.
         * @param {*} args 
         */
        _processArguments(args) {
            const argsLength = args.length;
            if (argsLength > 1 && args[argsLength - 1].endsWith(".pdf")) {
                this._openFile(args[argsLength - 1]);
            }
        }

        /**
         * @desc Sets external application events
         */
        _setExternalEvents() {
            let that = this;
            ipcRenderer.on('external-file-open', (event, args) => {
                that._processArguments(args);
            });
        }

        /**
         * @desc Process initial arguments to the application
         */
        _processRemoteArguments() {
            this._processArguments(remote.process.argv);
        }

        /**
         * @desc Runs the application
         */
        run() {
            this._setMenuItemEvents();
            this._setSeekEvents();
            this._setViewerEvents();
            this._setWindowEvents();
            this._setExternalEvents();
            this._processRemoteArguments();
        }

    }

    const application = new Reader();
    application.run();

})();
