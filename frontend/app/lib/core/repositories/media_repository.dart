import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../offline/library/daos/track_dao.dart';
import '../offline/library/database.dart';
import '../online/api/media_api.dart';

final mediaRepositoryProvider = Provider((ref) {
  return MediaRepository(ref);
});

class MediaRepository {
  final Ref _ref;

  MediaRepository(this._ref);

  Future<VideoInfo?> getCachedVideo(String videoId) async {
    final db = await _ref.read(databaseProvider.future);
    final trackDao = TrackDao(db);
    final track = await trackDao.getTrack(videoId);
    
    if (track == null) return null;

    return VideoInfo(
      videoId: track.videoId,
      title: track.title,
      uploaderName: track.uploaderName,
      uploaderUrl: '',
      duration: track.durationSec,
      thumbnailUrl: track.thumbUrl,
      uploadDate: DateTime.now(),
    );
  }

  Future<void> cacheVideo(VideoInfo video) async {
    final db = await _ref.read(databaseProvider.future);
    final trackDao = TrackDao(db);
    
    await trackDao.insertTrack(TracksCompanion(
      videoId: Value(video.videoId),
      title: Value(video.title),
      uploaderName: Value(video.uploaderName),
      durationSec: Value(video.duration),
      thumbUrl: Value(video.thumbnailUrl),
    ));
  }

  Future<List<VideoInfo>> searchLocal(String query) async {
    final db = await _ref.read(databaseProvider.future);
    final trackDao = TrackDao(db);
    
    final allTracks = await trackDao.getAllTracks();
    final lowerQuery = query.toLowerCase();
    
    return allTracks
        .where((t) => 
            t.title.toLowerCase().contains(lowerQuery) ||
            t.uploaderName.toLowerCase().contains(lowerQuery))
        .map((t) => VideoInfo(
          videoId: t.videoId,
          title: t.title,
          uploaderName: t.uploaderName,
          uploaderUrl: '',
          duration: t.durationSec,
          thumbnailUrl: t.thumbUrl,
          uploadDate: t.cachedAt,
        ))
        .toList();
  }

  Future<VideoInfo> getVideo(String videoId) async {
    final cached = await getCachedVideo(videoId);
    if (cached != null) return cached;

    final api = _ref.read(mediaApiProvider);
    final video = await api.getVideoInfo(videoId);
    await cacheVideo(video);
    return video;
  }
}