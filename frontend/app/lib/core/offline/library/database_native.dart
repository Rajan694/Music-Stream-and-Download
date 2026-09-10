import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as path;
import 'dart:io';
import 'database.dart';

Future<MusicDatabase> buildDriftDatabase() async {
  final file = await _getDatabaseFile();
  return MusicDatabase(NativeDatabase(file));
}

Future<File> _getDatabaseFile() async {
  final dir = await getApplicationSupportDirectory();
  return File(path.join(dir.path, 'music_stream.db'));
}
