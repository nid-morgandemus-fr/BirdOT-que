let structure = [];
let originalTree = null;

async function loadStructure() {
    try {
        const response = await fetch('/api/structure');
        structure = await response.json();
        originalTree = buildTree();
        renderTree(originalTree);
    } catch (error) { console.error('Error loading structure:', error); }
}

function buildTree() {
    const tree = {};
    structure.forEach(item => {
        const parts = item.path.split('/').filter(p => p && p !== '.');
        let current = tree;
        parts.forEach((part, index) => {
            if (!current[part]) current[part] = { _audio: [], _path: parts.slice(0, index + 1).join('/') };
            if (index === parts.length - 1) current[part]._audio = item.audio;
            current = current[part];
        });
    });
    return tree;
}

function renderTree(tree) {
    const container = document.getElementById('treeContainer');
    if (!container) return; // Sécurité ajoutée
    container.innerHTML = '';
    function renderNode(node, element, level = 0) {
        Object.keys(node).forEach(key => {
            if (key.startsWith('_')) return;
            const item = node[key];
            const hasChildren = Object.keys(item).some(k => !k.startsWith('_'));
            const hasFiles = item._audio && item._audio.length > 0;
            const div = document.createElement('div');
            div.className = 'tree-item';
            const folder = document.createElement('div');
            folder.className = 'tree-folder';
            folder.textContent = key;
            folder.style.paddingLeft = (level * 15 + 12) + 'px';
            if (hasChildren || hasFiles) {
                const childrenDiv = document.createElement('div');
                childrenDiv.className = 'tree-children';
                folder.onclick = (e) => { e.stopPropagation(); folder.classList.toggle('expanded'); childrenDiv.classList.toggle('show'); };
                if (hasFiles) {
                    item._audio.forEach(audio => {
                        const fileDiv = document.createElement('div');
                        fileDiv.className = 'tree-file audio';
                        if (audio.spectrogram) fileDiv.classList.add('has-spectrogram');
                        fileDiv.textContent = audio.name;
                        fileDiv.onclick = (e) => { e.stopPropagation(); showFile(item._path, audio.name, audio.spectrogram); };
                        childrenDiv.appendChild(fileDiv);
                    });
                }
                if (hasChildren) renderNode(item, childrenDiv, level + 1);
                div.appendChild(folder);
                div.appendChild(childrenDiv);
            }
            element.appendChild(div);
        });
    }
    renderNode(tree, container);
}

function applyFilters() {
    const searchInput = document.getElementById('searchInput');
    const spectroFilter = document.getElementById('spectrogramFilter');
    if (!searchInput || !spectroFilter) return;
    filterTree(searchInput.value, spectroFilter.value);
}

function filterTree(searchTerm, spectroFilter = 'all') {
    if (!originalTree) return;
    const term = searchTerm.toLowerCase().trim();
    if (term === '' && spectroFilter === 'all') { 
        renderTree(originalTree); 
        return; 
    }
    
    function filterNode(node, parentPath = '') {
        const filtered = {};
        Object.keys(node).forEach(key => {
            if (key.startsWith('_')) return;
            const item = node[key];
            const hasChildren = Object.keys(item).some(k => !k.startsWith('_'));
            
            const keyMatch = key.toLowerCase().includes(term);
            const pathMatch = (parentPath + '/' + key).toLowerCase().includes(term);
            
            let filteredAudio = item._audio.filter(a => a.name.toLowerCase().includes(term));
            
            if (spectroFilter === 'with') {
                filteredAudio = filteredAudio.filter(a => a.spectrogram !== null && a.spectrogram !== undefined && a.spectrogram !== '');
            } else if (spectroFilter === 'without') {
                filteredAudio = filteredAudio.filter(a => a.spectrogram === null || a.spectrogram === undefined || a.spectrogram === '');
            }
            
            let childrenFiltered = hasChildren ? filterNode(item, parentPath + '/' + key) : {};
            const hasValidChildren = Object.keys(childrenFiltered).length > 0;
            
            if (keyMatch || pathMatch) {
                let displayAudio = item._audio;
                if (spectroFilter === 'with') {
                    displayAudio = displayAudio.filter(a => a.spectrogram !== null && a.spectrogram !== undefined && a.spectrogram !== '');
                } else if (spectroFilter === 'without') {
                    displayAudio = displayAudio.filter(a => a.spectrogram === null || a.spectrogram === undefined || a.spectrogram === '');
                }
                
                if (displayAudio.length > 0 || hasValidChildren) {
                    filtered[key] = { 
                        _audio: displayAudio, 
                        _path: item._path 
                    };
                    if (hasValidChildren) Object.assign(filtered[key], childrenFiltered);
                }
            } else if (filteredAudio.length > 0 || hasValidChildren) {
                filtered[key] = { 
                    _audio: filteredAudio, 
                    _path: item._path 
                };
                if (hasValidChildren) Object.assign(filtered[key], childrenFiltered);
            }
        });
        return filtered;
    }
    
    const result = filterNode(originalTree);
    const container = document.getElementById('treeContainer');
    if (!container) return;
    
    if (Object.keys(result).length === 0) {
        container.innerHTML = '<div class="no-results">No recordings found</div>';
    } else {
        renderTree(result);
        document.querySelectorAll('.tree-folder').forEach(folder => {
            folder.classList.add('expanded');
            const children = folder.nextElementSibling;
            if (children && children.classList.contains('tree-children')) children.classList.add('show');
        });
    }
}

async function showFile(path, filename, spectrogramFile) {
    const safePath = path.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
    const safeFilename = filename.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
    const safeFilepath = `${safePath}/${safeFilename}`;

    const contentHeader = document.getElementById('contentHeader');
    const contentArea = document.getElementById('contentArea');
    contentHeader.textContent = `${path}/${filename}`;
    const audioUrl = `/files/${path}/${filename}`;
    const spectrogramUrl = spectrogramFile ? `/files/${path}/${spectrogramFile}` : null;
    
    let html = '<div class="spectrogram-container"><h3 style="margin-bottom: 15px; color: #4CAF50;">📊 Spectrogram</h3>';
    html += spectrogramUrl ? `<img src="${spectrogramUrl}?t=${new Date().getTime()}" alt="Spectrogram" class="spectrogram-image">` : '<div class="no-spectrogram">📭 No spectrogram available. Use the "Generate Spectrograms" button.</div>';
    html += '</div>';
    
    html += '<div class="audio-player-container"><h3 style="margin-bottom: 15px; color: #4CAF50;">🎵 Audio Player</h3>';
    html += `<audio controls class="audio-player" id="audioPlayer"><source src="${audioUrl}" type="audio/${filename.split('.').pop()}">Your browser does not support the audio element.</audio></div>`;
    
    html += '<div class="file-info"><h3>🐦 ' + filename + '</h3>';
    html += `<p><strong>Path:</strong> ${path}/${filename}</p>`;
    html += `<a href="${audioUrl}" download class="download-btn">⬇️ Download Audio</a>`;
    
    html += `<button id="audacityBtn" onclick="openInAudacity('${safePath}', '${safeFilename}')" class="audacity-btn">🎵 Open in Audacity</button>`;
    if (spectrogramUrl) html += `<a href="${spectrogramUrl}" download class="download-btn">⬇️ Download Spectrogram</a>`;
    
    html += '<div class="coordinates-form">';
    html += '<h4>📍 Recording Location</h4>';
    html += '<div class="coord-input-group">';
    html += '<input type="number" step="any" class="coord-input" id="coordLat" placeholder="Latitude (e.g., 46.8182)">';
    html += '<input type="number" step="any" class="coord-input" id="coordLng" placeholder="Longitude (e.g., 2.2137)">';
    html += '</div>';
    
    html += `<button onclick="saveCoordinates('${safeFilepath}')" class="save-coords-btn">💾 Save Coordinates</button>`;
    html += `<button onclick="openInOSM()" class="osm-btn" id="osmBtn" style="display: none;">🗺️ Open in OpenStreetMap</button>`;
    html += '<div class="coord-saved" id="coordSaved">✅ Coordinates saved!</div>';
    html += '</div>';
    
    html += '</div>';
    
    contentArea.innerHTML = html;
    loadCoordinates(`${path}/${filename}`);
}

async function loadCoordinates(filepath) {
    try {
        const encodedPath = encodeURIComponent(filepath);
        const response = await fetch(`/api/get_coordinates/${encodedPath}`);
        if (!response.ok) return;
        const data = await response.json();
        if (data.latitude || data.longitude) {
            const latInput = document.getElementById('coordLat');
            const lngInput = document.getElementById('coordLng');
            const osmBtn = document.getElementById('osmBtn');
            if (latInput && data.latitude) latInput.value = data.latitude;
            if (lngInput && data.longitude) lngInput.value = data.longitude;
            if (osmBtn && latInput.value && lngInput.value) {
                osmBtn.style.display = 'inline-block';
            }
        }
    } catch (error) { console.error('Error loading coordinates:', error); }
}

async function saveCoordinates(filepath) {
    const lat = document.getElementById('coordLat').value;
    const lng = document.getElementById('coordLng').value;
    
    if (!lat || !lng) {
        alert('Please enter both latitude and longitude');
        return;
    }
    
    try {
        const response = await fetch('/api/save_coordinates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filepath, latitude: parseFloat(lat), longitude: parseFloat(lng) })
        });
        
        if (response.ok) {
            const saved = document.getElementById('coordSaved');
            const osmBtn = document.getElementById('osmBtn');
            if (saved) {
                saved.style.display = 'block';
                setTimeout(() => { saved.style.display = 'none'; }, 3000);
            }
            if (osmBtn) {
                osmBtn.style.display = 'inline-block';
            }
        } else {
            alert('Error saving coordinates');
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function showReadme() {
    const modal = document.getElementById('readmeModal');
    const content = document.getElementById('readmeContent');
    modal.classList.add('show');
    content.innerHTML = '<p style="text-align: center; color: #666;">Loading README...</p>';
    
    try {
        const response = await fetch('/api/readme');
        if (response.status === 404) {
            content.innerHTML = '<div style="text-align: center; padding: 40px;"><h3 style="color: #FF9800;">📖 README Not Found</h3><p style="color: #b0b0b0; margin-top: 15px;">The README.md file was not found in the selected directory or the application root.</p><p style="color: #666; margin-top: 10px; font-size: 13px;">Please place a README.md file in your BirdOTèque folder.</p></div>';
            return;
        }
        const html = await response.text();
        content.innerHTML = html;
        content.querySelectorAll('a').forEach(link => {
            if (link.href && !link.href.startsWith(window.location.origin)) {
                link.target = '_blank'; link.rel = 'noopener noreferrer';
            }
        });
    } catch (error) {
        content.innerHTML = `<p style="color: #f44336;">❌ Error loading: ${error.message}</p>`;
    }
}

function closeReadme() { document.getElementById('readmeModal').classList.remove('show'); }
document.getElementById('readmeModal').onclick = (e) => { if (e.target.id === 'readmeModal') closeReadme(); };

function showGenerateModal() {
    document.getElementById('generateModal').classList.add('show');
    resetGenerationForm();
}

function closeGenerateModal() { document.getElementById('generateModal').classList.remove('show'); }

function resetGenerationForm() {
    const ids = ['genFilePath', 'genDirPath', 'genProgress', 'genLog'];
    ids.forEach(id => { const el = document.getElementById(id); if(el) { if(id==='genProgress') el.classList.remove('show'); else if(id==='genLog') el.innerHTML=''; else el.value=''; }});
    const btn = document.getElementById('startGenBtn'); if(btn) btn.disabled = false;
    const genFile = document.getElementById('genFile'); const genDir = document.getElementById('genDir');
    if(genFile) genFile.checked = false; if(genDir) genDir.checked = false;
    const fs = document.getElementById('fileSelection'); const ds = document.getElementById('dirSelection');
    if(fs) fs.style.display = 'none'; if(ds) ds.style.display = 'none';
}

function selectGenType(type) {
    const genFile = document.getElementById('genFile'); const genDir = document.getElementById('genDir');
    const fs = document.getElementById('fileSelection'); const ds = document.getElementById('dirSelection');
    if (type === 'file') { if(genFile) genFile.checked = true; if(fs) fs.style.display = 'block'; if(ds) ds.style.display = 'none'; } 
    else { if(genDir) genDir.checked = true; if(fs) fs.style.display = 'none'; if(ds) ds.style.display = 'block'; }
}

function browseFile() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.wav,.mp3,.ogg,.flac,.m4a,.aac,.wma,audio/*';
    input.onchange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0]; const el = document.getElementById('genFilePath');
            if(el) { alert(`Selected: ${file.name}\n\nPlease enter the full path manually above.\nExample: /home/user/birds/${file.name}`); el.value = file.name; el.focus(); }
        }
    }; input.click();
}

function browseDirectory() {
    const input = document.createElement('input'); input.type = 'file'; input.webkitdirectory = true; input.multiple = true;
    input.onchange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const pathParts = e.target.files[0].webkitRelativePath ? e.target.files[0].webkitRelativePath.split('/') : [];
            const el = document.getElementById('genDirPath');
            if (pathParts.length > 1 && el) { el.value = pathParts[0]; el.focus(); }
            else if (el) { alert('Please enter the full directory path manually.'); }
        }
    }; input.click();
}

async function startGeneration() {
    const genType = document.querySelector('input[name="genType"]:checked');
    if (!genType) { alert('Please select either "Single Audio File" or "Directory"'); return; }
    
    let targetPath = '', recursive = false;
    if (genType.value === 'file') { 
        targetPath = document.getElementById('genFilePath').value.trim(); 
        if(!targetPath) { alert('Please enter a file path'); return; } 
    } else { 
        targetPath = document.getElementById('genDirPath').value.trim(); 
        recursive = document.getElementById('genRecursive').checked; 
        if(!targetPath) { alert('Please enter a directory path'); return; } 
    }

    const confirmMsg = recursive ? 
        '⚠️ Warning: This will overwrite existing spectrogram files in the directory and all subdirectories.\n\nDo you want to continue?' :
        '⚠️ Warning: This will overwrite existing spectrogram files.\n\nDo you want to continue?';
    
    if (!confirm(confirmMsg)) {
        return;
    }

    const btn = document.getElementById('startGenBtn'); 
    const prog = document.getElementById('genProgress'); 
    const log = document.getElementById('genLog');
    if(btn) btn.disabled = true; 
    if(prog) prog.classList.add('show'); 
    if(log) log.innerHTML = '<div class="generation-log-entry">⏳ Starting...</div>';

    try {
        const res = await fetch('/api/generate_spectrogram', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ path: targetPath, recursive }) 
        });
        if (res.ok) { 
            if(log) log.innerHTML += '<div class="generation-log-entry">✅ Generation started</div>'; 
            pollGenerationStatus(); 
        } else { 
            const data = await res.json(); 
            alert(`Error: ${data.error}`); 
            if(btn) btn.disabled = false; 
        }
    } catch (error) { 
        alert(`Error: ${error.message}`); 
        if(btn) btn.disabled = false; 
    }
}

async function pollGenerationStatus() {
    const interval = setInterval(async () => {
        try {
            const res = await fetch('/api/generation_status'); const status = await res.json();
            const fill = document.getElementById('progressFill');
            if (status.total > 0 && fill) {
                const pct = Math.round(((status.completed + status.failed) / status.total) * 100);
                fill.style.width = `${pct}%`; fill.textContent = `${pct}%`;
                const pc = document.getElementById('progressCompleted'); if(pc) pc.textContent = `Completed: ${status.completed}`;
                const pf = document.getElementById('progressFailed'); if(pf) pf.textContent = `Failed: ${status.failed}`;
                const pt = document.getElementById('progressTotal'); if(pt) pt.textContent = `Total: ${status.total}`;
            }
            const log = document.getElementById('genLog');
            if (log && status.log) { log.innerHTML = status.log.map(e => `<div class="generation-log-entry">${escapeHtml(e)}</div>`).join(''); log.scrollTop = log.scrollHeight; }
            
            if (!status.running && status.total > 0) {
                clearInterval(interval); const btn = document.getElementById('startGenBtn'); if(btn) btn.disabled = false;
                if(log) log.innerHTML += '<div class="generation-log-entry" style="color: #4CAF50; font-weight: bold;">✅ Completed!</div>';
                await refreshStructure();
                setTimeout(() => { closeGenerateModal(); alert('Spectrograms generated successfully!'); }, 2000);
            }
        } catch (e) { console.error(e); }
    }, 1000);
}

function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
async function refreshStructure() { try { await fetch('/api/refresh_structure'); await loadStructure(); } catch (e) { console.error(e); } }

function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('birdoteque-theme', isLight ? 'light' : 'dark');
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
        themeIcon.textContent = isLight ? '☀️' : '🌙';
    }
}

function openInOSM() {
    const lat = document.getElementById('coordLat').value;
    const lng = document.getElementById('coordLng').value;
    
    if (!lat || !lng) {
        alert('Please enter coordinates first');
        return;
    }
    
    const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
    window.open(url, '_blank');
}

function openInAudacity(path, filename) {
    const filepath = `${path}/${filename}`;
    const encodedPath = encodeURIComponent(filepath);
    
    fetch(`/api/open_in_audacity/${encodedPath}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(`❌ ${data.error}`);
            } else {
                const btn = document.getElementById('audacityBtn');
                if (btn) {
                    const originalText = btn.textContent;
                    btn.textContent = '✅ Opened!';
                    btn.style.background = '#4CAF50';
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.background = '#2196F3';
                    }, 2000);
                }
            }
        })
        .catch(error => {
            alert(`❌ Error: ${error.message}`);
        });
}

function toggleMenu() {
    const menu = document.getElementById('mainButtons');
    const btn = document.getElementById('hamburgerBtn');
    menu.classList.toggle('show');
    btn.classList.toggle('active');
}

document.addEventListener('DOMContentLoaded', () => {
    loadStructure();
    
    const searchInput = document.getElementById('searchInput');
    const spectroFilter = document.getElementById('spectrogramFilter');
    
    if (searchInput) searchInput.addEventListener('input', () => applyFilters());
    if (spectroFilter) spectroFilter.addEventListener('change', () => applyFilters());
    
    const modal = document.getElementById('generateModal');
    if (modal) {
        modal.addEventListener('change', (e) => { if (e.target.name === 'genType') selectGenType(e.target.value); });
        const fp = document.getElementById('genFilePath'); const dp = document.getElementById('genDirPath'); const btn = document.getElementById('startGenBtn');
        if (fp) fp.addEventListener('input', function() { if (document.querySelector('input[name="genType"]:checked')?.value === 'file' && btn) btn.disabled = !this.value.trim(); });
        if (dp) dp.addEventListener('input', function() { if (document.querySelector('input[name="genType"]:checked')?.value === 'directory' && btn) btn.disabled = !this.value.trim(); });
        modal.onclick = (e) => { if (e.target.id === 'generateModal') closeGenerateModal(); };
    }
    
    const readmeModal = document.getElementById('readmeModal');
    if (readmeModal) {
        readmeModal.onclick = (e) => { if (e.target.id === 'readmeModal') closeReadme(); };
    }
    
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeReadme(); closeGenerateModal(); } });
    
    const savedTheme = localStorage.getItem('birdoteque-theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) themeIcon.textContent = '☀️';
    }
});
