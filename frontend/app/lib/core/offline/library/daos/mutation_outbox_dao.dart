import 'package:drift/drift.dart';
import '../schema.dart';
import '../database.dart';

part 'mutation_outbox_dao.g.dart';

@DriftAccessor(tables: [MutationOutbox])
class MutationOutboxDao extends DatabaseAccessor<MusicDatabase> {
  MutationOutboxDao(super.db);

  Future<List<MutationOutbox>> getPendingMutations() =>
      (select(mutationOutbox)
            ..where((m) => m.nextAttemptAt.isSmallerOrEqualValue(DateTime.now()) |
                m.nextAttemptAt.isNull()))
          .get();

  Future<void> insertMutation(MutationOutboxCompanion mutation) =>
      into(mutationOutbox).insert(mutation);

  Future<void> incrementAttempts(String mutationId) =>
      (update(mutationOutbox)..where((m) => m.id.equals(mutationId))).write(
        MutationOutboxCompanion(
          attempts: Value(
            (select(mutationOutbox)..where((m) => m.id.equals(mutationId)))
                    .map((m) => m.attempts)
                    .first as int +
                1,
          ),
          nextAttemptAt: Value(DateTime.now().add(
            Duration(seconds: 60 << 1), // exponential backoff
          )),
        ),
      );

  Future<void> deleteMutation(String mutationId) =>
      (delete(mutationOutbox)..where((m) => m.id.equals(mutationId))).go();

  Stream<List<MutationOutbox>> watchPendingMutations() =>
      (select(mutationOutbox)
            ..where((m) => m.nextAttemptAt.isSmallerOrEqualValue(DateTime.now()) |
                m.nextAttemptAt.isNull()))
          .watch();
}
