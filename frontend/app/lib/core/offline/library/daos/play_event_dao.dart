import 'package:drift/drift.dart';
import '../schema.dart';
import '../database.dart';

part 'play_event_dao.g.dart';

@DriftAccessor(tables: [PlayEvents])
class PlayEventDao extends DatabaseAccessor<MusicDatabase> {
  PlayEventDao(super.db);

  Future<List<PlayEvent>> getUnsyncedEvents() =>
      (select(playEvents)..where((p) => p.synced.equals(false))).get();

  Future<void> insertPlayEvent(PlayEventsCompanion event) =>
      into(playEvents).insert(event, mode: InsertMode.ignore);

  Future<void> markEventSynced(String eventId) =>
      (update(playEvents)..where((p) => p.id.equals(eventId)))
          .write(const PlayEventsCompanion(synced: Value(true)));

  Future<void> markEventsSynced(List<String> eventIds) => batch((b) {
    for (final id in eventIds) {
      b.update(playEvents, const PlayEventsCompanion(synced: Value(true)),
          where: (p) => p.id.equals(id));
    }
  });

  Future<int> getPlayCount(String videoId) =>
      (select(playEvents)
            ..where((p) => p.videoId.equals(videoId) & p.completed.equals(true)))
          .get()
          .then((events) => events.length);

  Stream<List<PlayEvent>> watchUnsyncedEvents() =>
      (select(playEvents)..where((p) => p.synced.equals(false))).watch();
}
