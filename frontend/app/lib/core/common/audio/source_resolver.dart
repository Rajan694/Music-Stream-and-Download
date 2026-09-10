import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../offline/library/daos/download_dao.dart';
import '../../offline/library/db_provider.dart';
import '../../online/api/media_api.dart';
import '../../online/connectivity_service.dart';
import '../../repositories/settings_repository.dart';
import 'playback_engine.dart';

final sourceResolverProvider = Provider((ref) {
  return SourceResolver(ref);
});

/// The single place where "online" and "offline" meet. Everything downstream
/// sees one [AudioSourceSpec] and never learns which it got.
class SourceResolver {
  final Ref _ref;

  SourceResolver(this._ref);

  Future<AudioSourceSpec> resolve(VideoInfo video) async {
    // Prefer a local copy even when online: it is what makes this both an
    // online and an offline player, and it saves the relay the bandwidth.
    final local = await _localFileFor(video.videoId);
    if (local != null) return local;

    if (!_ref.read(isOnlineProvider)) {
      return Unavailable('offlineNoLocalCopy');
    }

    try {
      final api = _ref.read(mediaApiProvider);
      final ticket = await api.getStreamTicket(video.videoId);
      final quality =
          await _ref.read(settingsRepositoryProvider).getStreamQuality();

      return RemoteStream(
        videoId: video.videoId,
        // Must be one of low|medium|high — the backend rejects anything else
        // with a 400 before it reaches the provider.
        quality: _normaliseQuality(quality),
        ticket: ticket,
      );
    } catch (_) {
      // Connectivity said yes but the request failed: treat as unplayable so
      // the queue skips past instead of stalling on a dead entry.
      return Unavailable('streamUnavailable');
    }
  }

  /// Local-only resolution, for callers that must not touch the network.
  Future<AudioSourceSpec> resolveOffline(VideoInfo video) async {
    return await _localFileFor(video.videoId) ??
        Unavailable('offlineNoLocalCopy');
  }

  Future<LocalFile?> _localFileFor(String videoId) async {
    // Web has no filesystem; there is never a local copy to find.
    if (kIsWeb) return null;

    // `.future`, not `.whenData(...).value!` — the database provider is async
    // and force-unwrapping it crashes on any resolve that runs before it
    // finishes opening.
    final db = await _ref.read(databaseProvider.future);
    final download = await DownloadDao(db).getDownload(videoId);

    if (download == null ||
        download.state != 'completed' ||
        download.filePath == null) {
      return null;
    }

    final file = File(download.filePath!);
    if (!await file.exists()) return null;

    // Size check, not just existence: an interrupted download leaves a
    // truncated file that plays for a few seconds, reports completion, and
    // auto-advances the queue — which reads as a random skipping bug.
    final expected = download.fileSize;
    if (expected != null && await file.length() != expected) return null;

    return LocalFile(download.filePath!);
  }

  String _normaliseQuality(String value) {
    const allowed = {'low', 'medium', 'high'};
    return allowed.contains(value) ? value : 'high';
  }
}
