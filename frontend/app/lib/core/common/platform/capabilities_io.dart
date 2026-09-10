import 'dart:io';
import 'package:flutter/foundation.dart';

class PlatformCapabilitiesImpl implements PlatformCapabilities {
  @override
  bool get canPickDownloadFolder => !kIsWeb;

  @override
  bool get canStoreOffline => !kIsWeb;

  @override
  bool get hasBackgroundPlayback => !kIsWeb;

  @override
  bool get usesFluent => Platform.isWindows;

  @override
  String get platformName {
    if (kIsWeb) return 'web';
    if (Platform.isAndroid) return 'android';
    if (Platform.isWindows) return 'windows';
    if (Platform.isLinux) return 'linux';
    if (Platform.isMacOS) return 'macos';
    if (Platform.isIOS) return 'ios';
    return 'unknown';
  }
}