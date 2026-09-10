import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/common/audio/queue_controller.dart';
import '../../core/common/audio/playback_controller.dart';
import '../../core/common/audio/playback_engine.dart';
import '../theme/tokens.dart';

class PlayerSheet extends ConsumerStatefulWidget {
  const PlayerSheet({super.key});

  @override
  ConsumerState<PlayerSheet> createState() => _PlayerSheetState();
}

class _PlayerSheetState extends ConsumerState<PlayerSheet> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _expandAnimation;
  late final Animation<double> _artworkScaleAnimation;
  late final Animation<double> _titleScaleAnimation;
  late final Animation<double> _controlsOpacityAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );

    _expandAnimation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
    );

    _artworkScaleAnimation = Tween<double>(begin: 48, end: 280).animate(_expandAnimation);
    _titleScaleAnimation = Tween<double>(begin: 1.0, end: 1.4).animate(_expandAnimation);
    _controlsOpacityAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: const Interval(0.5, 1.0)),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onVerticalDragUpdate(DragUpdateDetails details) {
    _controller.value -= details.primaryDelta! / MediaQuery.of(context).size.height;
  }

  void _onVerticalDragEnd(DragEndDetails details) {
    if (_controller.value > 0.5 || details.primaryVelocity! < -500) {
      _controller.forward();
    } else {
      _controller.reverse();
    }
  }

  @override
  Widget build(BuildContext context) {
    final queueState = ref.watch(queueControllerProvider);
    final current = queueState.current;

    if (current == null) return const SizedBox.shrink();

    final screenHeight = MediaQuery.of(context).size.height;
    final minHeight = 64.0;
    final maxHeight = screenHeight;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final height = minHeight + (maxHeight - minHeight) * _expandAnimation.value;
        final isExpanded = _expandAnimation.value > 0.5;

        return GestureDetector(
          onVerticalDragUpdate: _onVerticalDragUpdate,
          onVerticalDragEnd: _onVerticalDragEnd,
          onTap: isExpanded ? null : () => _controller.forward(),
          child: Container(
            height: height,
            decoration: BoxDecoration(
              color: surfaceDark1,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withAlpha(50),
                  blurRadius: 16,
                  offset: const Offset(0, -4),
                ),
              ],
            ),
            child: isExpanded ? _buildFullPlayer(current) : _buildMiniPlayer(current),
          ),
        );
      },
    );
  }

  Widget _buildMiniPlayer(dynamic current) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(radiusSm),
            child: Image.network(
              current.video.thumbnailUrl ?? '',
              width: 48,
              height: 48,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const Icon(Icons.music_note, size: 48),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  current.video.title,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  current.video.uploaderName,
                  style: const TextStyle(color: onSurfaceMutedDark, fontSize: 12),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.play_arrow),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.skip_next),
            onPressed: () => ref.read(queueControllerProvider.notifier).advance(),
          ),
        ],
      ),
    );
  }

  Widget _buildFullPlayer(dynamic current) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(
                  icon: const Icon(Icons.keyboard_arrow_down),
                  onPressed: () => _controller.reverse(),
                ),
                const Text('Now Playing', style: TextStyle(fontWeight: FontWeight.w600)),
                IconButton(
                  icon: const Icon(Icons.more_vert),
                  onPressed: () {},
                ),
              ],
            ),
            const Spacer(),
            ClipRRect(
              borderRadius: BorderRadius.circular(radiusXl),
              child: Image.network(
                current.video.thumbnailUrl ?? '',
                width: _artworkScaleAnimation.value,
                height: _artworkScaleAnimation.value,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const Icon(Icons.music_note, size: 280),
              ),
            ),
            const Spacer(),
            Text(
              current.video.title,
              style: TextStyle(
                fontSize: 20 * _titleScaleAnimation.value,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),
            Text(
              current.video.uploaderName,
              style: const TextStyle(color: onSurfaceMutedDark, fontSize: 16),
            ),
            const Spacer(),
            Opacity(
              opacity: _controlsOpacityAnimation.value,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  IconButton(
                    icon: const Icon(Icons.shuffle),
                    onPressed: () => ref.read(queueControllerProvider.notifier).toggleShuffle(),
                  ),
                  IconButton(
                    icon: const Icon(Icons.skip_previous, size: 36),
                    onPressed: () {},
                  ),
                  Container(
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: primaryColor,
                    ),
                    child: IconButton(
                      icon: const Icon(Icons.play_arrow, size: 36, color: Colors.white),
                      onPressed: () {},
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.skip_next, size: 36),
                    onPressed: () => ref.read(queueControllerProvider.notifier).advance(),
                  ),
                  IconButton(
                    icon: const Icon(Icons.repeat),
                    onPressed: () => ref.read(queueControllerProvider.notifier).toggleRepeat(),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}