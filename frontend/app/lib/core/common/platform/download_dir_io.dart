import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:file_picker/file_picker.dart';
import 'download_dir.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class DownloadDirIO implements DownloadDirService {
  static const _storageKey = 'download_folder_path';
  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  @override
  Future<String?> pickDownloadFolder() async {
    final path = await FilePicker.platform.getDirectoryPath();
    if (path != null) {
      await saveFilePath(path);
    }
    return path;
  }

  @override
  Future<void> saveFilePath(String path) async {
    await _storage.write(key: _storageKey, value: path);
  }

  @override
  Future<String?> getDownloadFolder() async {
    final saved = await _storage.read(key: _storageKey);
    if (saved != null) {
      await validateFolder();
      return saved;
    }

    if (Platform.isWindows) {
      final downloads = await getDownloadsDirectory();
      if (downloads != null) {
        final musicStreamDir = Directory('${downloads.path}\\Music-Stream-and-Download');
        if (!await musicStreamDir.exists()) {
          await musicStreamDir.create(recursive: true);
        }
        await saveFilePath(musicStreamDir.path);
        return musicStreamDir.path;
      }
    }

    return null;
  }

  @override
  Future<void> validateFolder() async {
    final path = await _storage.read(key: _storageKey);
    if (path != null && !await Directory(path).exists()) {
      await _storage.delete(key: _storageKey);
    }
  }
}
