import 'dart:async';
import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart' as ja;
import 'package:audio_session/audio_session.dart';
import 'playback_controller.dart';
import 'playback_engine.dart';

class MediaControlsPort {
  final PlaybackController controller;
  final _metadataController = StreamController<MediaItem?>.broadcast();
  
  Stream<MediaItem?> get metadataStream => _metadataController.stream;

  MediaControlsPort({required this.controller});

  void updateMetadata(String title, String artist, String? artworkUrl) {
    final item = MediaItem(
      id: '',
      title: title,
      artist: artist,
      artUri: artworkUrl != null ? Uri.parse(artworkUrl) : null,
    );
    _metadataController.add(item);
  }

  void clearMetadata() {
    _metadataController.add(null);
  }

  Future<void> dispose() async {
    await _metadataController.close();
  }
}

class AndroidMediaControls extends BaseAudioHandler with SeekHandler {
  final PlaybackController controller;
  final ja.AudioPlayer _player;
  
  AndroidMediaControls({required this.controller, required ja.AudioPlayer player})
      : _player = player {
    _player.playbackEventStream.listen(_broadcastState);
  }

  void _broadcastState(PlaybackEvent event) {
    playbackState.add(playbackState.value.copyWith(
      controls: [
        MediaControl.skipToPrevious,
        if (_player.playing) MediaControl.pause else MediaControl.play,
        MediaControl.skipToNext,
      ],
      systemActions: const {
        MediaAction.seek,
        MediaAction.seekForward,
        MediaAction.seekBackward,
      },
      androidCompactActionIndices: const [0, 1, 2],
      processingState: const {
        ja.ProcessingState.idle: AudioProcessingState.idle,
        ja.ProcessingState.loading: AudioProcessingState.loading,
        ja.ProcessingState.buffering: AudioProcessingState.buffering,
        ja.ProcessingState.ready: AudioProcessingState.ready,
        ja.ProcessingState.completed: AudioProcessingState.completed,
      }[_player.playerState.processingState]!,
      playing: _player.playing,
      updatePosition: _player.position,
      bufferedPosition: _player.bufferedPosition,
    ));
  }

  @override
  Future<void> play() => controller.engine.play();

  @override
  Future<void> pause() => controller.engine.pause();

  @override
  Future<void> stop() async {
    await controller.engine.pause();
    await super.stop();
  }

  @override
  Future<void> seek(Duration position) => controller.engine.seek(position);

  @override
  Future<void> skipToNext() async {}

  @override
  Future<void> skipToPrevious() async {}
}