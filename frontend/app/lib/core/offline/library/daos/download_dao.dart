import 'package:drift/drift.dart';
import '../schema.dart';
import '../database.dart';

part 'download_dao.g.dart';

@DriftAccessor(tables: [Downloads])
class DownloadDao extends DatabaseAccessor<MusicDatabase> {
  DownloadDao(super.db);

  Future<Download?> getDownload(String videoId) =>
      (select(downloads)..where((d) => d.videoId.equals(videoId)))
          .getSingleOrNull();

  Future<List<Download>> getDownloadsByState(String state) =>
      (select(downloads)..where((d) => d.state.equals(state))).get();

  Future<List<Download>> getAllDownloads() => select(downloads).get();

  Future<void> insertDownload(DownloadsCompanion download) =>
      into(downloads).insert(download);

  Future<void> updateDownload(DownloadsCompanion download) =>
      update(downloads).replace(download);

  Future<void> deleteDownload(String videoId) =>
      (delete(downloads)..where((d) => d.videoId.equals(videoId))).go();

  Stream<List<Download>> watchAllDownloads() => select(downloads).watch();

  Stream<Download?> watchDownload(String videoId) =>
      (select(downloads)..where((d) => d.videoId.equals(videoId))).watchSingleOrNull();
}
