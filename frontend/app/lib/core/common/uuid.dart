import 'dart:math';

final Random _rng = Random.secure();

/// RFC 4122 version 4 UUID.
///
/// Every play event and outbox row is keyed by one of these, and the server
/// de-duplicates with `createMany({ skipDuplicates: true })`. That makes
/// uniqueness a correctness requirement, not a nicety: two events that collide
/// are silently merged into one play, and the analytics undercount.
///
/// Draws 16 random bytes rather than deriving digits from the clock — a
/// timestamp-derived generator emits identical ids for calls made within the
/// same millisecond, which is precisely the burst pattern of a sync flush.
String generateUuidV4() {
  final bytes = List<int>.generate(16, (_) => _rng.nextInt(256));

  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1

  String hex(int start, int end) => bytes
      .sublist(start, end)
      .map((b) => b.toRadixString(16).padLeft(2, '0'))
      .join();

  return '${hex(0, 4)}-${hex(4, 6)}-${hex(6, 8)}-${hex(8, 10)}-${hex(10, 16)}';
}
