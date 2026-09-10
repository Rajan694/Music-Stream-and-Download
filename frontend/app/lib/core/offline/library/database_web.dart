import 'dart:async';
import 'package:drift/drift.dart';
import 'package:drift/wasm.dart';
import 'package:drift/isolate.dart';
import 'database.dart';

Future<DriftIsolate> createDriftIsolate() async {
  final wasm = await WasmDatabase.open(
    databaseName: 'music_stream',
    sqlite3Uri: Uri.parse('sqlite3.wasm'),
    driftWorkerUri: Uri.parse('drift_worker.js'),
  );

  return DriftIsolate.inCurrent(
    () => DatabaseConnection(wasm.database),
  );
}

class WebDatabase {
  final WasmDatabase _db;
  
  WebDatabase(this._db);
  
  static Future<WebDatabase> open() async {
    final result = await WasmDatabase.open(
      databaseName: 'music_stream',
      sqlite3Uri: Uri.parse('sqlite3.wasm'),
      driftWorkerUri: Uri.parse('drift_worker.js'),
    );
    
    if (result.missingFeatures.isNotEmpty) {
      print('Warning: Drift WASM missing features: ${result.missingFeatures}');
    }
    
    return WebDatabase(result.database);
  }

  TransactionExecutor beginTransaction() => _db.beginTransaction();
  
  Stream<T> watch<T>(Query<T> query) => _db.watch(query);
  
  Future<T> run<T>(Future<T> action()) => _db.run(action);
  
  Future<void> close() => _db.close();
  
  bool get isClosed => _db.isClosed;
  
  Set<String> get missingFeatures => _db.missingFeatures;
}

@DriftDatabase(tables: [])
class WebMusicDatabase extends _$WebMusicDatabase {
  WebMusicDatabase(super.e);

  @override
  int get schemaVersion => 1;
}