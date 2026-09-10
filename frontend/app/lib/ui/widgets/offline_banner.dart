import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/online/connectivity_service.dart';

final isOfflineProvider = StreamProvider<bool>((ref) {
  return connectivityStream(ref);
});

Stream<bool> connectivityStream(WidgetRef ref) async* {
  await for (final connectivity in ref.watch(connectivityProvider).future) {
    yield !connectivity;
  }
}

class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isOffline = ref.watch(isOfflineProvider);

    return isOffline.when(
      data: (offline) {
        if (!offline) return const SizedBox.shrink();
        return Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
          color: const Color(0xFF06B6D4).withAlpha(30),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.cloud_off, size: 16, color: Color(0xFF06B6D4)),
              SizedBox(width: 8),
              Text(
                'Offline - Some features unavailable',
                style: TextStyle(
                  color: Color(0xFF06B6D4),
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class OfflineIndicator extends StatelessWidget {
  const OfflineIndicator({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFF06B6D4).withAlpha(30),
        borderRadius: BorderRadius.circular(4),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_off, size: 12, color: Color(0xFF06B6D4)),
          SizedBox(width: 4),
          Text(
            'Offline',
            style: TextStyle(
              color: Color(0xFF06B6D4),
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}