import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:background_downloader/background_downloader.dart';
import '../online/api/downloads_api.dart';
import '../offline/library/database.dart';
import '../offline/library/daos/download_dao.dart';
import 'export_service.dart';

final downloadExecutorProvider = Provider((ref) {
  return DownloadExecutor(ref);
});

class DownloadExecutor {
  final Ref _ref;
  final FileDownloader _downloader = FileDownloader();

  DownloadExecutor(this._ref) {
    _init();
  }

  void _init() {
    if (Platform.isAndroid || Platform.isWindows) {
      _downloader.configureNotification(
        const FileNotificationConfiguration(
          title: 'Music Download',
          message: 'Downloading: ',
          progress: true,
          completed: 'Download complete',
          error: 'Download failed',
        ),
      );
    }
  }

  Future<String> downloadFile({
    required String jobId,
    required String videoId,
    required String title,
    required String format,
  }) async {
    final baseUrl = const String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://localhost:4000/api/v1',
    );
    final downloadUrl = '$baseUrl/downloads/$jobId/file';
    
    final exportService = _ref.read(exportServiceProvider);
    final localPath = await exportService.getOfflineLibraryPath();
    final fileName = '$videoId.$format';
    final localFilePath = '$localPath/$fileName';
    
    final task = Task(
      url: downloadUrl,
      filename: fileName,
      directory: localPath,
      requiresWiFi: false,
      retries: 3,
    );

    final result = await _downloader.download(task);
    
    if (result.status == TaskStatus.complete) {
      await _updateDownloadStatus(videoId, 'completed', localFilePath);
      
      await _exportCopy(videoId, title, localFilePath);
    } else {
      await _updateDownloadStatus(videoId, 'failed', null);
    }
    
    return localFilePath;
  }

  Future<void> _updateDownloadStatus(String videoId, String state, String? filePath) async {
    final db = await _ref.read(databaseProvider.future);
    final downloadDao = DownloadDao(db);
    
    await downloadDao.updateDownload(
      DownloadsCompanion(
        videoId: Value(videoId),
        format: const Value('mp3'),
        quality: const Value('high'),
        filePath: Value(filePath ?? ''),
        fileSize: filePath != null ? Value(await File(filePath).length()) : const Value.absent(),
        state: Value(state),
        downloadedAt: state == 'completed' ? Value(DateTime.now()) : const Value.absent(),
      ),
    );
  }

  Future<void> _exportCopy(String videoId, String title, String sourcePath) async {
    final exportService = _ref.read(exportServiceProvider);
    
    if (!await exportService.isExportSupported()) return;
    
    if (Platform.isWindows) {
      final exportPath = await exportService.getExportPath();
      final destFile = File('$exportPath/$title.mp3');
      await File(sourcePath).copy(destFile.path);
      
      await _updateExportPath(videoId, destFile.path);
    } else if (Platform.isAndroid) {
      final exportedPath = await exportService.exportToMediaStore(
        sourcePath: sourcePath,
        title: title,
        artist: 'Unknown',
      );
      
      if (exportedPath != null) {
        await _updateExportPath(videoId, exportedPath);
      }
    }
  }

  Future<void> _updateExportPath(String videoId, String path) async {
    final db = await _ref.read(databaseProvider.future);
    final downloadDao = DownloadDao(db);
    
    await downloadDao.updateDownload(
      DownloadsCompanion(
        videoId: Value(videoId),
        format: const Value('mp3'),
        quality: const Value('high'),
        filePath: const Value(''),
        fileSize: const Value.absent(),
        state: const Value('completed'),
        exportedPath: Value(path),
      ),
    );
  }

  Stream<DownloadTaskProgress> progressStream(String taskId) {
    return _downloader
        .progresses()
        .where((p) => p.task.url.contains(taskId))
        .map((p) => p);
  }

  Future<void> cancelDownload(String taskId) async {
    await _downloader.cancelTaskWithId(taskId);
  }
}