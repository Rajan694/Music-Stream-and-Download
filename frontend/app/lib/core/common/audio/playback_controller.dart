import 'playback_engine.dart';
import 'just_audio_engine.dart';

final class PlaybackController {
  final PlaybackEngine engine;
  int _generation = 0;

  PlaybackController({required this.engine});

  Future<void> loadAndPlay(AudioSourceSpec spec) async {
    _generation++;
    final gen = _generation;
    
    try {
      await engine.load(spec, autoplay: true);
    } catch (e) {
      if (_generation == gen) {
        rethrow;
      }
    }
  }

  Future<void> seekToTrack(AudioSourceSpec spec, Duration position, bool wasPlaying) async {
    _generation++;
    final gen = _generation;
    
    try {
      await engine.load(spec, startAt: position, autoplay: wasPlaying);
    } catch (e) {
      if (_generation == gen) {
        rethrow;
      }
    }
  }

  Future<void> dispose() => engine.dispose();
}
