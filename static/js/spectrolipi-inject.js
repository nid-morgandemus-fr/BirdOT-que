// Spectrolipi Auto-Load Script - BirdOTèque Integration
console.log('BirdOTèque: Spectrolipi inject script loaded');

function loadAudioInSpectrolipi(audioUrl) {
    console.log('BirdOTèque: Attempting to load audio:', audioUrl);
    
    fetch(audioUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.blob();
        })
        .then(blob => {
            console.log('BirdOTèque: Audio file downloaded, size:', blob.size, 'bytes');
            
            const urlParts = audioUrl.split('/');
            const fileName = decodeURIComponent(urlParts[urlParts.length - 1]) || 'audio.wav';
            console.log('BirdOTèque: Filename:', fileName);
            
            const file = new File([blob], fileName, { 
                type: blob.type || 'audio/wav',
                lastModified: Date.now()
            });
            
            const fileInput = document.querySelector('input[type="file"]');
            if (fileInput) {
                console.log('BirdOTèque: Found file input, attempting to set files...');
                
                try {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    fileInput.files = dataTransfer.files;
                    
                    const changeEvent = new Event('change', { bubbles: true });
                    const inputEvent = new Event('input', { bubbles: true });
                    
                    fileInput.dispatchEvent(changeEvent);
                    fileInput.dispatchEvent(inputEvent);
                    
                    console.log('BirdOTèque: File input events dispatched successfully');
                } catch (err) {
                    console.error('BirdOTèque: Error with file input method:', err);
                    tryLoadWithFunction(file);
                }
            } else {
                console.warn('BirdOTèque: No file input found, trying function method...');
                tryLoadWithFunction(file);
            }
        })
        .catch(error => {
            console.error('BirdOTèque: Error downloading audio file:', error);
            alert('Error loading audio file automatically. Please load it manually.\n\nError: ' + error.message);
        });
}

function tryLoadWithFunction(file) {
    console.log('BirdOTèque: Trying to load via JavaScript function...');
    
    const possibleFunctions = [
        'loadAudio',
        'loadFile',
        'handleFileSelect',
        'onFileLoad',
        'processFile'
    ];
    
    for (const funcName of possibleFunctions) {
        if (typeof window[funcName] === 'function') {
            console.log('BirdOTèque: Found function:', funcName);
            try {
                window[funcName](file);
                console.log('BirdOTèque: Successfully called', funcName);
                return;
            } catch (err) {
                console.error(`BirdOTèque: Error calling ${funcName}:`, err);
            }
        }
    }
    
    console.warn('BirdOTèque: Could not find a suitable load function. User must load file manually.');
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('BirdOTèque: DOMContentLoaded event fired');
    
    const urlParams = new URLSearchParams(window.location.search);
    const audioUrl = urlParams.get('audio');
    
    if (audioUrl) {
        console.log('BirdOTèque: Audio URL parameter found:', audioUrl);
        
        const maxAttempts = 10;
        let attempt = 0;
        
        const tryInit = () => {
            attempt++;
            console.log(`BirdOTèque: Initialization attempt ${attempt}/${maxAttempts}`);
            
            const fileInput = document.querySelector('input[type="file"]');
            const hasSpectrolipiElements = fileInput || document.querySelector('.spectrogram-container') || document.getElementById('canvas');
            
            if (hasSpectrolipiElements || attempt >= maxAttempts) {
                console.log('BirdOTèque: Spectrolipi appears ready, loading audio...');
                loadAudioInSpectrolipi(audioUrl);
            } else {
                console.log('BirdOTèque: Spectrolipi not ready yet, retrying in 500ms...');
                setTimeout(tryInit, 500);
            }
        };
        
        setTimeout(tryInit, 1000);
    } else {
        console.log('BirdOTèque: No audio URL parameter found');
    }
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log('BirdOTèque: DOM already loaded, checking immediately...');
    const urlParams = new URLSearchParams(window.location.search);
    const audioUrl = urlParams.get('audio');
    if (audioUrl) {
        setTimeout(() => {
            const fileInput = document.querySelector('input[type="file"]');
            if (fileInput) {
                loadAudioInSpectrolipi(audioUrl);
            }
        }, 1500);
    }
}
