#!/usr/bin/env python3
"""
Générateur automatique de spectrogrammes pour BirdOTèque
Utilise FFmpeg pour créer des spectrogrammes en niveaux de gris
"""

import subprocess
import sys
from pathlib import Path
import os

# Extensions audio supportées
AUDIO_EXTENSIONS = {'.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.wma'}

def check_ffmpeg():
    """Vérifie si FFmpeg est installé"""
    try:
        subprocess.run(['ffmpeg', '-version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def generate_spectrogram(audio_path, output_path=None, width=1200, height=400):
    """
    Génère un spectrogramme en niveaux de gris à partir d'un fichier audio
    
    Args:
        audio_path: Chemin vers le fichier audio
        output_path: Chemin de sortie pour le spectrogramme (optionnel)
        width: Largeur du spectrogramme en pixels
        height: Hauteur du spectrogramme en pixels
    
    Returns:
        str: Chemin vers le spectrogramme généré ou None en cas d'erreur
    """
    audio_path = Path(audio_path)
    
    if not audio_path.exists():
        print(f"❌ Erreur: Le fichier audio n'existe pas: {audio_path}")
        return None
    
    if audio_path.suffix.lower() not in AUDIO_EXTENSIONS:
        print(f"❌ Erreur: Format non supporté: {audio_path.suffix}")
        return None
    
    # Définir le chemin de sortie
    if output_path is None:
        output_path = audio_path.with_suffix('.png')
    else:
        output_path = Path(output_path)
    
    print(f"🎵 Génération du spectrogramme pour: {audio_path.name}")
    print(f"📊 Sortie: {output_path.name}")
    
    # Commande FFmpeg pour spectrogramme en niveaux de gris
    # Filtre showspectrumpic + conversion en niveaux de gris avec hue=s=0
    cmd = [
        'ffmpeg',
        '-i', str(audio_path),
        '-filter_complex',
        f'[0:a]showspectrumpic=s={width}x{height}:mode=combined:color=intensity:scale=log:legend=1:orientation=vertical,hue=s=0,eq=contrast=1.6:brightness=0.05:saturation=0',
        '-frames:v', '1',
        '-y',
        str(output_path)
    ]
    
    try:
        # Exécuter FFmpeg
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            timeout=60  # Timeout de 60 secondes
        )
        
        if output_path.exists():
            size_mb = output_path.stat().st_size / (1024 * 1024)
            print(f"✅ Spectrogramme généré avec succès ({size_mb:.2f} Mo)")
            return str(output_path)
        else:
            print("❌ Erreur: Le fichier de sortie n'a pas été créé")
            return None
            
    except subprocess.TimeoutExpired:
        print("❌ Erreur: Timeout lors de la génération du spectrogramme")
        return None
    except subprocess.CalledProcessError as e:
        print(f"❌ Erreur FFmpeg: {e.stderr.decode('utf-8', errors='ignore')}")
        return None
    except Exception as e:
        print(f"❌ Erreur inattendue: {e}")
        return None

def generate_spectrogram_for_directory(directory, recursive=True):
    """
    Génère des spectrogrammes pour tous les fichiers audio d'un répertoire
    
    Args:
        directory: Chemin vers le répertoire
        recursive: Si True, parcourt les sous-répertoires
    
    Returns:
        tuple: (succès, échecs)
    """
    directory = Path(directory)
    
    if not directory.exists():
        print(f"❌ Erreur: Le répertoire n'existe pas: {directory}")
        return 0, 0
    
    if recursive:
        audio_files = []
        for ext in AUDIO_EXTENSIONS:
            audio_files.extend(directory.rglob(f'*{ext}'))
            audio_files.extend(directory.rglob(f'*{ext.upper()}'))
    else:
        audio_files = []
        for ext in AUDIO_EXTENSIONS:
            audio_files.extend(directory.glob(f'*{ext}'))
            audio_files.extend(directory.glob(f'*{ext.upper()}'))
    
    print(f"📁 {len(audio_files)} fichiers audio trouvés")
    
    success = 0
    failed = 0
    
    for audio_file in audio_files:
        spectrogram_path = audio_file.with_suffix('.png')
        
        # Vérifier si le spectrogramme existe déjà
        if spectrogram_path.exists():
            print(f"⏭️  Déjà existant: {spectrogram_path.name}")
            continue
        
        if generate_spectrogram(audio_file):
            success += 1
        else:
            failed += 1
    
    return success, failed

def main():
    """Fonction principale"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Générateur de spectrogrammes (niveaux de gris) pour BirdOTèque')
    parser.add_argument('path', help='Chemin vers le fichier audio ou le répertoire')
    parser.add_argument('-r', '--recursive', action='store_true', help='Parcourir les sous-répertoires')
    parser.add_argument('-w', '--width', type=int, default=1200, help='Largeur du spectrogramme (défaut: 1200)')
    parser.add_argument('-ht', '--height', type=int, default=400, help='Hauteur du spectrogramme (défaut: 400)')
    
    args = parser.parse_args()
    
    # Vérifier FFmpeg
    if not check_ffmpeg():
        print("❌ Erreur: FFmpeg n'est pas installé ou n'est pas dans le PATH")
        print("\n📦 Installation sur Debian/Ubuntu:")
        print("   sudo apt install ffmpeg")
        print("\n📦 Installation sur macOS:")
        print("   brew install ffmpeg")
        print("\n📦 Installation sur Windows:")
        print("   Téléchargez depuis https://ffmpeg.org/download.html")
        sys.exit(1)
    
    path = Path(args.path)
    
    if path.is_file():
        # Générer pour un fichier unique
        generate_spectrogram(path, width=args.width, height=args.height)
    elif path.is_dir():
        # Générer pour un répertoire
        success, failed = generate_spectrogram_for_directory(path, args.recursive)
        print(f"\n{'='*50}")
        print(f"✅ Terminé: {success} spectrogrammes générés")
        if failed > 0:
            print(f"❌ Échecs: {failed}")
    else:
        print(f"❌ Erreur: Le chemin n'existe pas: {path}")
        sys.exit(1)

if __name__ == '__main__':
    main()
