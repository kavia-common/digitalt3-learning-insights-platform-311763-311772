class AddUserReadinessScore1700000000300 {
  name = 'AddUserReadinessScore1700000000300';

  // PUBLIC_INTERFACE
  async up(queryRunner) {
    /** Add readiness scoring fields to users table. */
    await queryRunner.query(
      'ALTER TABLE `users` ADD COLUMN `readinessScore` decimal(5,2) NOT NULL DEFAULT 0'
    );
    await queryRunner.query('ALTER TABLE `users` ADD COLUMN `readinessScoreUpdatedAt` datetime NULL');
    await queryRunner.query('ALTER TABLE `users` ADD COLUMN `readinessScoreQuizCount` int NOT NULL DEFAULT 0');
  }

  // PUBLIC_INTERFACE
  async down(queryRunner) {
    /** Remove readiness scoring fields from users table. */
    await queryRunner.query('ALTER TABLE `users` DROP COLUMN `readinessScoreQuizCount`');
    await queryRunner.query('ALTER TABLE `users` DROP COLUMN `readinessScoreUpdatedAt`');
    await queryRunner.query('ALTER TABLE `users` DROP COLUMN `readinessScore`');
  }
}

module.exports = { AddUserReadinessScore1700000000300 };
