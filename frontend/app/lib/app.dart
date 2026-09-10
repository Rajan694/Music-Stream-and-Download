import 'dart:io';
import 'package:flutter/material.dart';
import 'package:fluent_ui/fluent_ui.dart' as fluent;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'ui/theme/material_theme.dart';
import 'ui/theme/fluent_theme.dart';
import 'routing/app_router.dart';
import 'core/common/platform/platform.dart';

class MusicStreamApp extends ConsumerWidget {
  const MusicStreamApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final capabilities = ref.read(capabilitiesProvider);
    final isWindows = capabilities.usesFluent;
    
    if (isWindows) {
      return fluent.FluentApp.router(
        title: 'Music Stream',
        theme: fluentTheme,
        routerConfig: router,
        debugShowCheckedModeBanner: false,
      );
    }
    
    return MaterialApp.router(
      title: 'Music Stream',
      theme: materialTheme,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
