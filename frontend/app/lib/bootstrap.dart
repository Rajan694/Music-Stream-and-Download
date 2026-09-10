import 'dart:io';
import 'package:flutter/material.dart';
import 'package:just_audio_media_kit/just_audio_media_kit.dart';
import 'package:window_manager/window_manager.dart';
import 'package:flutter_acrylic/flutter_acrylic.dart';

Future<void> bootstrap() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  if (Platform.isWindows) {
    await JustAudioMediaKit.ensureInitialized(
      android: false,
      windows: true,
      linux: false,
      iOS: false,
      macOS: false,
    );
    
    await Window.initialize();
    await windowManager.ensureInitialized();
    
    const windowOptions = WindowOptions(
      minimumSize: Size(900, 640),
      size: Size(1280, 800),
      center: true,
      backgroundColor: Colors.transparent,
      skipTaskbar: false,
      titleBarStyle: TitleBarStyle.hidden,
    );
    
    await windowManager.waitUntilReadyToShow(windowOptions, () async {
      await windowManager.show();
      await windowManager.focus();
    });
    
    await Window.setEffect(effect: WindowEffect.mica);
  }
}
