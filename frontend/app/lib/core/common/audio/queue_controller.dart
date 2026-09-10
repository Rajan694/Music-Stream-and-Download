import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../online/api/media_api.dart';
import 'playback_engine.dart';
import 'playback_controller.dart';
import 'source_resolver.dart';

enum RepeatMode { off, one, all }

enum QueueSource { user, radio }

class QueueEntry {
  final VideoInfo video;
  final QueueSource source;

  QueueEntry({required this.video, required this.source});
}

final queueControllerProvider =
    StateNotifierProvider<QueueController, QueueState>((ref) {
  return QueueController(ref);
});

/// `entries` is always the *play* order, so every consumer (queue UI, advance,
/// prefetch) reads one list and needs no knowledge of shuffle.
///
/// When shuffle is on, `originalEntries` holds the pre-shuffle order so turning
/// it off restores both the order and the listener's position. An
/// index-permutation model was tried first and could not survive queue
/// mutations — add/remove/reorder left the permutation stale and out of range.
class QueueState {
  final List<QueueEntry> entries;
  final int index;
  final RepeatMode repeatMode;
  final bool shuffleEnabled;
  final List<QueueEntry>? originalEntries;

  const QueueState({
    this.entries = const [],
    this.index = 0,
    this.repeatMode = RepeatMode.off,
    this.shuffleEnabled = false,
    this.originalEntries,
  });

  QueueEntry? get current =>
      (index >= 0 && index < entries.length) ? entries[index] : null;

  QueueEntry? get next =>
      (index + 1 < entries.length) ? entries[index + 1] : null;

  QueueState copyWith({
    List<QueueEntry>? entries,
    int? index,
    RepeatMode? repeatMode,
    bool? shuffleEnabled,
    List<QueueEntry>? originalEntries,
    bool clearOriginal = false,
  }) {
    return QueueState(
      entries: entries ?? this.entries,
      index: index ?? this.index,
      repeatMode: repeatMode ?? this.repeatMode,
      shuffleEnabled: shuffleEnabled ?? this.shuffleEnabled,
      originalEntries:
          clearOriginal ? null : (originalEntries ?? this.originalEntries),
    );
  }
}

class QueueController extends StateNotifier<QueueState> {
  final Ref _ref;
  final Random _random = Random();

  int _radioGeneration = 0;
  int _loadGeneration = 0;
  bool _advancing = false;
  CancelToken? _radioCancel;

  QueueController(this._ref) : super(const QueueState());

  void setQueue(List<VideoInfo> videos, {int startIndex = 0}) {
    final entries = videos
        .map((v) => QueueEntry(video: v, source: QueueSource.user))
        .toList();

    if (entries.isEmpty) {
      state = state.copyWith(entries: entries, index: 0, clearOriginal: true);
      return;
    }

    final index = startIndex.clamp(0, entries.length - 1);

    if (state.shuffleEnabled) {
      state = state.copyWith(
        entries: _shuffledWithCurrentFirst(entries, index),
        index: 0,
        originalEntries: entries,
      );
      return;
    }

    state = state.copyWith(entries: entries, index: index, clearOriginal: true);
  }

  void addToQueue(VideoInfo video) {
    final entry = QueueEntry(video: video, source: QueueSource.user);
    state = state.copyWith(
      entries: [...state.entries, entry],
      originalEntries: state.originalEntries == null
          ? null
          : [...state.originalEntries!, entry],
    );
  }

  void playNext(VideoInfo video) {
    final entry = QueueEntry(video: video, source: QueueSource.user);
    final entries = List.of(state.entries)
      ..insert((state.index + 1).clamp(0, state.entries.length), entry);
    state = state.copyWith(
      entries: entries,
      originalEntries: state.originalEntries == null
          ? null
          : [...state.originalEntries!, entry],
    );
  }

  void removeAt(int at) {
    if (at < 0 || at >= state.entries.length) return;

    final entries = List.of(state.entries);
    final removed = entries.removeAt(at);

    // Identity, not equality: the same video may legitimately sit in the queue
    // more than once and only this instance should go.
    final original = state.originalEntries == null
        ? null
        : (List.of(state.originalEntries!)
          ..removeWhere((e) => identical(e, removed)));

    var index = state.index;
    if (at < index) {
      index--;
    } else if (at == index) {
      // Keep pointing at the slot the next track just slid into.
      index = entries.isEmpty ? 0 : index.clamp(0, entries.length - 1);
    }

    state = state.copyWith(
      entries: entries,
      index: index,
      originalEntries: original,
    );
  }

  void reorder(int oldIndex, int newIndex) {
    if (oldIndex < 0 || oldIndex >= state.entries.length) return;

    final entries = List.of(state.entries);
    // ReorderableListView reports the insertion slot before removal.
    if (newIndex > oldIndex) newIndex -= 1;
    newIndex = newIndex.clamp(0, entries.length - 1);

    final moved = entries.removeAt(oldIndex);
    entries.insert(newIndex, moved);

    var index = state.index;
    if (oldIndex == index) {
      index = newIndex;
    } else if (oldIndex < index && newIndex >= index) {
      index--;
    } else if (oldIndex > index && newIndex <= index) {
      index++;
    }

    // While shuffled, a manual drag reorders only this pass; originalEntries
    // still holds the order to restore when shuffle turns off.
    state = state.copyWith(entries: entries, index: index);
  }

  void clear() {
    _radioCancel?.cancel('queue cleared');
    state = const QueueState();
  }

  Future<void> play() async {
    final entry = state.current;
    if (entry == null) return;

    final spec = await _ref.read(sourceResolverProvider).resolve(entry.video);
    if (spec is Unavailable) return;

    await _ref.read(controllerProvider).loadAndPlay(spec);
  }

  Future<void> playAt(int at) async {
    if (at < 0 || at >= state.entries.length) return;
    state = state.copyWith(index: at);
    await play();
  }

  Future<void> advance() async {
    if (_advancing) return;
    _advancing = true;
    _loadGeneration++;
    final loadGen = _loadGeneration;

    try {
      if (state.repeatMode == RepeatMode.one) {
        final controller = _ref.read(controllerProvider);
        await controller.engine.seek(Duration.zero);
        await controller.engine.play();
        return;
      }

      if (state.entries.isEmpty) return;

      final resolver = _ref.read(sourceResolverProvider);
      var candidate = state.index + 1;
      var examined = 0;

      // Walk forward past anything that will not play (offline, no local copy)
      // rather than stalling on the first gap. `examined` bounds the walk so an
      // all-unavailable queue under repeat:all cannot spin forever.
      while (examined < state.entries.length) {
        if (candidate >= state.entries.length) {
          if (state.repeatMode != RepeatMode.all) return;
          candidate = 0;
        }

        final spec = await resolver.resolve(state.entries[candidate].video);
        if (_loadGeneration != loadGen) return;

        if (spec is! Unavailable) {
          state = state.copyWith(index: candidate);
          await _ref.read(controllerProvider).loadAndPlay(spec);
          return;
        }

        candidate++;
        examined++;
      }
    } finally {
      _advancing = false;
    }
  }

  Future<void> previous() async {
    if (state.index <= 0) return;
    await playAt(state.index - 1);
  }

  void toggleShuffle() {
    if (state.entries.isEmpty) {
      state = state.copyWith(shuffleEnabled: !state.shuffleEnabled);
      return;
    }

    if (state.shuffleEnabled) {
      final current = state.current;
      final restored = state.originalEntries ?? state.entries;
      // Restore the listener's position in the un-shuffled order, not index 0.
      final found = current == null
          ? -1
          : restored.indexWhere((e) => identical(e, current));

      state = state.copyWith(
        entries: List.of(restored),
        index: found < 0 ? 0 : found,
        shuffleEnabled: false,
        clearOriginal: true,
      );
      return;
    }

    state = state.copyWith(
      entries: _shuffledWithCurrentFirst(state.entries, state.index),
      index: 0,
      shuffleEnabled: true,
      originalEntries: List.of(state.entries),
    );
  }

  void toggleRepeat() {
    const modes = [RepeatMode.off, RepeatMode.all, RepeatMode.one];
    final next = (modes.indexOf(state.repeatMode) + 1) % modes.length;
    state = state.copyWith(repeatMode: modes[next]);
  }

  /// Appends related tracks so playback never runs dry.
  ///
  /// Uses `/media/videos/:id/suggestions` — purpose-built for this — rather
  /// than `/media/search`, which returns worse matches and burns the 60/min
  /// search budget.
  Future<void> generateAutoRadio(VideoInfo seed) async {
    _radioGeneration++;
    final gen = _radioGeneration;

    _radioCancel?.cancel('superseded by a newer radio request');
    final cancel = CancelToken();
    _radioCancel = cancel;

    try {
      final related = await _ref
          .read(mediaApiProvider)
          .getRelated(seed.videoId, cancelToken: cancel);

      // Two guards, deliberately: the generation counter drops a response that
      // lost the race, the cancel token stops the request that produced it.
      if (_radioGeneration != gen) return;

      final known = state.entries.map((e) => e.video.videoId).toSet()
        ..add(seed.videoId);

      final additions = related
          .where((v) => known.add(v.videoId))
          .take(10)
          .map((v) => QueueEntry(video: v, source: QueueSource.radio))
          .toList();

      if (additions.isEmpty) return;

      state = state.copyWith(
        entries: [...state.entries, ...additions],
        originalEntries: state.originalEntries == null
            ? null
            : [...state.originalEntries!, ...additions],
      );
    } on DioException catch (e) {
      if (e.type != DioExceptionType.cancel) rethrow;
    }
  }

  /// Fisher-Yates over everything except the playing track, which is pinned to
  /// the front so enabling shuffle never interrupts what is currently playing.
  List<QueueEntry> _shuffledWithCurrentFirst(
    List<QueueEntry> source,
    int index,
  ) {
    final rest = List.of(source);
    QueueEntry? current;
    if (index >= 0 && index < rest.length) {
      current = rest.removeAt(index);
    }

    for (var i = rest.length - 1; i > 0; i--) {
      final j = _random.nextInt(i + 1);
      final tmp = rest[i];
      rest[i] = rest[j];
      rest[j] = tmp;
    }

    return current == null ? rest : [current, ...rest];
  }

  @override
  void dispose() {
    _radioCancel?.cancel('controller disposed');
    super.dispose();
  }
}
