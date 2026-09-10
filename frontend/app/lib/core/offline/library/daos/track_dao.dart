import 'package:drift/drift.dart';
import '../schema.dart';
import '../database.dart';

part 'track_dao.g.dart';

@DriftAccessor(tables: [Tracks])
class TrackDao extends DatabaseAccessor<MusicDatabase> {
  TrackDao(super.db);

  Future<Track?> getTrack(String videoId) =>
      (select(tracks)..where((t) => t.videoId.equals(videoId))).getSingleOrNull();

  Future<List<Track>> getAllTracks() => select(tracks).get();

  Future<void> insertTrack(TracksCompanion track) => into(tracks).insert(track);

  Future<void> insertTracks(List<TracksCompanion> trackList) =>
      batch((b) => b.insertAll(tracks, trackList));

  Future<void> deleteTrack(String videoId) =>
      (delete(tracks)..where((t) => t.videoId.equals(videoId))).go();

  Stream<List<Track>> watchAllTracks() => select(tracks).watch();
}
