class AddLessonAiFields1700000000100 {
  name = 'AddLessonAiFields1700000000100';

  // PUBLIC_INTERFACE
  async up(queryRunner) {
    /** Add AI-generated fields to lessons: aiSummary (TEXT) and aiQuizJson (JSON). */
    await queryRunner.query('ALTER TABLE `lessons` ADD COLUMN `aiSummary` text NULL');
    await queryRunner.query('ALTER TABLE `lessons` ADD COLUMN `aiQuizJson` json NULL');
  }

  // PUBLIC_INTERFACE
  async down(queryRunner) {
    /** Remove AI-generated fields from lessons. */
    await queryRunner.query('ALTER TABLE `lessons` DROP COLUMN `aiQuizJson`');
    await queryRunner.query('ALTER TABLE `lessons` DROP COLUMN `aiSummary`');
  }
}

module.exports = { AddLessonAiFields1700000000100 };
