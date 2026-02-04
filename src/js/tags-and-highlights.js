const TAGS_KEY = "mnemomark-tags";
const HIGHLIGHT_PREFIX = "lector-highlights:";

let tags = [];
let highlights = [];
let currentEditingTagId = null;
let currentEditingHighlightId = null;
let selectedHighlightIds = new Set();
let highlightSelectionVisible = false;

const tabs = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const tagsList = document.getElementById("tagsList");
const highlightsList = document.getElementById("highlightsList");
const searchTagsInput = document.getElementById("searchTagsInput");
const searchHighlightsInput = document.getElementById("searchHighlights");
const filterTagSelect = document.getElementById("filterTag");
const highlightSelectionTag = document.getElementById("highlightSelectionTag");
const selectionCriteria = document.getElementById("selectionCriteria");
const selectionValue = document.getElementById("selectionValue");
const selectionParentTag = document.getElementById("selectionParentTag");
const applySelectionBtn = document.getElementById("applySelectionBtn");
const clearSelectionBtn = document.getElementById("clearSelectionBtn");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const makeChildrenBtn = document.getElementById("makeChildrenBtn");
const selectedCount = document.getElementById("selectedCount");
const selectionActions = document.querySelector(".selection-actions");
const selectAllHighlightsBtn = document.getElementById("selectAllHighlightsBtn");
const highlightSelectionPanel = document.getElementById("highlightSelectionPanel");
const highlightSelectionCriteria = document.getElementById("highlightSelectionCriteria");
const highlightSelectionText = document.getElementById("highlightSelectionText");
const applyHighlightSelectionBtn = document.getElementById("applyHighlightSelectionBtn");
const clearHighlightSelectionBtn = document.getElementById("clearHighlightSelectionBtn");
const deleteSelectedHighlightsBtn = document.getElementById("deleteSelectedHighlightsBtn");
const addTagToSelectedHighlightsBtn = document.getElementById("addTagToSelectedHighlightsBtn");
const copySelectedHighlightsBtn = document.getElementById("copySelectedHighlightsBtn");
const highlightSelectionActions = document.getElementById("highlightSelectionActions");
const selectedHighlightsCount = document.getElementById("selectedHighlightsCount");

const totalTags = document.getElementById("totalTags");
const totalHighlights = document.getElementById("totalHighlights");
const totalPages = document.getElementById("totalPages");

const createTagBtn = document.getElementById("createTagBtn");
const tagModal = document.getElementById("tagModal");
const tagNameInput = document.getElementById("tagName");
const tagColorInput = document.getElementById("tagColor");
const parentTagsSelect = document.getElementById("parentTags");
const childTagsSelect = document.getElementById("childTags");
const saveTagBtn = document.getElementById("saveTagBtn");
const deleteTagBtn = document.getElementById("deleteTagBtn");
const closeModalBtn = document.getElementById("closeModal");
const cancelTagBtn = document.getElementById("cancelTagBtn");
const currentParentsDiv = document.getElementById("currentParents");
const currentChildrenDiv = document.getElementById("currentChildren");
const parentsList = document.getElementById("parentsList");
const childrenList = document.getElementById("childrenList");

const noteModal = document.getElementById("noteModal");
const noteText = document.getElementById("noteText");
const saveNoteBtn = document.getElementById("saveNoteBtn");
const cancelNoteBtn = document.getElementById("cancelNoteBtn");
const deleteNoteBtn = document.getElementById("deleteNoteBtn");
const closeNoteModal = document.getElementById("closeNoteModal");
const noteModalTitle = document.getElementById("noteModalTitle");

const selectTagsBtn = document.getElementById("selectTagsBtn");
const tagSelectionPanel = document.getElementById("tagSelectionPanel");

function loadTags() {
    if (window.authService && window.authService.getCurrentUser() && window.authService.isSharingTags()) {
        window.authService.syncTagsFromCloud().catch(() => {});
    }
    try {
        tags = JSON.parse(localStorage.getItem(TAGS_KEY) || "[]");
    } catch (error) {
        tags = [];
    }
}

function saveTags() {
    localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
    if (window.authService && window.authService.getCurrentUser() && window.authService.isSharingTags()) {
        window.authService.syncTagsToCloud().catch(() => {});
    }
}

function loadHighlights() {
    const all = [];
    Object.keys(localStorage).forEach(key => {
        if (!key.startsWith(HIGHLIGHT_PREFIX)) {
            return;
        }
        try {
            const items = JSON.parse(localStorage.getItem(key) || "[]");
            const filePath = key.slice(HIGHLIGHT_PREFIX.length);
            items.forEach(item => {
                all.push({
                    ...item,
                    _sourceKey: key,
                    _filePath: filePath
                });
            });
        } catch (error) {
            console.error("Unable to parse highlight data", error);
        }
    });
    highlights = all;
}

function saveHighlightUpdate(highlight) {
    const sourceKey = highlight._sourceKey;
    if (!sourceKey) return;
    const stored = JSON.parse(localStorage.getItem(sourceKey) || "[]");
    const updated = stored.map(item => {
        if (item.id === highlight.id) {
            return {
                ...item,
                tags: highlight.tags || [],
                note: highlight.note || ""
            };
        }
        return item;
    });
    localStorage.setItem(sourceKey, JSON.stringify(updated));
}

function saveHighlightDelete(highlight) {
    const sourceKey = highlight._sourceKey;
    if (!sourceKey) return;
    const stored = JSON.parse(localStorage.getItem(sourceKey) || "[]");
    const updated = stored.filter(item => item.id !== highlight.id);
    localStorage.setItem(sourceKey, JSON.stringify(updated));
}

function renderTabs() {
    tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.tab;
            tabs.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById(`${target}Tab`).classList.add("active");
        });
    });
}

function updateStats() {
    if (totalTags) totalTags.textContent = tags.length;
    if (totalHighlights) totalHighlights.textContent = highlights.length;
    const uniqueFiles = new Set(highlights.map(h => h._filePath));
    if (totalPages) totalPages.textContent = uniqueFiles.size;
}

function getAllParentTags(tagId, visited = new Set()) {
    if (visited.has(tagId)) {
        return [];
    }
    visited.add(tagId);
    const tag = tags.find(t => t.id === tagId);
    if (!tag || !tag.parentIds || tag.parentIds.length === 0) {
        return [];
    }
    const parents = [];
    tag.parentIds.forEach(parentId => {
        const parentTag = tags.find(t => t.id === parentId);
        if (!parentTag) {
            return;
        }
        parents.push(parentTag);
        parents.push(...getAllParentTags(parentId, visited));
    });
    return parents;
}

function renderTags(tagsToRender = null) {
    const list = tagsToRender || tags;
    tagsList.innerHTML = "";

    if (list.length === 0) {
        tagsList.innerHTML = '<div class="empty-state">No tags created yet.</div>';
        return;
    }

    list.forEach(tag => {
        const parents = getAllParentTags(tag.id);
        const uniqueParents = [];
        const seen = new Set();
        parents.forEach(parent => {
            if (!seen.has(parent.id)) {
                seen.add(parent.id);
                uniqueParents.push(parent);
            }
        });
        const parentNames = uniqueParents.map(p => p.name);

        const tagItem = document.createElement("div");
        tagItem.className = "tag-item";
        tagItem.dataset.tagId = tag.id;
        tagItem.innerHTML = `
            <div class="tag-info">
                <input type="checkbox" class="tag-checkbox" data-tag-id="${tag.id}" style="margin-right: 8px; cursor: pointer; display: none;">
                <div class="tag-color" style="background-color: ${tag.color}"></div>
                <div class="tag-details">
                    <div class="tag-name">${escapeHtml(tag.name)}</div>
                    ${parentNames.length > 0 ? `
                        <div class="tag-parents">
                            <div class="tag-parents-label">Parents</div>
                            <div class="tag-parents-list">
                                ${parentNames.map(name => `<span>${escapeHtml(name)}</span>`).join("")}
                            </div>
                        </div>
                    ` : ""}
                </div>
            </div>
            <div class="tag-actions">
                <button class="btn btn-primary btn-small btn-edit-tag" data-tag-id="${tag.id}">Edit</button>
            </div>
        `;

        tagItem.querySelector(".btn-edit-tag").addEventListener("click", () => {
            openTagModal(tag.id);
        });

        const checkbox = tagItem.querySelector(".tag-checkbox");
        if (checkbox) {
            checkbox.addEventListener("change", () => {
                tagItem.classList.toggle("tag-selected", checkbox.checked);
            });
        }

        tagsList.appendChild(tagItem);
    });
}

function filterTags() {
    if (!searchTagsInput) return;
    const term = searchTagsInput.value.toLowerCase().trim();
    if (!term) {
        renderTags();
        return;
    }
    const filtered = tags.filter(tag => tag.name.toLowerCase().includes(term));
    renderTags(filtered);
}

function renderHighlights(filteredHighlights = null) {
    const list = filteredHighlights || highlights;
    highlightsList.innerHTML = "";

    if (list.length === 0) {
        highlightsList.innerHTML = '<div class="empty-state">No highlights found.</div>';
        return;
    }

    list.forEach(highlight => {
        const tagNames = (highlight.tags || []).map(tagId => tags.find(t => t.id === tagId)).filter(Boolean);
        const fileName = highlight._filePath
            ? highlight._filePath.substring(highlight._filePath.lastIndexOf("\\") + 1)
            : "Unknown file";
        const tagButtonLabel = (highlight.tags && highlight.tags.length > 0) ? "Edit Tags" : "+ Add Tag";

        const highlightItem = document.createElement("div");
        highlightItem.className = "highlight-item";
        highlightItem.dataset.highlightId = highlight.id;
        highlightItem.innerHTML = `
            <div class="highlight-top">
                <input type="checkbox" class="highlight-checkbox" data-highlight-id="${highlight.id}" style="cursor: pointer; display: none;">
                <div class="highlight-text">
                    ${escapeHtml(highlight.text || "(no text)")}
                </div>
            </div>
            ${highlight.note ? `<div class="highlight-note">
                <strong>Note:</strong> ${escapeHtml(highlight.note)}
                <div style="margin-top: 8px; display: flex; flex-wrap: wrap;">
                    <button class="btn-edit-note" data-highlight-id="${highlight.id}" style="padding: 4px 8px; font-size: 11px; background: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer; margin-right: 12px;">Edit Note</button>
                    <button class="btn-add-tag" data-highlight-id="${highlight.id}" style="padding: 4px 8px; font-size: 11px; background: #e3f2fd; color: #1976d2; border: 1px solid #90caf9; border-radius: 3px; cursor: pointer;">${tagButtonLabel}</button>
                </div>
            </div>` : `<div style="margin: 8px 0; display: flex; flex-wrap: wrap;">
                <button class="btn-add-note" data-highlight-id="${highlight.id}" style="padding: 4px 8px; font-size: 11px; background: #f0f0f0; color: #666; border: 1px solid #ddd; border-radius: 3px; cursor: pointer; margin-right: 12px;">+ Add Note</button>
                <button class="btn-add-tag" data-highlight-id="${highlight.id}" style="padding: 4px 8px; font-size: 11px; background: #e3f2fd; color: #1976d2; border: 1px solid #90caf9; border-radius: 3px; cursor: pointer;">${tagButtonLabel}</button>
            </div>`}
            <div class="highlight-meta">
                <div class="highlight-tags">
                    ${tagNames.length > 0
                        ? tagNames.map(tag => `<span class="tag-badge" style="background-color: ${tag.color}20; color: ${tag.color}; border: 1px solid ${tag.color}40;">${escapeHtml(tag.name)}</span>`).join("")
                        : '<span class="tag-badge">No tags</span>'}
                </div>
                <span class="highlight-url">${escapeHtml(fileName)} • Page ${highlight.pageNumber || "-"}</span>
            </div>
            <div class="highlight-actions" style="margin-top: 12px; display: flex; gap: 8px;">
                <button class="btn-delete-highlight" data-highlight-id="${highlight.id}" style="padding: 6px 12px; font-size: 12px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>
            </div>
        `;

        const addNoteBtn = highlightItem.querySelector(".btn-add-note");
        const editNoteBtn = highlightItem.querySelector(".btn-edit-note");
        const addTagBtn = highlightItem.querySelector(".btn-add-tag");
        const deleteBtn = highlightItem.querySelector(".btn-delete-highlight");
        const checkbox = highlightItem.querySelector(".highlight-checkbox");

        if (addNoteBtn) addNoteBtn.addEventListener("click", () => editHighlightNote(highlight.id));
        if (editNoteBtn) editNoteBtn.addEventListener("click", () => editHighlightNote(highlight.id, highlight.note));
        if (addTagBtn) {
            addTagBtn.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                addTagToHighlight(highlight.id);
            });
        }
        if (deleteBtn) deleteBtn.addEventListener("click", () => deleteHighlight(highlight.id));
        if (checkbox) {
            checkbox.style.display = highlightSelectionVisible ? "block" : "none";
            checkbox.checked = selectedHighlightIds.has(highlight.id);
            highlightItem.classList.toggle("highlight-selected", checkbox.checked);
            checkbox.addEventListener("change", (e) => {
                if (e.target.checked) {
                    selectedHighlightIds.add(highlight.id);
                } else {
                    selectedHighlightIds.delete(highlight.id);
                }
                highlightItem.classList.toggle("highlight-selected", e.target.checked);
                updateSelectedHighlightsCount();
            });
        }

        highlightsList.appendChild(highlightItem);
    });
}

function filterHighlights() {
    const term = (searchHighlightsInput ? searchHighlightsInput.value : "").toLowerCase().trim();
    const tagId = filterTagSelect ? filterTagSelect.value : "";
    const filtered = highlights.filter(h => {
        const textMatch = !term || (h.text || "").toLowerCase().includes(term);
        const tagMatch = !tagId || (h.tags || []).includes(tagId);
        return textMatch && tagMatch;
    });
    renderHighlights(filtered);
}

function populateTagFilter() {
    if (!filterTagSelect) return;
    filterTagSelect.innerHTML = '<option value="">All Tags</option>';
    tags.forEach(tag => {
        const option = document.createElement("option");
        option.value = tag.id;
        option.textContent = tag.name;
        filterTagSelect.appendChild(option);
    });
    if (highlightSelectionTag) {
        highlightSelectionTag.innerHTML = '<option value="">Select tag...</option>';
        tags.forEach(tag => {
            const option = document.createElement("option");
            option.value = tag.id;
            option.textContent = tag.name;
            highlightSelectionTag.appendChild(option);
        });
    }
}

function populateParentTagSelect() {
    if (!selectionParentTag) return;
    selectionParentTag.innerHTML = '<option value="">Select parent tag...</option>';
    tags.forEach(tag => {
        const option = document.createElement("option");
        option.value = tag.id;
        option.textContent = tag.name;
        selectionParentTag.appendChild(option);
    });
}

function handleSelectionCriteriaChange() {
    if (!selectionCriteria || !selectionValue || !selectionParentTag) return;
    const criteria = selectionCriteria.value;
    selectionValue.style.display = "none";
    selectionParentTag.style.display = "none";

    if (criteria === "name") {
        selectionValue.style.display = "inline-block";
    } else if (criteria === "parent") {
        selectionParentTag.style.display = "inline-block";
        populateParentTagSelect();
    }
}

function updateSelectedTagsCount() {
    const checkedBoxes = document.querySelectorAll(".tag-checkbox:checked");
    const count = checkedBoxes.length;
    if (selectedCount) {
        selectedCount.textContent = `${count} tag${count !== 1 ? "s" : ""} selected`;
    }
    if (selectionActions) {
        selectionActions.style.display = count > 0 ? "flex" : "none";
    }
    document.querySelectorAll(".tag-checkbox").forEach(cb => {
        const item = cb.closest(".tag-item");
        if (item) {
            item.classList.toggle("tag-selected", cb.checked);
        }
    });
}

function applyTagSelection() {
    if (!selectionCriteria || !selectionValue || !selectionParentTag) return;
    let selectedTagIds = [];
    switch (selectionCriteria.value) {
        case "all":
            selectedTagIds = tags.map(t => t.id);
            break;
        case "name": {
            const term = selectionValue.value.toLowerCase().trim();
            if (!term) {
                alert("Please enter a search term");
                return;
            }
            selectedTagIds = tags
                .filter(t => t.name.toLowerCase().includes(term))
                .map(t => t.id);
            break;
        }
        case "parent": {
            const parentId = selectionParentTag.value;
            if (!parentId) {
                alert("Please select a parent tag");
                return;
            }
            selectedTagIds = tags
                .filter(t => t.parentIds && t.parentIds.includes(parentId))
                .map(t => t.id);
            break;
        }
        case "no-parent":
            selectedTagIds = tags
                .filter(t => !t.parentIds || t.parentIds.length === 0)
                .map(t => t.id);
            break;
        default:
            break;
    }

    document.querySelectorAll(".tag-checkbox").forEach(cb => {
        cb.checked = selectedTagIds.includes(cb.dataset.tagId);
    });
    updateSelectedTagsCount();
}

function clearTagSelection() {
    document.querySelectorAll(".tag-checkbox").forEach(cb => {
        cb.checked = false;
    });
    updateSelectedTagsCount();
}

function deleteSelectedTags() {
    const checkedBoxes = document.querySelectorAll(".tag-checkbox:checked");
    const selectedIds = Array.from(checkedBoxes).map(cb => cb.dataset.tagId);
    if (selectedIds.length === 0) {
        alert("No tags selected");
        return;
    }
    if (!confirm(`Delete ${selectedIds.length} tag(s)? This will remove them from highlights.`)) {
        return;
    }

    tags = tags.filter(t => !selectedIds.includes(t.id));
    tags.forEach(tag => {
        if (tag.parentIds) {
            tag.parentIds = tag.parentIds.filter(id => !selectedIds.includes(id));
        }
    });

    highlights = highlights.map(highlight => {
        if (highlight.tags) {
            highlight.tags = highlight.tags.filter(id => !selectedIds.includes(id));
            saveHighlightUpdate(highlight);
        }
        return highlight;
    });

    saveTags();
    renderTags();
    populateTagFilter();
    filterHighlights();
    updateStats();
    clearTagSelection();
}

function showMakeChildrenModal() {
    const checkedBoxes = document.querySelectorAll(".tag-checkbox:checked");
    const selectedIds = Array.from(checkedBoxes).map(cb => cb.dataset.tagId);
    if (selectedIds.length === 0) {
        alert("No tags selected");
        return;
    }

    const existingModal = document.getElementById("makeChildrenModal");
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement("div");
    modal.id = "makeChildrenModal";
    modal.className = "modal show";
    const content = document.createElement("div");
    content.className = "modal-content";

    const availableParents = tags.filter(t => !selectedIds.includes(t.id));
    let optionsHtml = '<option value="">None (remove parents)</option>';
    availableParents.forEach(tag => {
        optionsHtml += `<option value="${tag.id}">${escapeHtml(tag.name)}</option>`;
    });

    content.innerHTML = `
        <div class="modal-header">
            <h2>Make Selected Tags Children Of...</h2>
            <button class="modal-close" id="closeMakeChildrenModal">&times;</button>
        </div>
        <div class="modal-body">
            <p style="margin-bottom: 16px; color: #b0b0b0; font-size: 14px;">
                Select a parent tag for ${selectedIds.length} selected tag(s). Choose "None" to remove all parents.
            </p>
            <select id="newParentTag" class="filter-select" style="width: 100%; margin-bottom: 16px;">
                ${optionsHtml}
            </select>
            <div class="form-actions" style="margin-top: 0; padding-top: 0; border-top: none;">
                <button id="cancelMakeChildren" class="btn btn-secondary">Cancel</button>
                <button id="saveMakeChildren" class="btn btn-primary">Apply</button>
            </div>
        </div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    content.querySelector("#closeMakeChildrenModal").addEventListener("click", closeModal);
    content.querySelector("#cancelMakeChildren").addEventListener("click", closeModal);
    content.querySelector("#saveMakeChildren").addEventListener("click", () => {
        const newParentId = content.querySelector("#newParentTag").value;
        selectedIds.forEach(tagId => {
            const tag = tags.find(t => t.id === tagId);
            if (!tag) return;
            if (newParentId) {
                tag.parentIds = [newParentId];
            } else {
                tag.parentIds = [];
            }
        });
        saveTags();
        renderTags();
        populateTagFilter();
        updateStats();
        clearTagSelection();
        closeModal();
    });

    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });
}

function collectParentTagIds(tagId, acc) {
    const tag = tags.find(t => t.id === tagId);
    if (!tag || !tag.parentIds) {
        return;
    }
    tag.parentIds.forEach(parentId => {
        if (acc.has(parentId)) {
            return;
        }
        acc.add(parentId);
        collectParentTagIds(parentId, acc);
    });
}

function expandTagIdsWithParents(tagIds) {
    const acc = new Set(tagIds);
    tagIds.forEach(tagId => collectParentTagIds(tagId, acc));
    return Array.from(acc);
}

function updateSelectedHighlightsCount() {
    if (!selectedHighlightsCount || !highlightSelectionActions) {
        return;
    }
    const count = selectedHighlightIds.size;
    selectedHighlightsCount.textContent = `${count} highlight${count !== 1 ? "s" : ""} selected`;
    highlightSelectionActions.style.display = count > 0 ? "flex" : "none";
}

function toggleHighlightSelectionPanel() {
    if (!highlightSelectionPanel || !selectAllHighlightsBtn) {
        return;
    }
    highlightSelectionVisible = !highlightSelectionVisible;
    highlightSelectionPanel.style.display = highlightSelectionVisible ? "block" : "none";
    selectAllHighlightsBtn.textContent = highlightSelectionVisible ? "Cancel Selection" : "Select All Highlights";
    if (highlightSelectionVisible) {
        selectAllHighlightsBtn.classList.remove("btn-secondary");
        selectAllHighlightsBtn.classList.add("btn-danger");
    } else {
        selectAllHighlightsBtn.classList.remove("btn-danger");
        selectAllHighlightsBtn.classList.add("btn-secondary");
    }
    if (!highlightSelectionVisible) {
        selectedHighlightIds.clear();
    }
    renderHighlights();
    updateSelectedHighlightsCount();
}

function handleHighlightSelectionCriteriaChange() {
    if (!highlightSelectionCriteria) {
        return;
    }
    const criteria = highlightSelectionCriteria.value;
    if (highlightSelectionTag) {
        highlightSelectionTag.style.display = criteria === "tag" ? "inline-block" : "none";
    }
    if (highlightSelectionText) {
        highlightSelectionText.style.display = criteria === "text" ? "inline-block" : "none";
    }
}

function applyHighlightSelection() {
    if (!highlightSelectionCriteria) {
        return;
    }
    const criteria = highlightSelectionCriteria.value;
    let filtered = highlights;
    if (criteria === "tag") {
        const tagId = highlightSelectionTag ? highlightSelectionTag.value : "";
        if (!tagId) {
            alert("Please select a tag");
            return;
        }
        filtered = highlights.filter(h => (h.tags || []).includes(tagId));
    } else if (criteria === "text") {
        const term = highlightSelectionText ? highlightSelectionText.value.toLowerCase().trim() : "";
        if (!term) {
            alert("Please enter text");
            return;
        }
        filtered = highlights.filter(h => (h.text || "").toLowerCase().includes(term));
    }

    selectedHighlightIds.clear();
    filtered.forEach(h => selectedHighlightIds.add(h.id));
    renderHighlights();
    updateSelectedHighlightsCount();
}

function clearHighlightSelection() {
    selectedHighlightIds.clear();
    renderHighlights();
    updateSelectedHighlightsCount();
}

function deleteSelectedHighlights() {
    if (selectedHighlightIds.size === 0) {
        alert("No highlights selected");
        return;
    }
    if (!confirm(`Delete ${selectedHighlightIds.size} highlight(s)?`)) {
        return;
    }
    selectedHighlightIds.forEach(id => {
        const highlight = highlights.find(h => h.id === id);
        if (highlight) {
            saveHighlightDelete(highlight);
        }
    });
    highlights = highlights.filter(h => !selectedHighlightIds.has(h.id));
    selectedHighlightIds.clear();
    renderHighlights();
    updateStats();
    updateSelectedHighlightsCount();
}

function addTagToSelectedHighlights() {
    if (selectedHighlightIds.size === 0) {
        alert("No highlights selected");
        return;
    }
    const tagName = prompt("Enter tag name to add:");
    if (!tagName) return;
    const tag = tags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
    if (!tag) {
        alert("Tag not found. Create it first.");
        return;
    }
    const expandedTagIds = expandTagIdsWithParents([tag.id]);
    selectedHighlightIds.forEach(id => {
        const highlight = highlights.find(h => h.id === id);
        if (!highlight) return;
        highlight.tags = highlight.tags || [];
        expandedTagIds.forEach(tagId => {
            if (!highlight.tags.includes(tagId)) {
                highlight.tags.push(tagId);
            }
        });
        saveHighlightUpdate(highlight);
    });
    renderHighlights();
}

async function copySelectedHighlights() {
    const ids = selectedHighlightIds.size ? Array.from(selectedHighlightIds) : highlights.map(h => h.id);
    if (!ids.length) {
        alert("No highlights to copy.");
        return;
    }
    const lines = ids.map(id => {
        const h = highlights.find(x => x.id === id);
        if (!h) return "";
        const tagNames = (h.tags || []).map(tagId => {
            const tag = tags.find(t => t.id === tagId);
            return tag ? tag.name : null;
        }).filter(Boolean);
        const tagsLine = tagNames.length ? `Tags: ${tagNames.join(", ")}` : "Tags: (none)";
        const noteLine = h.note ? `Note: ${h.note}` : "";
        return `${h.text}\n${tagsLine}\nFile: ${h._filePath || "Unknown"}${noteLine ? `\n${noteLine}` : ""}`;
    }).filter(Boolean);

    const textToCopy = lines.join("\n\n");
    try {
        await navigator.clipboard.writeText(textToCopy);
        alert(`Copied ${ids.length} highlight${ids.length !== 1 ? "s" : ""}.`);
    } catch (err) {
        const selection = window.getSelection();
        if (!selection) return;
        const tempDiv = document.createElement("div");
        tempDiv.style.position = "fixed";
        tempDiv.style.left = "-9999px";
        tempDiv.textContent = textToCopy;
        document.body.appendChild(tempDiv);
        const range = document.createRange();
        range.selectNodeContents(tempDiv);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("copy");
        document.body.removeChild(tempDiv);
        alert(`Copied ${ids.length} highlight${ids.length !== 1 ? "s" : ""}.`);
    }
}

function openTagModal(tagId = null) {
    currentEditingTagId = tagId;
    const modalTitle = document.getElementById("modalTitle");
    if (tagId) {
        const tag = tags.find(t => t.id === tagId);
        if (!tag) return;
        modalTitle.textContent = "Edit Tag";
        tagNameInput.value = tag.name;
        tagColorInput.value = tag.color;
        deleteTagBtn.style.display = "inline-block";
        currentParentsDiv.style.display = "block";
        currentChildrenDiv.style.display = "block";
        if (!tag.parentIds) tag.parentIds = [];
    } else {
        modalTitle.textContent = "Create Tag";
        tagNameInput.value = "";
        tagColorInput.value = "#ffeb3b";
        deleteTagBtn.style.display = "none";
        currentParentsDiv.style.display = "none";
        currentChildrenDiv.style.display = "none";
        window.tempNewTagParents = [];
        window.tempNewTagChildren = [];
    }
    populateParentTagsSelect(tagId);
    populateChildTagsSelect(tagId);
    updateCurrentParentsDisplay();
    updateCurrentChildrenDisplay();
    tagModal.classList.add("show");
}

function closeTagModal() {
    tagModal.classList.remove("show");
    currentEditingTagId = null;
}

function populateParentTagsSelect(excludeTagId = null) {
    parentTagsSelect.innerHTML = "";
    const availableTags = tags.filter(t => t.id !== excludeTagId);
    if (availableTags.length === 0) {
        const option = document.createElement("option");
        option.textContent = "No other tags available";
        option.disabled = true;
        parentTagsSelect.appendChild(option);
        return;
    }
    availableTags.forEach(tag => {
        const option = document.createElement("option");
        option.value = tag.id;
        option.textContent = tag.name;
        parentTagsSelect.appendChild(option);
    });
    if (excludeTagId) {
        const tag = tags.find(t => t.id === excludeTagId);
        if (tag && tag.parentIds) {
            tag.parentIds.forEach(parentId => {
                const option = Array.from(parentTagsSelect.options).find(opt => opt.value === parentId);
                if (option) option.selected = true;
            });
        }
    }
}

function populateChildTagsSelect(excludeTagId = null) {
    childTagsSelect.innerHTML = "";
    const availableTags = tags.filter(t => t.id !== excludeTagId);
    if (availableTags.length === 0) {
        const option = document.createElement("option");
        option.textContent = "No other tags available";
        option.disabled = true;
        childTagsSelect.appendChild(option);
        return;
    }
    availableTags.forEach(tag => {
        const option = document.createElement("option");
        option.value = tag.id;
        option.textContent = tag.name;
        childTagsSelect.appendChild(option);
    });
    if (excludeTagId) {
        const childTagIds = tags
            .filter(t => t.parentIds && t.parentIds.includes(excludeTagId))
            .map(t => t.id);
        childTagIds.forEach(childId => {
            const option = Array.from(childTagsSelect.options).find(opt => opt.value === childId);
            if (option) option.selected = true;
        });
    }
}

function updateCurrentParentsDisplay(parentIds = null) {
    parentsList.innerHTML = "";
    let displayParentIds = parentIds;
    if (displayParentIds === null) {
        if (currentEditingTagId) {
            const tag = tags.find(t => t.id === currentEditingTagId);
            displayParentIds = tag ? (tag.parentIds || []) : [];
        } else {
            displayParentIds = window.tempNewTagParents || [];
        }
    }
    if (displayParentIds.length === 0) {
        parentsList.innerHTML = '<div style="color: #999; font-size: 13px;">No parents selected</div>';
        return;
    }
    displayParentIds.forEach(parentId => {
        const parentTag = tags.find(t => t.id === parentId);
        if (!parentTag) return;
        const chip = document.createElement("div");
        chip.className = "parent-chip";
        const tagIdForRemove = currentEditingTagId || "new";
        chip.innerHTML = `
            <span class="parent-name">${escapeHtml(parentTag.name)}</span>
            <button class="remove-parent" title="Remove parent">×</button>
        `;
        chip.querySelector(".remove-parent").addEventListener("click", () => {
            removeParent(tagIdForRemove, parentId);
        });
        parentsList.appendChild(chip);
    });
}

function updateCurrentChildrenDisplay(childIds = null) {
    childrenList.innerHTML = "";
    let displayChildIds = childIds;
    if (displayChildIds === null) {
        if (currentEditingTagId) {
            displayChildIds = tags
                .filter(t => t.parentIds && t.parentIds.includes(currentEditingTagId))
                .map(t => t.id);
        } else {
            displayChildIds = window.tempNewTagChildren || [];
        }
    }
    if (displayChildIds.length === 0) {
        childrenList.innerHTML = '<div style="color: #999; font-size: 13px;">No children selected</div>';
        return;
    }
    displayChildIds.forEach(childId => {
        const childTag = tags.find(t => t.id === childId);
        if (!childTag) return;
        const chip = document.createElement("div");
        chip.className = "parent-chip";
        const tagIdForRemove = currentEditingTagId || "new";
        chip.innerHTML = `
            <span class="parent-name">${escapeHtml(childTag.name)}</span>
            <button class="remove-parent" title="Remove child">×</button>
        `;
        chip.querySelector(".remove-parent").addEventListener("click", () => {
            removeChild(tagIdForRemove, childId);
        });
        childrenList.appendChild(chip);
    });
}

function removeParent(tagId, parentId) {
    if (tagId === "new") {
        window.tempNewTagParents = (window.tempNewTagParents || []).filter(id => id !== parentId);
        const option = Array.from(parentTagsSelect.options).find(opt => opt.value === parentId);
        if (option) option.selected = false;
        updateCurrentParentsDisplay();
        return;
    }
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;
    tag.parentIds = (tag.parentIds || []).filter(id => id !== parentId);
    const option = Array.from(parentTagsSelect.options).find(opt => opt.value === parentId);
    if (option) option.selected = false;
    saveTags();
    renderTags();
    updateCurrentParentsDisplay();
}

function removeChild(tagId, childId) {
    if (tagId === "new") {
        window.tempNewTagChildren = (window.tempNewTagChildren || []).filter(id => id !== childId);
        const option = Array.from(childTagsSelect.options).find(opt => opt.value === childId);
        if (option) option.selected = false;
        updateCurrentChildrenDisplay();
        return;
    }
    const childTag = tags.find(t => t.id === childId);
    if (!childTag) return;
    childTag.parentIds = (childTag.parentIds || []).filter(id => id !== tagId);
    const option = Array.from(childTagsSelect.options).find(opt => opt.value === childId);
    if (option) option.selected = false;
    saveTags();
    renderTags();
    updateCurrentChildrenDisplay();
}

function saveTag() {
    const name = tagNameInput.value.trim();
    if (!name) {
        alert("Please enter a tag name");
        return;
    }
    const existing = tags.find(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== currentEditingTagId);
    if (existing) {
        alert("A tag with this name already exists");
        return;
    }
    const color = tagColorInput.value;
    let selectedParentIds = Array.from(parentTagsSelect.selectedOptions).map(opt => opt.value);
    let selectedChildIds = Array.from(childTagsSelect.selectedOptions).map(opt => opt.value);

    if (!currentEditingTagId && window.tempNewTagParents) {
        selectedParentIds = window.tempNewTagParents;
    }
    if (!currentEditingTagId && window.tempNewTagChildren) {
        selectedChildIds = window.tempNewTagChildren;
    }

    const tagId = currentEditingTagId || `tag-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (currentEditingTagId) {
        const tag = tags.find(t => t.id === currentEditingTagId);
        if (tag) {
            tag.name = name;
            tag.color = color;
            tag.parentIds = selectedParentIds;
            tag.updatedAt = Date.now();
        }
    } else {
        tags.push({
            id: tagId,
            name,
            color,
            parentIds: selectedParentIds,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
    }

    // Update child relationships
    if (currentEditingTagId) {
        const currentChildren = tags.filter(t => t.parentIds && t.parentIds.includes(currentEditingTagId));
        currentChildren.forEach(child => {
            if (!selectedChildIds.includes(child.id)) {
                child.parentIds = child.parentIds.filter(id => id !== currentEditingTagId);
            }
        });
        selectedChildIds.forEach(childId => {
            const childTag = tags.find(t => t.id === childId);
            if (childTag) {
                childTag.parentIds = childTag.parentIds || [];
                if (!childTag.parentIds.includes(currentEditingTagId)) {
                    childTag.parentIds.push(currentEditingTagId);
                }
            }
        });
    } else {
        selectedChildIds.forEach(childId => {
            const childTag = tags.find(t => t.id === childId);
            if (childTag) {
                childTag.parentIds = childTag.parentIds || [];
                if (!childTag.parentIds.includes(tagId)) {
                    childTag.parentIds.push(tagId);
                }
            }
        });
    }

    saveTags();
    closeTagModal();
    renderTags();
    populateTagFilter();
    filterHighlights();
    updateStats();
    delete window.tempNewTagParents;
    delete window.tempNewTagChildren;
}

function deleteTag() {
    if (!currentEditingTagId) return;
    if (!confirm("Delete this tag? It will be removed from highlights.")) return;
    tags = tags.filter(t => t.id !== currentEditingTagId);
    tags.forEach(tag => {
        if (tag.parentIds) {
            tag.parentIds = tag.parentIds.filter(id => id !== currentEditingTagId);
        }
    });
    highlights = highlights.map(highlight => {
        if (highlight.tags) {
            highlight.tags = highlight.tags.filter(id => id !== currentEditingTagId);
        }
        return highlight;
    });
    saveTags();
    highlights.forEach(saveHighlightUpdate);
    closeTagModal();
    renderTags();
    populateTagFilter();
    filterHighlights();
    updateStats();
}

function editHighlightNote(highlightId, currentNote = "") {
    currentEditingHighlightId = highlightId;
    if (noteModalTitle) {
        noteModalTitle.textContent = currentNote ? "Edit Note" : "Add Note";
    }
    if (deleteNoteBtn) {
        deleteNoteBtn.style.display = currentNote ? "inline-block" : "none";
    }
    noteText.value = currentNote || "";
    noteModal.classList.add("show");
}

function closeNoteModalDialog() {
    noteModal.classList.remove("show");
    currentEditingHighlightId = null;
}

function saveNote() {
    const highlight = highlights.find(h => h.id === currentEditingHighlightId);
    if (!highlight) return;
    highlight.note = noteText.value.trim();
    saveHighlightUpdate(highlight);
    closeNoteModalDialog();
    filterHighlights();
}

function deleteNote() {
    const highlight = highlights.find(h => h.id === currentEditingHighlightId);
    if (!highlight) return;
    highlight.note = "";
    saveHighlightUpdate(highlight);
    closeNoteModalDialog();
    filterHighlights();
}

function deleteHighlight(highlightId) {
    const highlight = highlights.find(h => h.id === highlightId);
    if (!highlight) return;
    if (!confirm("Delete this highlight?")) return;
    saveHighlightDelete(highlight);
    highlights = highlights.filter(h => h.id !== highlightId);
    filterHighlights();
    updateStats();
}

function addTagToHighlight(highlightId) {
    const highlight = highlights.find(h => h.id === highlightId);
    if (!highlight) return;
    const currentTagIds = highlight.tags || [];
    const existingModal = document.getElementById("addTagModal");
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement("div");
    modal.id = "addTagModal";
    modal.className = "modal show";
    const content = document.createElement("div");
    content.className = "modal-content";

    const isEditMode = currentTagIds.length > 0;
    const availableTags = tags.filter(tag => !currentTagIds.includes(tag.id));
    const tagsToRender = isEditMode ? tags : availableTags;
    const tagCheckboxes = tagsToRender.map(tag => `
        <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer; border-radius: 4px;">
            <input type="checkbox" value="${tag.id}" ${currentTagIds.includes(tag.id) ? "checked" : ""}>
            <span style="width: 16px; height: 16px; background-color: ${tag.color}; border: 1px solid #333; border-radius: 3px;"></span>
            <span>${escapeHtml(tag.name)}</span>
        </label>
    `).join("");

    content.innerHTML = `
        <div class="modal-header">
            <h2>Add Tags to Highlight</h2>
            <button class="modal-close" id="closeAddTagModal">&times;</button>
        </div>
        <div class="modal-body">
            <div style="max-height: 300px; overflow-y: auto; margin-bottom: 16px;">
                ${availableTags.length === 0 && !isEditMode
                    ? '<p style="color: #b0b0b0;">All available tags are already added to this highlight.</p>'
                    : tagCheckboxes}
            </div>
            <div class="form-actions" style="margin-top: 0; padding-top: 0; border-top: none;">
                <button id="cancelAddTag" class="btn btn-secondary">Cancel</button>
                <button id="saveAddTag" class="btn btn-primary">Save</button>
            </div>
        </div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    const closeAddTagModal = () => modal.remove();
    content.querySelector("#closeAddTagModal").addEventListener("click", closeAddTagModal);
    content.querySelector("#cancelAddTag").addEventListener("click", closeAddTagModal);
    content.querySelector("#saveAddTag").addEventListener("click", () => {
        const checkboxes = content.querySelectorAll('input[type="checkbox"]:checked');
        const selectedTagIds = Array.from(checkboxes).map(cb => cb.value);
        if (!selectedTagIds.length && !isEditMode && availableTags.length > 0) {
            alert("Please select at least one tag.");
            return;
        }
        const expandedTagIds = expandTagIdsWithParents(selectedTagIds);
        highlight.tags = expandedTagIds;
        saveHighlightUpdate(highlight);
        closeAddTagModal();
        filterHighlights();
        updateStats();
    });

    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            closeAddTagModal();
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

if (createTagBtn) createTagBtn.addEventListener("click", () => openTagModal());
if (saveTagBtn) saveTagBtn.addEventListener("click", saveTag);
if (deleteTagBtn) deleteTagBtn.addEventListener("click", deleteTag);
if (closeModalBtn) closeModalBtn.addEventListener("click", closeTagModal);
if (cancelTagBtn) cancelTagBtn.addEventListener("click", closeTagModal);

if (saveNoteBtn) saveNoteBtn.addEventListener("click", saveNote);
if (cancelNoteBtn) cancelNoteBtn.addEventListener("click", closeNoteModalDialog);
if (deleteNoteBtn) deleteNoteBtn.addEventListener("click", deleteNote);
if (closeNoteModal) closeNoteModal.addEventListener("click", closeNoteModalDialog);

if (searchTagsInput) searchTagsInput.addEventListener("input", filterTags);
if (searchHighlightsInput) searchHighlightsInput.addEventListener("input", filterHighlights);
if (filterTagSelect) filterTagSelect.addEventListener("change", filterHighlights);
if (selectionCriteria) selectionCriteria.addEventListener("change", handleSelectionCriteriaChange);
if (applySelectionBtn) applySelectionBtn.addEventListener("click", applyTagSelection);
if (clearSelectionBtn) clearSelectionBtn.addEventListener("click", clearTagSelection);
if (deleteSelectedBtn) deleteSelectedBtn.addEventListener("click", deleteSelectedTags);
if (makeChildrenBtn) makeChildrenBtn.addEventListener("click", showMakeChildrenModal);

if (highlightsList) {
    highlightsList.addEventListener("click", (event) => {
        const addTagButton = event.target.closest(".btn-add-tag");
        if (!addTagButton) {
            return;
        }
        const highlightId = addTagButton.dataset.highlightId;
        if (highlightId) {
            addTagToHighlight(highlightId);
        }
    }, true);
}

if (selectAllHighlightsBtn) selectAllHighlightsBtn.addEventListener("click", toggleHighlightSelectionPanel);
if (highlightSelectionCriteria) highlightSelectionCriteria.addEventListener("change", handleHighlightSelectionCriteriaChange);
if (applyHighlightSelectionBtn) applyHighlightSelectionBtn.addEventListener("click", applyHighlightSelection);
if (clearHighlightSelectionBtn) clearHighlightSelectionBtn.addEventListener("click", clearHighlightSelection);
if (deleteSelectedHighlightsBtn) deleteSelectedHighlightsBtn.addEventListener("click", deleteSelectedHighlights);
if (addTagToSelectedHighlightsBtn) addTagToSelectedHighlightsBtn.addEventListener("click", addTagToSelectedHighlights);
if (copySelectedHighlightsBtn) copySelectedHighlightsBtn.addEventListener("click", copySelectedHighlights);

if (selectTagsBtn && tagSelectionPanel) {
    selectTagsBtn.addEventListener("click", () => {
        const isVisible = tagSelectionPanel.style.display !== "none";
        tagSelectionPanel.style.display = isVisible ? "none" : "block";
        selectTagsBtn.textContent = isVisible ? "Select Tags" : "Cancel Selection";
        if (isVisible) {
            selectTagsBtn.classList.remove("btn-danger");
            selectTagsBtn.classList.add("btn-secondary");
        } else {
            selectTagsBtn.classList.remove("btn-secondary");
            selectTagsBtn.classList.add("btn-danger");
        }
        document.querySelectorAll(".tag-checkbox").forEach(cb => {
            cb.style.display = isVisible ? "none" : "block";
            cb.checked = false;
            const item = cb.closest(".tag-item");
            if (item) {
                item.classList.toggle("tag-selected", cb.checked);
            }
        });
        updateSelectedTagsCount();
    });
}

renderTabs();
loadTags();
loadHighlights();
renderTags();
populateTagFilter();
filterHighlights();
updateStats();
handleHighlightSelectionCriteriaChange();
updateSelectedHighlightsCount();

window.addEventListener("storage", (event) => {
    if (!event.key) {
        return;
    }
    if (event.key === TAGS_KEY || event.key.startsWith(HIGHLIGHT_PREFIX)) {
        loadTags();
        loadHighlights();
        renderTags();
        populateTagFilter();
        filterHighlights();
        updateStats();
    }
});

window.addEventListener("tagsSynced", (event) => {
    if (event.detail && Array.isArray(event.detail.tags)) {
        tags = event.detail.tags;
        localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
        renderTags();
        populateTagFilter();
        filterHighlights();
        updateStats();
    }
});

window.addEventListener("authStateChanged", async (event) => {
    const user = event.detail ? event.detail.user : null;
    if (user && window.authService && window.authService.isSharingTags()) {
        await window.authService.syncTagsFromCloud().catch(() => {});
    }
    loadTags();
    renderTags();
    populateTagFilter();
    filterHighlights();
    updateStats();
});

function updateFullscreenState() {
    const host = window.top || window;
    const width = host.outerWidth || window.outerWidth;
    const height = host.outerHeight || window.outerHeight;
    const isFullWidth = Math.abs(width - screen.availWidth) <= 2;
    const isFullHeight = Math.abs(height - screen.availHeight) <= 2;
    const isFullscreen = isFullWidth && isFullHeight;
    document.body.classList.toggle("not-fullscreen", !isFullscreen);
}

updateFullscreenState();
window.addEventListener("resize", updateFullscreenState);
window.addEventListener("orientationchange", updateFullscreenState);
