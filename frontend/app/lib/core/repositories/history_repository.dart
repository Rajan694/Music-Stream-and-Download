import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:drift/drift.dart';
import '../offline/library/daos/play_event_dao.dart';
import '../offline/library/daos/mutation_outbox_dao.dart';
import '../offline/library/database.dart';
import '../online/api/dio_client.dart';
import '../common/uuid.dart';

final historyRepositoryProvider = Provider((ref) {
  return HistoryRepository(ref);
});

class HistoryRepository {
  final Ref _ref;

  HistoryRepository(this._ref);

  Future<void> recordPlay({
    required String videoId,
    required String title,
    required String uploaderName,
    required int durationSec,
    required int msPlayed,
    required bool completed,
    required String source,
    required String clientPlatform,
  }) async {
    // Mirror HistoryService.recordPlayEvents exactly: a play counts at 30s OR
    // half the track, whichever comes first. Emitting anything looser just
    // fills the outbox with rows the server will drop.
    final meetsThreshold =
        msPlayed >= 30000 || (durationSec > 0 && msPlayed >= durationSec * 500);
    if (!meetsThreshold) return;

    final db = await _ref.read(databaseProvider.future);
    final playEventDao = PlayEventDao(db);
    final outboxDao = MutationOutboxDao(db);

    final eventId = generateUuidV4();
    final playedAt = DateTime.now().toUtc();

    await playEventDao.insertPlayEvent(PlayEventsCompanion(
      id: Value(eventId),
      videoId: Value(videoId),
      title: Value(title),
      uploaderName: Value(uploaderName),
      durationSec: Value(durationSec),
      msPlayed: Value(msPlayed),
      completed: Value(completed),
      source: Value(source),
      clientPlatform: Value(clientPlatform),
      playedAt: Value(playedAt),
    ));

    // jsonEncode, not interpolation: YouTube titles routinely contain `"` and
    // `\`, which produce a malformed payload that fails to sync forever.
    await outboxDao.insertMutation(MutationOutboxCompanion(
      id: Value(generateUuidV4()),
      kind: const Value('playEvent'),
      payloadJson: Value(jsonEncode({
        'id': eventId,
        'videoId': videoId,
        'title': title,
        'uploaderName': uploaderName,
        'durationSec': durationSec,
        'msPlayed': msPlayed,
        'completed': completed,
        'source': source,
        'clientPlatform': clientPlatform,
        'playedAt': playedAt.toIso8601String(),
      })),
    ));
  }

  Future<List<Map<String, dynamic>>> getRecentPlays({int limit = 50}) async {
    final db = await _ref.read(databaseProvider.future);
    final playEventDao = PlayEventDao(db);

    final events = await playEventDao.getUnsyncedEvents();
    return events.map((e) => {
      'id': e.id,
      'videoId': e.videoId,
      'title': e.title,
      'uploaderName': e.uploaderName,
      'durationSec': e.durationSec,
      'msPlayed': e.msPlayed,
      'completed': e.completed,
      'source': e.source,
      'clientPlatform': e.clientPlatform,
      'playedAt': e.playedAt.toIso8601String(),
    }).toList();
  }
}