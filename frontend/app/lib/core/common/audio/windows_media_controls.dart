import 'dart:async';
import 'package:smtc_windows/smtc_windows.dart';
import 'playback_engine.dart';

class WindowsMediaControls {
  final SMTCWindows _smtc;
  final PlaybackEngine engine;
  StreamSubscription? _stateSub;
  StreamSubscription? _positionSub;

  WindowsMediaControls({required this.engine}) : _smtc = SMTCWindows();

  Future<void> initialize() async {
    await _smtc.initialize();
    
    _stateSub = engine.state.listen((state) {
      final isPlaying = state == EnginePlaybackState.playing;
      _smtc.updatePlaybackInfo(
        playbackStatus: isPlaying
            ? SMTCPlaybackStatus.playing
            : SMTCPlaybackStatus.paused,
      );
    });

    _positionSub = engine.position.listen((position) {
      _smtc.updatePosition(position);
    });

    _smtc.onPlayPressed = () => engine.play();
    _smtc.onPausePressed = () => engine.pause();
    _smtc.onNextPressed = () {};
    _smtc.onPreviousPressed = () {};
    _smtc.onSeekPressed = (position) => engine.seek(position);
  }

  Future<void> updateMetadata({
    required String title,
    required String artist,
    String? album,
    String? artworkUrl,
  }) async {
    await _smtc.updateMetadata(
      title: title,
      artist: artist,
      album: album,
      albumArt: artworkUrl != null ? Uri.parse(artworkUrl) : null,
    );
  }

  Future<void> dispose() async {
    await _stateSub?.cancel();
    await _positionSub?.cancel();
    await _smtc.dispose();
  }
}