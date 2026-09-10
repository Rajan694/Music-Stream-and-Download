import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:drift/drift.dart';
import '../offline/library/schema.dart';
import '../offline/library/database.dart';

final settingsRepositoryProvider = Provider((ref) {
  return SettingsRepository(ref);
});

class SettingsRepository {
  final Ref _ref;

  SettingsRepository(this._ref);

  Future<String?> getSetting(String key) async {
    final db = await _ref.read(databaseProvider.future);
    final result = await db.select(db.settingsLocal).get();
    final setting = result.where((s) => s.key == key).firstOrNull;
    return setting?.value;
  }

  Future<void> setSetting(String key, String value) async {
    final db = await _ref.read(databaseProvider.future);
    await db.into(db.settingsLocal).insertOnConflictUpdate(
      SettingsLocalCompanion(
        key: Value(key),
        value: Value(value),
        updatedAtUtc: Value(DateTime.now().toUtc()),
        dirty: const Value(true),
      ),
    );
  }

  Future<Map<String, String>> getAllSettings() async {
    final db = await _ref.read(databaseProvider.future);
    final results = await db.select(db.settingsLocal).get();
    return {for (var s in results) s.key: s.value};
  }

  Future<void> deleteSetting(String key) async {
    final db = await _ref.read(databaseProvider.future);
    await (delete(db.settingsLocal)..where((s) => s.key.equals(key))).go();
  }

  Future<String> getTheme() async {
    return await getSetting('theme') ?? 'system';
  }

  Future<void> setTheme(String theme) async {
    await setSetting('theme', theme);
  }

  Future<String> getStreamQuality() async {
    return await getSetting('streamQuality') ?? 'high';
  }

  Future<void> setStreamQuality(String quality) async {
    await setSetting('streamQuality', quality);
  }

  Future<String> getDefaultFormat() async {
    return await getSetting('defaultFormat') ?? 'mp3';
  }

  Future<void> setDefaultFormat(String format) async {
    await setSetting('defaultFormat', format);
  }

  Future<String?> getDownloadFolder() async {
    return await getSetting('downloadFolder');
  }

  Future<void> setDownloadFolder(String path) async {
    await setSetting('downloadFolder', path);
  }

  Stream<String?> watchTheme() async* {
    final db = await _ref.read(databaseProvider.future);
    yield* db.select(db.settingsLocal)
        .watch()
        .map((settings) => settings.where((s) => s.key == 'theme').firstOrNull?.value ?? 'system');
  }
}