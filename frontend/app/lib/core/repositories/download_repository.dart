import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:background_downloader/background_downloader.dart';
import 'dart:io';
import '../online/api/downloads_api.dart';
import '../offline/library/daos/download_dao.dart';
import '../offline/library/database.dart';

final downloadManagerProvider = Provider((ref) {
  return DownloadManager(ref);
});

class DownloadManager {
  final Ref _ref;
  Map<String, double> _downloadProgress = {};

  DownloadManager(this._ref);

  Future<void> initializeBackgroundDownloader() async {
    if (!Platform.isAndroid && !Platform.isWindows) return;
    
    await FileDownloader().initialize();
  }

  Future<String> createDownload(String videoId, String title, {
    String format = 'mp3',
    String quality = 'high',
  }) async {
    final api = _ref.read(downloadsApiProvider);
    final job = await api.createDownload(videoId, format: format, quality: quality);

    final db = await _ref.read(databaseProvider.future);
    final downloadDao = DownloadDao(db);

    await downloadDao.insertDownload(
      DownloadsCompanion(
        videoId: Value(videoId),
        format: Value(format),
        quality: Value(quality),
        filePath: Value(''),
        fileSize: Value(0),
        state: Value('queued'),
        serverJobId: Value(job.id),
      ),
    );

    _pollDownloadStatus(job.id, videoId);

    return job.id;
  }

  Future<void> _pollDownloadStatus(String jobId, String videoId) async {
    const pollInterval = Duration(milliseconds: 1500);
    int attempts = 0;
    const maxAttempts = 2400; // 1 hour max

    while (attempts < maxAttempts) {
      try {
        final api = _ref.read(downloadsApiProvider);
        final status = await api.getDownloadStatus(jobId);

        final db = await _ref.read(databaseProvider.future);
        final downloadDao = DownloadDao(db);

        await downloadDao.updateDownload(
          DownloadsCompanion(
            videoId: Value(videoId),
            format: Value(status.fileSize != null ? 'mp3' : 'mp3'), // Placeholder
            quality: Value('high'),
            filePath: Value(status.fileSize != null ? _buildLocalPath(videoId) : ''),
            fileSize: Value(status.fileSize),
            state: Value(status.state),
          ),
        );

        if (status.state == 'completed') {
          await _downloadToDevice(status.id, videoId);
          return;
        } else if (status.state == 'failed') {
          return;
        }

        _downloadProgress[jobId] = (status.progress / 100).clamp(0.0, 1.0);

        await Future.delayed(pollInterval);
        attempts++;
      } catch (e) {
        print('Error polling download status: $e');
        await Future.delayed(pollInterval);
        attempts++;
      }
    }
  }

  Future<void> _downloadToDevice(String jobId, String videoId) async {
    try {
      final api = _ref.read(downloadsApiProvider);
      final fileUrl = '/downloads/$jobId/file';

      if (Platform.isWindows) {
        await _downloadToWindowsFolder(fileUrl, videoId);
      } else if (Platform.isAndroid) {
        await _downloadToMediaStore(fileUrl, videoId);
      }
    } catch (e) {
      print('Error downloading to device: $e');
    }
  }

  Future<void> _downloadToWindowsFolder(String fileUrl, String videoId) async {
    // background_downloader would handle this
    // For now, this is a placeholder for the actual implementation
  }

  Future<void> _downloadToMediaStore(String fileUrl, String videoId) async {
    // media_store_plus implementation would go here
    // For now, this is a placeholder for the actual implementation
  }

  String _buildLocalPath(String videoId) {
    return '/local/library/$videoId.mp3';
  }

  double? getDownloadProgress(String jobId) => _downloadProgress[jobId];

  Stream<double?> watchDownloadProgress(String jobId) async* {
    while (true) {
      yield _downloadProgress[jobId];
      await Future.delayed(const Duration(milliseconds: 500));
    }
  }
}
