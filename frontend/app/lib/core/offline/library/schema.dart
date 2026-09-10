import 'package:drift/drift.dart';

class Tracks extends Table {
  TextColumn get videoId => text()();
  TextColumn get title => text()();
  TextColumn get uploaderName => text()();
  IntColumn get durationSec => integer()();
  TextColumn get thumbUrl => text().nullable()();
  DateTimeColumn get cachedAt => dateTime().withDefault(currentDateAndTime)();

  @override
  Set<Column> get primaryKey => {videoId};
}

class Downloads extends Table {
  TextColumn get videoId => text()();
  TextColumn get format => text()(); // mp3, webm, ogg
  TextColumn get quality => text()(); // low, medium, high
  TextColumn get filePath => text()();
  IntColumn get fileSize => integer()();
  TextColumn get state => text().withDefault(const Constant('queued'))(); // queued, downloading, completed, failed
  TextColumn get serverJobId => text().nullable()();
  TextColumn get exportedPath => text().nullable()(); // path in Music folder (Android) or user folder (Windows)
  DateTimeColumn get downloadedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {videoId};
}

class PlaylistsLocal extends Table {
  TextColumn get id => text()();
  TextColumn get title => text()();
  TextColumn get thumbUrl => text().nullable()();
  IntColumn get videoCount => integer().withDefault(const Constant(0))();
  TextColumn get kind => text().withDefault(const Constant('local'))(); // pinned, local
  DateTimeColumn get updatedAt => dateTime().withDefault(currentDateAndTime)();

  @override
  Set<Column> get primaryKey => {id};
}

class PlaylistTracks extends Table {
  TextColumn get playlistId => text()();
  TextColumn get videoId => text()();
  IntColumn get position => integer()();

  @override
  Set<Column> get primaryKey => {playlistId, position};
  
  @override
  List<Set<Column>> get uniqueKeys => [
    {playlistId, position},
  ];
}

class PlayEvents extends Table {
  TextColumn get id => text()(); // UUID v4 for idempotency
  TextColumn get videoId => text()();
  TextColumn get title => text()();
  TextColumn get uploaderName => text()();
  IntColumn get durationSec => integer()();
  IntColumn get msPlayed => integer()();
  BoolColumn get completed => boolean().withDefault(const Constant(false))();
  TextColumn get source => text()(); // stream, local
  TextColumn get clientPlatform => text()();
  DateTimeColumn get playedAt => dateTime()();
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
  BoolColumn get synced => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};
}

class MutationOutbox extends Table {
  TextColumn get id => text()();
  TextColumn get kind => text()(); // pinPlay, updateSettings, addToPlaylist
  TextColumn get payloadJson => text()();
  DateTimeColumn get createdAt => dateTime().withDefault(currentDateAndTime)();
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  DateTimeColumn get nextAttemptAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

class SettingsLocal extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();
  DateTimeColumn get updatedAtUtc => dateTime().withDefault(currentDateAndTime)();
  BoolColumn get dirty => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {key};
}

class MediaCache extends Table {
  TextColumn get cacheKey => text()();
  TextColumn get json => text()();
  DateTimeColumn get fetchedAt => dateTime().withDefault(currentDateAndTime)();

  @override
  Set<Column> get primaryKey => {cacheKey};
}

class KvStore extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {key};
}
