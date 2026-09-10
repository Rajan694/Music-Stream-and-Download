import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/dio_client.dart';

enum Reachability { online, offline }

/// `connectivity_plus` reports the *interface*, not reachability: a captive
/// portal, a dead VPN or a LAN with no route out all read as "connected", and
/// on web it wraps `navigator.onLine`, which is famously optimistic.
///
/// So the plugin is used only as a change *trigger*; every verdict is confirmed
/// by actually reaching `/health`.
final connectivityProvider = StreamProvider<Reachability>((ref) {
  final dio = ref.watch(dioProvider);
  final controller = StreamController<Reachability>();

  Timer? debounce;
  var disposed = false;
  Reachability? last;

  Future<bool> canReachApi() async {
    try {
      final res = await dio.get(
        '/health',
        options: Options(
          receiveTimeout: const Duration(seconds: 3),
          sendTimeout: const Duration(seconds: 3),
          // A 5xx still proves the network path works.
          validateStatus: (_) => true,
        ),
      );
      return res.statusCode != null;
    } on DioException {
      return false;
    }
  }

  Future<void> evaluate() async {
    if (disposed) return;
    final reachable = await canReachApi();
    if (disposed) return;

    final next = reachable ? Reachability.online : Reachability.offline;
    // Only emit transitions; the banner should not repaint on every probe.
    if (next != last) {
      last = next;
      controller.add(next);
    }
  }

  void schedule() {
    debounce?.cancel();
    debounce = Timer(const Duration(seconds: 3), evaluate);
  }

  final sub = Connectivity().onConnectivityChanged.listen((_) => schedule());

  // Slow heartbeat catches the cases the plugin never fires for: the router
  // that stays associated while the uplink is down.
  final heartbeat = Timer.periodic(const Duration(seconds: 30), (_) => evaluate());

  evaluate();

  ref.onDispose(() {
    disposed = true;
    debounce?.cancel();
    heartbeat.cancel();
    sub.cancel();
    controller.close();
  });

  return controller.stream;
});

/// Convenience for imperative callers (SourceResolver, SyncService) that need a
/// verdict now rather than a stream. Defaults to offline while the first probe
/// is still in flight so nothing optimistically hits the network.
final isOnlineProvider = Provider<bool>((ref) {
  return ref.watch(connectivityProvider).maybeWhen(
        data: (r) => r == Reachability.online,
        orElse: () => false,
      );
});
