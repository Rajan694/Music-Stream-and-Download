import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'database.dart';
import 'database_web.dart' if (dart.library.io) 'database_native.dart';

final databaseProvider = FutureProvider<MusicDatabase>((ref) async {
  return buildDriftDatabase();
});

