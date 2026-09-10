import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import 'package:media_store_plus/media_store_plus.dart';
import 'package:path_provider/path_provider.dart';
import '../common/platform/download_dir.dart';
import 'settings_repository.dart';

final exportServiceProvider = Provider((ref) {
  return ExportService(ref);
});

class ExportService {
  final Ref _ref;

  ExportService(this._ref);

  Future<String?> pickExportFolder() async {
    if (!Platform.isWindows) return null;
    
    final path = await FilePicker.platform.getDirectoryPath(
      dialogTitle: 'Select Download Folder',
    );
    
    if (path != null) {
      final settingsRepo = _ref.read(settingsRepositoryProvider);
      await settingsRepo.setDownloadFolder(path);
    }
    
    return path;
  }

  Future<String> getExportPath() async {
    final settingsRepo = _ref.read(settingsRepositoryProvider);
    
    if (Platform.isWindows) {
      final saved = await settingsRepo.getDownloadFolder();
      if (saved != null && await Directory(saved).exists()) {
        return saved;
      }
      
      final downloads = await getDownloadsDirectory();
      if (downloads != null) {
        final musicDir = Directory('${downloads.path}\\Music-Stream-and-Download');
        if (!await musicDir.exists()) {
          await musicDir.create(recursive: true);
        }
        await settingsRepo.setDownloadFolder(musicDir.path);
        return musicDir.path;
      }
    }
    
    if (Platform.isAndroid) {
      return 'Music/Music-Stream-and-Download';
    }
    
    throw Exception('Export not supported on this platform');
  }

  Future<String?> exportToMediaStore({
    required String sourcePath,
    required String title,
    required String artist,
  }) async {
    if (!Platform.isAndroid) return null;
    
    try {
      final mediaStore = MediaStorePlus();
      
      final result = await mediaStore.createFile(
        parentDir: 'Music',
        name: 'Music-Stream-and-Download',
        fileName: '$title.mp3',
        mimeType: 'audio/mpeg',
        sourceFile: sourcePath,
      );
      
      return result?.path;
    } catch (e) {
      print('MediaStore export error: $e');
      return null;
    }
  }

  Future<String> getOfflineLibraryPath() async {
    if (Platform.isAndroid) {
      final dir = await getApplicationSupportDirectory();
      return dir.path;
    }
    
    if (Platform.isWindows) {
      final localAppData = Platform.environment['LOCALAPPDATA'] ?? '';
      final musicDir = '$localAppData\\MusicStream\\library';
      await Directory(musicDir).create(recursive: true);
      return musicDir;
    }
    
    throw Exception('Offline library not supported on this platform');
  }

  Future<bool> isExportSupported() async {
    return Platform.isWindows || Platform.isAndroid;
  }
}