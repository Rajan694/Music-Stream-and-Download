import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'dart:async';
import '../../offline/library/database.dart';
import '../../offline/library/db_provider.dart';
import '../../offline/library/daos/mutation_outbox_dao.dart';
import '../../offline/library/daos/play_event_dao.dart';
import '../api/dio_client.dart';
import 'dart:convert';

final syncServiceProvider = Provider((ref) {
  final db = ref.watch(databaseProvider);
  final dio = ref.watch(dioProvider);
  return SyncService(db.whenData((d) => d), dio);
});

class SyncService {
  final AsyncValue<MusicDatabase> _db;
  final Dio _dio;
  Timer? _periodicSync;
  bool _isSyncing = false;

  SyncService(this._db, this._dio);

  Future<void> initialize() async {
    _periodicSync = Timer.periodic(
      const Duration(seconds: 60),
      (_) => drainOutbox(),
    );
  }

  Future<void> drainOutbox() async {
    if (_isSyncing) return;
    _isSyncing = true;

    try {
      final db = await _db.when(
        data: (d) => Future.value(d),
        loading: () => Future.error('DB not loaded'),
        error: (e, st) => Future.error(e),
      );

      final outboxDao = MutationOutboxDao(db);
      final pending = await outboxDao.getPendingMutations();

      for (final mutation in pending) {
        try {
          await _processMutation(mutation, db);
          await outboxDao.deleteMutation(mutation.id);
        } catch (e) {
          await outboxDao.incrementAttempts(mutation.id);
        }
      }
    } finally {
      _isSyncing = false;
    }
  }

  Future<void> _processMutation(MutationOutbox mutation, MusicDatabase db) async {
    final payload = jsonDecode(mutation.payloadJson);

    switch (mutation.kind) {
      case 'playEvent':
        await _syncPlayEvents(payload, db);
      case 'pinPlaylist':
        // Implement playlist pin sync
        break;
      case 'updateSettings':
        // Implement settings sync
        break;
    }
  }

  Future<void> _syncPlayEvents(Map<String, dynamic> payload, MusicDatabase db) async {
    final playEventDao = PlayEventDao(db);
    final unsynced = await playEventDao.getUnsyncedEvents();

    if (unsynced.isEmpty) return;

    final events = unsynced.map((e) => {
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

    final response = await _dio.post(
      '/me/plays',
      data: {'events': events},
    );

    if (response.statusCode == 200) {
      await playEventDao.markEventsSynced(unsynced.map((e) => e.id).toList());
    }
  }

  void dispose() {
    _periodicSync?.cancel();
  }
}
