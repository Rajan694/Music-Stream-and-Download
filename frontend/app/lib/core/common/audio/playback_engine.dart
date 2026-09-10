import 'package:flutter/foundation.dart';

enum EnginePlaybackState { playing, buffering, ready, completed }

abstract interface class PlaybackEngine {
  Stream<EnginePlaybackState> get state;
  Stream<Duration> get position;
  Stream<Duration?> get bufferedPosition;
  
  Future<void> load(
    AudioSourceSpec spec, {
    Duration? startAt,
    bool autoplay = false,
  });
  
  Future<void> play();
  Future<void> pause();
  Future<void> seek(Duration position);
  Future<void> setVolume(double volume);
  Future<void> dispose();
}

sealed class AudioSourceSpec {}

final class RemoteStream implements AudioSourceSpec {
  final String videoId;
  final String quality;
  final String ticket;
  
  RemoteStream({
    required this.videoId,
    required this.quality,
    required this.ticket,
  });
}

final class LocalFile implements AudioSourceSpec {
  final String path;
  
  LocalFile(this.path);
}

final class Unavailable implements AudioSourceSpec {
  final String reason;
  
  Unavailable(this.reason);
}
