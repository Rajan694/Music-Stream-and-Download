import 'package:drift/drift.dart';
import 'schema.dart';

part 'database.g.dart';

@DriftDatabase(tables: [
  Tracks,
  Downloads,
  PlaylistsLocal,
  PlaylistTracks,
  PlayEvents,
  MutationOutbox,
  SettingsLocal,
  MediaCache,
  KvStore,
])
class MusicDatabase extends _$MusicDatabase {
  MusicDatabase(super.e);

  @override
  int get schemaVersion => 1;
}
