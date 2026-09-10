export 'download_dir_web.dart' if (dart.library.io) 'download_dir_io.dart';

abstract interface class DownloadDirService {
  Future<String?> pickDownloadFolder();
  Future<void> saveFilePath(String path);
  Future<String?> getDownloadFolder();
  Future<void> validateFolder();
}
