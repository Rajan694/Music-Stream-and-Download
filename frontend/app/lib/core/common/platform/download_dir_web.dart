import 'download_dir.dart';

class DownloadDirWeb implements DownloadDirService {
  @override
  Future<String?> pickDownloadFolder() async {
    return null;
  }

  @override
  Future<void> saveFilePath(String path) async {}

  @override
  Future<String?> getDownloadFolder() async {
    return null;
  }

  @override
  Future<void> validateFolder() async {}
}
