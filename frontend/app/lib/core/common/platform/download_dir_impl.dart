import 'dart:io';
import 'download_dir_io.dart';
import 'download_dir_web.dart';

class DownloadDirServiceImpl implements DownloadDirService {
  late final DownloadDirService _impl;

  DownloadDirServiceImpl() {
    if (Platform.isWindows || Platform.isAndroid || Platform.isIOS) {
      _impl = DownloadDirIO();
    } else if (Platform.isLinux || Platform.isMacOS) {
      _impl = DownloadDirIO();
    } else {
      _impl = DownloadDirWeb();
    }
  }

  @override
  Future<String?> pickDownloadFolder() => _impl.pickDownloadFolder();

  @override
  Future<void> saveFilePath(String path) => _impl.saveFilePath(path);

  @override
  Future<String?> getDownloadFolder() => _impl.getDownloadFolder();

  @override
  Future<void> validateFolder() => _impl.validateFolder();
}