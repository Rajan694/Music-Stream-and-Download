import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart' as ja;
import 'package:fluent_ui/fluent_ui.dart' as fluent;
import '../../core/common/audio/just_audio_engine.dart';
import '../../core/common/audio/playback_controller.dart';
import '../../core/common/platform/platform.dart';
import '../../core/common/audio/windows_media_controls.dart';
import '../../core/common/audio/android_media_controls.dart';

final engineProvider = Provider<JustAudioEngine>((ref) {
  return JustAudioEngine();
});

final controllerProvider = Provider<PlaybackController>((ref) {
  final engine = ref.watch(engineProvider);
  return PlaybackController(engine: engine);
});

final capabilitiesProvider = Provider<PlatformCapabilities>((ref) {
  return PlatformCapabilitiesImpl();
});

final mediaControlsProvider = Provider.autoDispose.family<Object?, String>((ref, platform) {
  final controller = ref.watch(controllerProvider);
  
  if (platform == 'windows') {
    final controls = WindowsMediaControls(engine: controller.engine);
    controls.initialize();
    ref.onDispose(() => controls.dispose());
    return controls;
  } else if (platform == 'android') {
    final player = ref.read(engineProvider)._player;
    final controls = AndroidMediaControls(controller: controller, player: player);
    controls.initialize();
    return controls;
  }
  
  return null;
});

class M0TestScreen extends ConsumerWidget {
  const M0TestScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.watch(controllerProvider);
    final capabilities = ref.watch(capabilitiesProvider);
    final isWindows = capabilities.usesFluent;
    
    final content = Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            'M0 Audio Engine Spike',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),
          SizedBox(height: 16),
          Text('Platform: ${capabilities.platformName}'),
          SizedBox(height: 16),
          Text('Can pick download folder: ${capabilities.canPickDownloadFolder}'),
          SizedBox(height: 16),
          Text('Uses Fluent: ${capabilities.usesFluent}'),
          SizedBox(height: 24),
          ElevatedButton(
            onPressed: () {
              // Test audio playback with a sample URL
              controller.loadAndPlay(RemoteStream(
                videoId: 'dQw4w9WgXcQ',
                quality: 'best',
                ticket: 'test-ticket',
              ));
            },
            child: const Text('Test Remote Stream Playback'),
          ),
          SizedBox(height: 8),
          ElevatedButton(
            onPressed: () => controller.engine.play(),
            child: const Text('Play'),
          ),
          SizedBox(height: 8),
          ElevatedButton(
            onPressed: () => controller.engine.pause(),
            child: const Text('Pause'),
          ),
        ],
      ),
    );

    if (isWindows) {
      return fluent.ScaffoldPage(
        content: content,
      );
    }

    return Scaffold(
      body: content,
    );
  }
}