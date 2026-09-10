import 'package:flutter/foundation.dart';

abstract interface class PlatformCapabilities {
  bool get canPickDownloadFolder;
  bool get canStoreOffline;
  bool get hasBackgroundPlayback;
  bool get usesFluent;
  String get platformName;
}

class PlatformCapabilitiesImpl implements PlatformCapabilities {
  @override
  bool get canPickDownloadFolder => !kIsWeb;

  @override
  bool get canStoreOffline => !kIsWeb;

  @override
  bool get hasBackgroundPlayback => !kIsWeb;

  @override
  bool get usesFluent => false;

  @override
  String get platformName => kIsWeb ? 'web' : 'unknown';
}
