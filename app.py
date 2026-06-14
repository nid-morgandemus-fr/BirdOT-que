#!/usr/bin/env python3
from flask import Flask, render_template, jsonify, send_from_directory, request
import os
import sys
import tkinter as tk
from tkinter import filedialog, messagebox
from pathlib import Path
import threading
import webbrowser
import markdown
import json
import subprocess
import time
from functools import lru_cache

app = Flask(__name__)
REPO_PATH = None
CONFIG_FILE = Path.home() / '.birdoteque_config.json'

# Extensions supportées
AUDIO_EXTENSIONS = {'.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.wma'}
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.svg', '.webp'}

# État de la génération
generation_state = {
    'running': False,
    'total': 0,
    'completed': 0,
    'failed': 0,
    'current_file': '',
    'log': []
}

# Cache pour la structure
structure_cache = None
cache_timestamp = 0

def load_config():
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return {'last_path': ''}

def save_config(path):
    try:
        config = {'last_path': path}
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        print(f"⚠️  Config save error: {e}")

def check_ffmpeg():
    """Vérifie si FFmpeg est disponible"""
    try:
        subprocess.run(['ffmpeg', '-version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return True
    except:
        return False

def generate_spectrogram_async(audio_path, spectrogram_path):
    """Génère un spectrogramme en niveaux de gris avec contraste élevé et échelle de fréquences"""
    cmd = [
        'ffmpeg',
        '-i', str(audio_path),
        '-filter_complex',
        '[0:a]showspectrumpic=s=1200x400:mode=combined:color=intensity:scale=log:legend=1:orientation=vertical,hue=s=0,eq=contrast=1.6:brightness=0.05:saturation=0',
        '-frames:v', '1',
        '-y',
        str(spectrogram_path)
    ]
    
    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=60)
        return True
    except:
        return False

def find_matching_spectrogram(folder_path, audio_filename):
    """
    Trouve le spectrogramme associé à un fichier audio
    Recherche plus intelligente qui gère les espaces et la casse
    """
    audio_path = Path(audio_filename)
    audio_base = audio_path.stem.lower().strip()
    audio_ext = audio_path.suffix.lower()
    
    print(f"🔍 Searching spectrogram for: {audio_filename}")
    print(f"   Base name: {audio_base}")
    print(f"   Folder: {folder_path}")
    
    # Liste tous les fichiers du dossier pour debug
    try:
        all_files = list(folder_path.iterdir())
        print(f"   Files in folder: {[f.name for f in all_files]}")
    except:
        pass
    
    # Méthode 1: Chercher une image avec le même nom exact (case insensitive)
    for ext in IMAGE_EXTENSIONS:
        # Essai avec le nom exact
        matching_file = folder_path / f"{audio_path.stem}{ext}"
        if matching_file.exists():
            print(f"   ✅ Found (exact): {matching_file.name}")
            return matching_file.name
        
        # Essai en minuscules
        matching_file_lower = folder_path / f"{audio_base}{ext}"
        if matching_file_lower.exists():
            print(f"   ✅ Found (lowercase): {matching_file_lower.name}")
            return matching_file_lower.name
    
    # Méthode 2: Chercher parmi tous les PNG du dossier
    for file in folder_path.iterdir():
        if file.suffix.lower() in IMAGE_EXTENSIONS:
            file_base = file.stem.lower().strip()
            # Comparaison souple
            if file_base == audio_base:
                print(f"   ✅ Found (flexible): {file.name}")
                return file.name
            # Vérifier si le nom du PNG contient le nom de l'audio
            if audio_base in file_base or file_base in audio_base:
                print(f"   ✅ Found (partial match): {file.name}")
                return file.name
    
    print(f"   ❌ No spectrogram found")
    return None

def get_or_generate_spectrogram(folder_path, audio_filename):
    """Récupère ou génère le spectrogramme pour un fichier audio"""
    audio_full_path = folder_path / audio_filename
    
    # Chercher un spectrogramme existant
    spectrogram_name = find_matching_spectrogram(folder_path, audio_filename)
    if spectrogram_name:
        return spectrogram_name
    
    # Pas de spectrogramme trouvé, vérifier si FFmpeg est disponible
    if not check_ffmpeg():
        print(f"⚠️  FFmpeg not available, no spectrogram for {audio_filename}")
        return None
    
    # Générer le spectrogramme
    audio_base = Path(audio_filename).stem
    spectrogram_path = folder_path / f"{audio_base}.png"
    
    print(f"🎨 Generating spectrogram: {audio_filename}")
    
    # Générer dans un thread séparé
    def generate():
        success = generate_spectrogram_async(audio_full_path, spectrogram_path)
        if success:
            print(f"✅ Spectrogram generated: {spectrogram_path.name}")
            # Invalider le cache
            global structure_cache, cache_timestamp
            structure_cache = None
            cache_timestamp = 0
        else:
            print(f"❌ Generation failed: {audio_filename}")
    
    thread = threading.Thread(target=generate, daemon=True)
    thread.start()
    
    return None

def clear_structure_cache():
    """Invalide le cache de la structure"""
    global structure_cache, cache_timestamp
    structure_cache = None
    cache_timestamp = 0
    
def generate_spectrograms_in_background(target_path, recursive=False):
    """Génère les spectrogrammes en arrière-plan"""
    global generation_state
    
    generation_state = {
        'running': True,
        'total': 0,
        'completed': 0,
        'failed': 0,
        'current_file': '',
        'log': ['⚠️  Warning: Existing spectrograms will be overwritten']
    }
    
    target = Path(target_path)
    
    if target.is_file():
        # Fichier unique
        generation_state['total'] = 1
        spectrogram_path = target.with_suffix('.png')
        
        if spectrogram_path.exists():
            generation_state['log'].append(f"⏭️  Already exists: {target.name}")
            generation_state['completed'] = 1
        else:
            generation_state['current_file'] = target.name
            generation_state['log'].append(f"🎵 Generating: {target.name}")
            
            if generate_spectrogram_async(target, spectrogram_path):
                generation_state['completed'] = 1
                generation_state['log'].append(f"✅ Success: {target.name}")
            else:
                generation_state['failed'] = 1
                generation_state['log'].append(f"❌ Failed: {target.name}")
    else:
        # Répertoire
        audio_files = []
        for ext in AUDIO_EXTENSIONS:
            if recursive:
                audio_files.extend(target.rglob(f'*{ext}'))
                audio_files.extend(target.rglob(f'*{ext.upper()}'))
            else:
                audio_files.extend(target.glob(f'*{ext}'))
                audio_files.extend(target.glob(f'*{ext.upper()}'))
        
        generation_state['total'] = len(audio_files)
        
        for audio_file in audio_files:
            spectrogram_path = audio_file.with_suffix('.png')
            generation_state['current_file'] = audio_file.name
            
            if spectrogram_path.exists():
                generation_state['completed'] += 1
                generation_state['log'].append(f"⏭️  Already exists: {audio_file.name}")
            else:
                generation_state['log'].append(f"🎵 Generating: {audio_file.name}")
                
                if generate_spectrogram_async(audio_file, spectrogram_path):
                    generation_state['completed'] += 1
                    generation_state['log'].append(f"✅ Success: {audio_file.name}")
                else:
                    generation_state['failed'] += 1
                    generation_state['log'].append(f"❌ Failed: {audio_file.name}")
    
    generation_state['running'] = False
    generation_state['log'].append("=" * 50)
    generation_state['log'].append(f"✅ Completed: {generation_state['completed']} spectrograms")
    if generation_state['failed'] > 0:
        generation_state['log'].append(f"❌ Failed: {generation_state['failed']}")
    
    # Invalider le cache après génération
    clear_structure_cache()

def select_directory(last_path=''):
    root = tk.Tk()
    root.withdraw()
    
    dialog = tk.Toplevel(root)
    dialog.title("BirdOTèque - Select Directory")
    dialog.geometry("600x150")
    dialog.resizable(False, False)
    dialog.configure(bg='#2a2a2a')
    
    dialog.update_idletasks()
    x = (dialog.winfo_screenwidth() // 2) - (600 // 2)
    y = (dialog.winfo_screenheight() // 2) - (150 // 2)
    dialog.geometry(f'600x150+{x}+{y}')
    
    label = tk.Label(
        dialog,
        text="Select your BirdOTèque directory:",
        bg='#2a2a2a',
        fg='#4CAF50',
        font=('Arial', 12, 'bold')
    )
    label.pack(pady=(20, 10))
    
    frame = tk.Frame(dialog, bg='#2a2a2a')
    frame.pack(padx=20, pady=10, fill=tk.X)
    
    path_var = tk.StringVar(value=last_path)
    entry = tk.Entry(
        frame,
        textvariable=path_var,
        font=('Arial', 10),
        bg='#1a1a1a',
        fg='white',
        insertbackground='white',
        relief=tk.FLAT,
        bd=2
    )
    entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 10))
    
    def browse():
        initial_dir = last_path if last_path and os.path.exists(last_path) else os.path.expanduser('~')
        directory = filedialog.askdirectory(
            title="Select BirdOTèque folder",
            initialdir=initial_dir
        )
        if directory:
            path_var.set(directory)
    
    browse_btn = tk.Button(
        frame,
        text="Browse...",
        command=browse,
        bg='#4CAF50',
        fg='white',
        font=('Arial', 10, 'bold'),
        relief=tk.FLAT,
        cursor='hand2',
        padx=15,
        pady=5
    )
    browse_btn.pack(side=tk.RIGHT)
    
    result = [None]
    
    button_frame = tk.Frame(dialog, bg='#2a2a2a')
    button_frame.pack(pady=10)
    
    def on_ok():
        path = path_var.get().strip()
        if not path:
            messagebox.showerror("Error", "Please enter a path")
            return
        if not os.path.exists(path) or not os.path.isdir(path):
            messagebox.showerror("Error", "Path does not exist or is not a directory")
            return
        
        if not check_ffmpeg():
            if not messagebox.askyesno("FFmpeg not found", 
                "FFmpeg is not installed. Do you want to continue anyway?\n\n"
                "Without FFmpeg, spectrograms won't be generated automatically.\n\n"
                "Install FFmpeg with: sudo apt install ffmpeg"):
                dialog.destroy()
                root.quit()
                return
        
        result[0] = path
        save_config(path)
        dialog.destroy()
        root.quit()
    
    def on_cancel():
        dialog.destroy()
        root.quit()
    
    ok_btn = tk.Button(
        button_frame,
        text="OK",
        command=on_ok,
        bg='#4CAF50',
        fg='white',
        font=('Arial', 10, 'bold'),
        relief=tk.FLAT,
        cursor='hand2',
        width=10,
        pady=5
    )
    ok_btn.pack(side=tk.LEFT, padx=5)
    
    cancel_btn = tk.Button(
        button_frame,
        text="Cancel",
        command=on_cancel,
        bg='#666666',
        fg='white',
        font=('Arial', 10, 'bold'),
        relief=tk.FLAT,
        cursor='hand2',
        width=10,
        pady=5
    )
    cancel_btn.pack(side=tk.LEFT, padx=5)
    
    dialog.bind('<Return>', lambda e: on_ok())
    entry.focus_set()
    
    root.mainloop()
    root.destroy()
    
    return result[0]

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/structure')
def get_structure():
    """Scanne la structure et retourne les fichiers audio avec spectrogrammes (triés alphabétiquement)"""
    global structure_cache, cache_timestamp
    
    if not REPO_PATH:
        return jsonify([])
    
    current_time = time.time()
    if structure_cache and (current_time - cache_timestamp) < 5:
        return jsonify(structure_cache)
    
    structure = []
    
    for root, dirs, files in os.walk(REPO_PATH):
        # TRI ALPHABÉTIQUE des dossiers et fichiers
        dirs.sort(key=lambda x: x.lower())
        files.sort(key=lambda x: x.lower())
        
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != '__pycache__']
        
        audio_files = sorted([f for f in files if Path(f).suffix.lower() in AUDIO_EXTENSIONS], key=lambda x: x.lower())
        
        if audio_files:
            rel_path = Path(root).relative_to(REPO_PATH)
            folder_path = Path(root)
            
            audio_with_spectrograms = []
            for audio in audio_files:
                spectrogram = find_matching_spectrogram(folder_path, audio)
                audio_with_spectrograms.append({
                    'name': audio,
                    'spectrogram': spectrogram
                })
            
            structure.append({
                'path': str(rel_path).replace('\\', '/'),
                'name': Path(root).name,
                'audio': audio_with_spectrograms
            })
    
    # Trier la structure finale par chemin
    structure.sort(key=lambda x: x['path'].lower())
    
    structure_cache = structure
    cache_timestamp = time.time()
    
    return jsonify(structure)

@app.route('/api/refresh_structure')
def refresh_structure():
    """Force le rafraîchissement de la structure"""
    clear_structure_cache()
    return jsonify({'message': 'Structure refreshed'})

@app.route('/api/generate_spectrogram', methods=['POST'])
def api_generate_spectrogram():
    """API pour générer des spectrogrammes"""
    if not REPO_PATH:
        return jsonify({'error': 'Directory not configured'}), 404
    
    data = request.json
    target_path = data.get('path')
    recursive = data.get('recursive', False)
    
    if not target_path:
        return jsonify({'error': 'No path provided'}), 400
    
    # Vérifier si une génération est déjà en cours
    if generation_state['running']:
        return jsonify({'error': 'Generation already in progress'}), 409
    
    # Lancer la génération en arrière-plan
    thread = threading.Thread(target=generate_spectrograms_in_background, args=(target_path, recursive), daemon=True)
    thread.start()
    
    return jsonify({'message': 'Generation started'}), 202

@app.route('/api/generation_status')
def api_generation_status():
    """Retourne le statut de la génération en cours"""
    return jsonify(generation_state)

@app.route('/api/get_spectrogram/<path:filepath>')
def get_spectrogram(filepath):
    """Retourne ou génère un spectrogramme pour un fichier audio"""
    if not REPO_PATH:
        return "Directory not configured", 404
    
    file_path = Path(REPO_PATH) / filepath
    
    if not file_path.exists():
        return "File not found", 404
    
    folder_path = file_path.parent
    audio_filename = file_path.name
    
    # Chercher le spectrogramme
    spectrogram_name = find_matching_spectrogram(folder_path, audio_filename)
    
    if spectrogram_name:
        # Invalider le cache
        clear_structure_cache()
        return jsonify({
            'spectrogram': spectrogram_name,
            'path': str(Path(filepath).parent / spectrogram_name).replace('\\', '/')
        })
    else:
        return jsonify({
            'spectrogram': None,
            'message': 'Spectrogram not found'
        }), 404

@app.route('/files/<path:filepath>')
def serve_file(filepath):
    if not REPO_PATH:
        return "Directory not configured", 404
    
    file_path = Path(REPO_PATH) / filepath
    if not file_path.resolve().is_relative_to(Path(REPO_PATH).resolve()):
        return "Access denied", 403
    
    if not file_path.exists():
        return "File not found", 404
    
    # Ajouter un header pour éviter le cache
    response = send_from_directory(REPO_PATH, filepath)
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response

@app.route('/api/readme')
def get_readme():
    readme_path = None
    
    # 1. Chercher dans le dossier BirdOTèque sélectionné
    if REPO_PATH:
        readme_path = Path(REPO_PATH) / 'README.md'
        
    # 2. Si non trouvé, chercher dans le dossier racine de l'application (où se trouve app.py)
    if not readme_path or not readme_path.exists():
        app_root = Path(__file__).parent
        readme_path = app_root / 'README.md'

    if readme_path and readme_path.exists():
        try:
            content = readme_path.read_text(encoding='utf-8')
            html_content = markdown.markdown(
                content,
                extensions=['tables', 'fenced_code', 'codehilite', 'toc', 'nl2br'],
                output_format='html5'
            )
            return html_content
        except Exception as e:
            return f"Read error: {str(e)}", 500
            
    return "README not found", 404

def open_browser():
    import time
    time.sleep(1.5)
    webbrowser.open('http://localhost:5000')

def main():
    global REPO_PATH
    
    print("🐦 BirdOTèque")
    print("=" * 40)
    
    config = load_config()
    last_path = config.get('last_path', '')
    
    if last_path:
        print(f"💾 Last path: {last_path}")
    
    REPO_PATH = select_directory(last_path)
    
    if not REPO_PATH:
        print("❌ No directory selected. Exiting.")
        sys.exit(0)
    
    print(f"✅ Directory: {REPO_PATH}")
    
    if check_ffmpeg():
        print("🎬 FFmpeg detected - Auto spectrogram generation enabled")
    else:
        print("⚠️  FFmpeg not found - Install with: sudo apt install ffmpeg")
    
    print(f"🌐 Server: http://localhost:5000")
    print("=" * 40)
    
    threading.Thread(target=open_browser, daemon=True).start()
    
    app.run(host='0.0.0.0', port=5000, debug=False)

if __name__ == '__main__':
    main()
