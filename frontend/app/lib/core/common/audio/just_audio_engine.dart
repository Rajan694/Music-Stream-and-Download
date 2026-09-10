import 'dart:async';
import 'dart:io';
import 'package:just_audio/just_audio.dart' as ja;
import 'playback_engine.dart';

class JustAudioEngine implements PlaybackEngine {
  late final ja.AudioPlayer _player;
  final _stateController = StreamController<EnginePlaybackState>.broadcast();
  final _positionController = StreamController<Duration>.broadcast();
  final _bufferedController = StreamController<Duration?>.broadcast();

  JustAudioEngine() {
    _player = ja.AudioPlayer();
    _setupListeners();
  }

  void _setupListeners() {
    _player.playbackEventStream.listen((event) {
      _updateState();
      _positionController.add(_player.position);
      _bufferedController.add(_player.bufferedPosition);
    });

    _player.playerStateStream.listen((_) => _updateState());
  }

  void _updateState() {
    EnginePlaybackState state;
    switch (_player.playerState.playing) {
      case true:
        state = EnginePlaybackState.playing;
      case false:
        if (_player.playerState.processingState == ja.ProcessingState.completed) {
          state = EnginePlaybackState.completed;
        } else if (_player.playerState.processingState == ja.ProcessingState.buffering) {
          state = EnginePlaybackState.buffering;
        } else {
          state = EnginePlaybackState.ready;
        }
    }
    _stateController.add(state);
  }

  @override
  Stream<EnginePlaybackState> get state => _stateController.stream;

  @override
  Stream<Duration> get position => _positionController.stream;

  @override
  Stream<Duration?> get bufferedPosition => _bufferedController.stream;

  @override
  Future<void> load(
    AudioSourceSpec spec, {
    Duration? startAt,
    bool autoplay = false,
  }) async {
    try {
      switch (spec) {
        case RemoteStream(:final videoId, :final quality, :final ticket):
          final url = _buildStreamUrl(videoId, quality, ticket);
          await _player.setAudioSource(
            ja.AudioSource.uri(Uri.parse(url)),
            initialPosition: startAt,
          );
        case LocalFile(:final path):
          if (!File(path).existsSync()) {
            throw Exception('File not found: $path');
          }
          await _player.setAudioSource(
            ja.AudioSource.uri(Uri.file(path)),
            initialPosition: startAt,
          );
        case Unavailable(:final reason):
          throw Exception('Audio unavailable: $reason');
      }

      if (autoplay) {
        await _player.play();
      }
    } catch (e) {
      rethrow;
    }
  }

  String _buildStreamUrl(String videoId, String quality, String ticket) {
    final baseUrl = const String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:4000/api/v1');
    return '$baseUrl/media/videos/$videoId/stream?quality=$quality&sig=${ticket}';
  }

  @override
  Future<void> play() => _player.play();

  @override
  Future<void> pause() => _player.pause();

  @override
  Future<void> seek(Duration position) => _player.seek(position);

  @override
  Future<void> setVolume(double volume) => _player.setVolume(volume);

  @override
  Future<void> dispose() async {
    await _player.dispose();
    await _stateController.close();
    await _positionController.close();
    await _bufferedController.close();
  }
}
